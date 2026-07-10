import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { probeSubagentsTempAcl } from "./lib/acl-fix.mjs";
import { normalizeBashCommand } from "./lib/normalize.mjs";
import { appendWindowsPrompt } from "./lib/prompt-snippet.mjs";
import {
	formatDiagnosticsReport,
	runProbes,
	scanSessionsForWindowsIssues,
	summarizeDiagnostics,
} from "./lib/probes.mjs";
import { showFullReport } from "./lib/report-output.mjs";

const VERSION = "1.0.1";
const PACKAGE_ROOT = path.dirname(fileURLToPath(import.meta.url));

function isWindowsEnabled() {
	return process.platform === "win32";
}

function isNormalizeEnabled() {
	return process.env.PI_WINDOWS_NORMALIZE !== "0";
}

function isPromptEnabled() {
	return process.env.PI_WINDOWS_PROMPT !== "0";
}

function getSettingsPath() {
	return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

function readSettings(): Record<string, unknown> {
	try {
		return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
	} catch {
		return {};
	}
}

function writeSettings(patch: Record<string, unknown>) {
	const current = readSettings();
	const next = { ...current, ...patch };
	fs.writeFileSync(getSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** Last doctor text for /win-last */
let lastDoctorText = "";
let lastSessionsText = "";

function getStatusSummary() {
	if (!isWindowsEnabled()) return "not Windows";
	const acl = probeSubagentsTempAcl();
	const aclTag = acl.status === "pass" ? "ACL ✓" : acl.status === "warn" ? "ACL !" : "ACL ✗";
	return `Git Bash ✓ | ${aclTag}`;
}

export default function piWindowsExtension(pi: ExtensionAPI) {
	if (!isWindowsEnabled()) {
		console.error("[pi-windows] loaded on non-Windows platform — most features inactive");
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!isWindowsEnabled()) return;
		ctx.ui.setStatus("pi-windows", getStatusSummary());

		const acl = probeSubagentsTempAcl();
		if (acl.status === "fail") {
			ctx.ui.notify(
				`pi-subagents temp dir not writable. Run /win-fix-acl (admin PowerShell).`,
				"warning",
			);
		} else if (acl.status === "warn") {
			ctx.ui.notify(`pi-subagents temp ACL recovered automatically.`, "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!isWindowsEnabled() || !isPromptEnabled()) return undefined;
		return { systemPrompt: appendWindowsPrompt(event.systemPrompt) };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isWindowsEnabled() || !isNormalizeEnabled()) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;

		const original = event.input.command;
		const result = normalizeBashCommand(original);
		if (result.changed) {
			event.input.command = result.command;
			if (ctx.hasUI && process.env.PI_WINDOWS_NORMALIZE_QUIET !== "1") {
				ctx.ui.setStatus("pi-windows", `normalized (${result.reason ?? "fix"})`);
			}
		}
		return undefined;
	});

	pi.on("user_bash", async (event) => {
		if (!isWindowsEnabled() || !isNormalizeEnabled()) return undefined;
		const local = createLocalBashOperations();
		return {
			operations: {
				exec(command, cwd, options) {
					const normalized = normalizeBashCommand(command);
					return local.exec(normalized.command, cwd, options);
				},
			},
		};
	});

	async function runDoctor(ctx: ExtensionContext) {
		const results = runProbes({ extensionVersion: VERSION });
		const report = formatDiagnosticsReport(results);
		const summary = summarizeDiagnostics(results);
		lastDoctorText = report;

		const footer = [
			"",
			"---",
			`Full text: ~/.pi/win-doctor-last.txt`,
			`JSON:      ~/.pi/win-doctor-last.json`,
			`Reopen:    /win-last`,
			`Clear UI:  /win-clear`,
		].join("\n");

		await showFullReport(ctx, {
			title: "pi-windows doctor",
			text: report + footer,
			baseName: "win-doctor",
			json: { timestamp: new Date().toISOString(), ...summary },
		});

		// Compact summary in widget (may truncate — use editor/file for full output)
		if (ctx.hasUI) {
			ctx.ui.setWidget("pi-windows-doctor", [
				"Doctor complete — full report in editor / ~/.pi/win-doctor-last.txt",
				`Summary: ${summary.passed} pass, ${summary.warned} warn, ${summary.failed} fail`,
			]);
		}
		return report;
	}

	pi.registerCommand("win-last", {
		description: "Reopen the last /win-doctor or /win-sessions report in the scrollable editor",
		handler: async (_args, ctx) => {
			const text =
				lastDoctorText ||
				(() => {
					try {
						return fs.readFileSync(path.join(os.homedir(), ".pi", "win-doctor-last.txt"), "utf8");
					} catch {
						return "";
					}
				})();
			if (!text) {
				ctx.ui.notify("No saved report — run /win-doctor first", "warning");
				return;
			}
			await ctx.ui.editor("pi-windows last report (Esc to close)", text);
		},
	});

	pi.registerCommand("win-clear", {
		description: "Clear pi-windows widgets from the screen",
		handler: async (_args, ctx) => {
			ctx.ui.setWidget("pi-windows-doctor", undefined);
			ctx.ui.setWidget("pi-windows-setup", undefined);
			ctx.ui.setWidget("pi-windows-sessions", undefined);
			ctx.ui.notify("Cleared pi-windows widgets", "info");
		},
	});

	pi.registerCommand("win-doctor", {
		description: "Run Windows environment diagnostics (bash, PATH, ACL, sessions)",
		handler: async (_args, ctx) => runDoctor(ctx),
	});

	pi.registerCommand("win-setup", {
		description: "Apply recommended Windows settings for pi (shellPath prefix, terminal hints)",
		handler: async (_args, ctx) => {
			if (!isWindowsEnabled()) {
				ctx.ui.notify("win-setup is for Windows only", "warning");
				return;
			}

			await runDoctor(ctx);

			const recommended = {
				shellCommandPrefix:
					"export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'",
			};

			const current = readSettings();
			const needsPrefix = current.shellCommandPrefix !== recommended.shellCommandPrefix;

			if (needsPrefix) {
				writeSettings(recommended);
				ctx.ui.notify("Wrote shellCommandPrefix to ~/.pi/agent/settings.json — /reload to apply", "info");
			} else {
				ctx.ui.notify("settings.json already has recommended shellCommandPrefix", "info");
			}

			const wtHint = [
				"Windows Terminal: remap Alt+Enter for pi follow-up.",
				"Add to profiles.defaults.keybindings:",
				'  { "keys": "alt+enter", "id": "pi.newline" }',
				"See: pi-coding-agent docs/terminal-setup.md",
			];
			ctx.ui.setWidget("pi-windows-setup", wtHint);
		},
	});

	pi.registerCommand("win-sessions", {
		description: "Scan pi session history for Windows-related tool failures",
		handler: async (args, ctx) => {
			const limit = Number.parseInt(args?.trim() || "15", 10) || 15;
			const hits = scanSessionsForWindowsIssues({ limit });
			if (!hits.length) {
				ctx.ui.notify("No Windows error patterns found in recent sessions", "info");
				return;
			}
			const report = [
				`Windows issues in session history (top ${hits.length})`,
				"",
				...hits.map((h) => `${h.file}:${h.line}\n  ${h.snippet}`),
				"",
				"---",
				"Full text: ~/.pi/win-sessions-last.txt",
				"Reopen:    /win-last-sessions",
				"Clear UI:  /win-clear",
			].join("\n");
			lastSessionsText = report;
			await showFullReport(ctx, {
				title: "pi-windows sessions",
				text: report,
				baseName: "win-sessions",
			});
			if (ctx.hasUI) {
				ctx.ui.setWidget("pi-windows-sessions", [
					`${hits.length} hit(s) — full report in editor / ~/.pi/win-sessions-last.txt`,
				]);
			}
		},
	});

	pi.registerCommand("win-last-sessions", {
		description: "Reopen the last /win-sessions report in the scrollable editor",
		handler: async (_args, ctx) => {
			const text =
				lastSessionsText ||
				(() => {
					try {
						return fs.readFileSync(path.join(os.homedir(), ".pi", "win-sessions-last.txt"), "utf8");
					} catch {
						return "";
					}
				})();
			if (!text) {
				ctx.ui.notify("No saved sessions report — run /win-sessions first", "warning");
				return;
			}
			await ctx.ui.editor("pi-windows sessions (Esc to close)", text);
		},
	});

	pi.registerCommand("win-fix-acl", {
		description: "Fix broken pi-subagents temp ACL (requires admin PowerShell)",
		handler: async (_args, ctx) => {
			const script = path.join(PACKAGE_ROOT, "scripts", "fix-subagents-acl.ps1");
			ctx.ui.notify(`Run elevated: powershell -File "${script}"`, "warning");
			try {
				execSync(
					`powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\\"${script.replace(/\\/g, "\\\\")}\\\"'"`,
					{ stdio: "ignore", windowsHide: true },
				);
				ctx.ui.notify("Launched elevated fix script (approve UAC if prompted)", "info");
			} catch {
				ctx.ui.notify(`Could not auto-elevate. Run manually:\n${script}`, "warning");
			}
		},
	});

	// Startup banner (stderr, like nvidia-nim)
	if (isWindowsEnabled()) {
		console.error(
			`[pi-windows] v${VERSION} — /win-doctor, /win-setup, /win-sessions, /win-fix-acl, /win-last, /win-clear` +
				` | normalize=${isNormalizeEnabled() ? "on" : "off"} prompt=${isPromptEnabled() ? "on" : "off"}`,
		);
	}
}
