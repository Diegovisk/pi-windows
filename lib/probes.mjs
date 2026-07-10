import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { probeSubagentsTempAcl } from "./acl-fix.mjs";

/** @typedef {"pass"|"warn"|"fail"} ProbeStatus */
/** @typedef {{ id: string, name: string, status: ProbeStatus, message: string, details?: Record<string, unknown> }} DiagnosticResult */

const GIT_BASH_CANDIDATES = [
	"C:\\Program Files\\Git\\bin\\bash.exe",
	"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
];

const PATH_SPLIT_TOOLS = ["gh", "node", "python", "python3", "winget"];

/**
 * @param {string} p
 */
function exists(p) {
	try {
		fs.accessSync(p, fs.constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} cmd
 * @param {{ timeout?: number }} [opts]
 */
function tryExec(cmd, opts = {}) {
	try {
		const out = execSync(cmd, {
			encoding: "utf8",
			timeout: opts.timeout ?? 8000,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		return { ok: true, output: out.trim() };
	} catch (err) {
		const e = /** @type {{ stdout?: string, stderr?: string, message?: string }} */ (err);
		return {
			ok: false,
			output: `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`.trim(),
		};
	}
}

/**
 * Resolve bash the same way pi core does (simplified).
 */
export function resolveBashPath(settingsShellPath) {
	if (settingsShellPath && exists(settingsShellPath)) {
		return { path: settingsShellPath, source: "settings.shellPath" };
	}
	for (const candidate of GIT_BASH_CANDIDATES) {
		if (exists(candidate)) return { path: candidate, source: "git-bash-default" };
	}
	const where = tryExec("where.exe bash.exe");
	if (where.ok && where.output) {
		const first = where.output.split(/\r?\n/)[0]?.trim();
		if (first && exists(first)) return { path: first, source: "PATH" };
	}
	return { path: null, source: "not-found" };
}

/**
 * @param {string} bashPath
 * @param {string} command
 */
export function runInBash(bashPath, command) {
	return tryExec(`"${bashPath}" -lc ${JSON.stringify(command)}`);
}

/**
 * @param {{ settingsPath?: string, piHome?: string, extensionVersion?: string }} [opts]
 * @returns {DiagnosticResult[]}
 */
export function runProbes(opts = {}) {
	const piHome = opts.piHome ?? path.join(os.homedir(), ".pi");
	const agentDir = path.join(piHome, "agent");
	const settingsPath = opts.settingsPath ?? path.join(agentDir, "settings.json");
	const sessionsDir = path.join(agentDir, "sessions");
	const binDir = path.join(agentDir, "bin");

	/** @type {DiagnosticResult[]} */
	const results = [];

	// Platform
	results.push({
		id: "platform",
		name: "Platform",
		status: process.platform === "win32" ? "pass" : "warn",
		message:
			process.platform === "win32"
				? `win32 (${os.release()})`
				: `Not Windows (${process.platform}) — pi-windows probes are Windows-focused`,
	});

	// Settings
	let settings = {};
	if (exists(settingsPath)) {
		try {
			settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
			results.push({
				id: "settings",
				name: "Pi settings",
				status: "pass",
				message: `Loaded ${settingsPath}`,
			});
		} catch (err) {
			results.push({
				id: "settings",
				name: "Pi settings",
				status: "fail",
				message: `Cannot parse settings.json: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	} else {
		results.push({
			id: "settings",
			name: "Pi settings",
			status: "warn",
			message: `Not found: ${settingsPath}`,
		});
	}

	// Bash
	const bash = resolveBashPath(/** @type {string|undefined} */ (settings.shellPath));
	if (bash.path) {
		const isLegacyWsl =
			bash.path.toLowerCase().includes("system32\\bash.exe") ||
			bash.path.toLowerCase().includes("system32/bash.exe");
		const shellProbe = runInBash(bash.path, "echo $MSYSTEM; uname -s");
		results.push({
			id: "bash",
			name: "Git Bash",
			status: isLegacyWsl ? "warn" : shellProbe.ok ? "pass" : "fail",
			message: `${bash.path} (${bash.source})${shellProbe.ok ? ` — ${shellProbe.output.replace(/\n/g, ", ")}` : ` — probe failed: ${shellProbe.output}`}`,
			details: { isLegacyWsl },
		});
	} else {
		results.push({
			id: "bash",
			name: "Git Bash",
			status: "fail",
			message: "No bash.exe found — install Git for Windows or set shellPath in settings.json",
		});
	}

	// Bundled tools
	for (const tool of ["rg.exe", "fd.exe"]) {
		const toolPath = path.join(binDir, tool);
		if (exists(toolPath)) {
			const probe = tryExec(`"${toolPath}" --version`);
			results.push({
				id: `bundled-${tool}`,
				name: `Bundled ${tool}`,
				status: probe.ok ? "pass" : "warn",
				message: probe.ok ? probe.output.split(/\r?\n/)[0] ?? toolPath : probe.output,
			});
		} else {
			results.push({
				id: `bundled-${tool}`,
				name: `Bundled ${tool}`,
				status: "warn",
				message: `Missing ${toolPath} (pi downloads on first use)`,
			});
		}
	}

	// PATH split
	if (bash.path) {
		/** @type {string[]} */
		const split = [];
		for (const tool of PATH_SPLIT_TOOLS) {
			const inBash = runInBash(bash.path, `command -v ${tool} 2>/dev/null || which ${tool} 2>/dev/null || true`);
			const inPs = tryExec(
				`powershell -NoProfile -Command "if (Get-Command ${tool} -ErrorAction SilentlyContinue) { (Get-Command ${tool}).Source }"`,
			);
			const bashHit = inBash.ok && inBash.output && !inBash.output.includes("not found");
			const psHit = inPs.ok && inPs.output.length > 0;
			if (psHit && !bashHit) split.push(tool);
		}
		results.push({
			id: "path-split",
			name: "PATH split (PS only)",
			status: split.length ? "warn" : "pass",
			message: split.length
				? `Visible in PowerShell but not Git Bash: ${split.join(", ")}`
				: "Common tools visible in both shells",
			details: { split },
		});
	}

	// pi-subagents ACL
	const acl = probeSubagentsTempAcl();
	results.push({
		id: "subagents-acl",
		name: "pi-subagents temp ACL",
		status: acl.status,
		message: acl.message,
		details: { path: acl.path },
	});

	// Sessions
	if (exists(sessionsDir)) {
		const buckets = fs.readdirSync(sessionsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
		let sessionCount = 0;
		for (const bucket of buckets) {
			const files = fs.readdirSync(path.join(sessionsDir, bucket.name)).filter((f) => f.endsWith(".jsonl"));
			sessionCount += files.length;
		}
		results.push({
			id: "sessions",
			name: "Session storage",
			status: "pass",
			message: `${sessionCount} session(s) in ${buckets.length} cwd bucket(s)`,
			details: {
				sessionsDir,
				buckets: buckets.map((b) => b.name),
			},
		});
	} else {
		results.push({
			id: "sessions",
			name: "Session storage",
			status: "warn",
			message: `Not found: ${sessionsDir}`,
		});
	}

	// Windows Terminal keybindings (best effort)
	const wtSettings = path.join(
		os.homedir(),
		"AppData",
		"Local",
		"Packages",
		"Microsoft.WindowsTerminal_8wekyb3d8bbwe",
		"LocalState",
		"settings.json",
	);
	if (exists(wtSettings)) {
		try {
			const raw = fs.readFileSync(wtSettings, "utf8");
			const hasAltEnter = raw.includes('"alt+enter"') || raw.includes('"alt+Enter"');
			results.push({
				id: "wt-keys",
				name: "Windows Terminal keys",
				status: hasAltEnter ? "pass" : "warn",
				message: hasAltEnter
					? "Alt+Enter remap found in settings.json"
					: "Consider remapping Alt+Enter for pi follow-up (see pi terminal-setup.md)",
			});
		} catch {
			results.push({
				id: "wt-keys",
				name: "Windows Terminal keys",
				status: "warn",
				message: "Could not read Windows Terminal settings.json",
			});
		}
	} else {
		results.push({
			id: "wt-keys",
			name: "Windows Terminal keys",
			status: "warn",
			message: "Windows Terminal settings.json not found (optional)",
		});
	}

	// Extension self-report
	results.push({
		id: "pi-windows",
		name: "pi-windows extension",
		status: "pass",
		message: `v${opts.extensionVersion ?? "1.0.0"} loaded`,
		details: {
			normalize: process.env.PI_WINDOWS_NORMALIZE !== "0",
			prompt: process.env.PI_WINDOWS_PROMPT !== "0",
		},
	});

	return results;
}

/**
 * @param {DiagnosticResult[]} results
 */
export function summarizeDiagnostics(results) {
	const passed = results.filter((r) => r.status === "pass").length;
	const warned = results.filter((r) => r.status === "warn").length;
	const failed = results.filter((r) => r.status === "fail").length;
	return { passed, warned, failed, results, ok: failed === 0 };
}

/**
 * @param {DiagnosticResult[]} results
 */
export function formatDiagnosticsReport(results) {
	const lines = ["pi-windows doctor", "================", ""];
	for (const r of results) {
		const tag = r.status === "pass" ? "PASS" : r.status === "warn" ? "WARN" : "FAIL";
		lines.push(`[${tag}] ${r.name}: ${r.message}`);
	}
	lines.push("");
	const s = summarizeDiagnostics(results);
	lines.push(`Summary: ${s.passed} pass, ${s.warned} warn, ${s.failed} fail`);
	return lines.join("\n");
}

/**
 * Scan session JSONL files for Windows error patterns.
 * @param {{ sessionsDir?: string, limit?: number }} [opts]
 */
export function scanSessionsForWindowsIssues(opts = {}) {
	const sessionsDir =
		opts.sessionsDir ?? path.join(os.homedir(), ".pi", "agent", "sessions");
	const limit = opts.limit ?? 20;
	const patterns = [
		/mangled/i,
		/findstr/i,
		/command not found/i,
		/não é reconhecido/i,
		/is not recognized/i,
		/cannot access '\/[a-z]/i,
	];

	/** @type {{ file: string, line: number, snippet: string }[]} */
	const hits = [];

	if (!exists(sessionsDir)) return hits;

	const buckets = fs.readdirSync(sessionsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
	for (const bucket of buckets) {
		const bucketPath = path.join(sessionsDir, bucket.name);
		const files = fs
			.readdirSync(bucketPath)
			.filter((f) => f.endsWith(".jsonl"))
			.sort()
			.reverse();
		for (const file of files) {
			const filePath = path.join(bucketPath, file);
			const content = fs.readFileSync(filePath, "utf8");
			const lines = content.split(/\r?\n/);
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (!line.includes("toolResult") && !line.includes("assistant")) continue;
				if (!patterns.some((re) => re.test(line))) continue;
				const snippet = line.length > 200 ? `${line.slice(0, 200)}…` : line;
				hits.push({ file: `${bucket.name}/${file}`, line: i + 1, snippet });
				if (hits.length >= limit) return hits;
			}
		}
	}
	return hits;
}
