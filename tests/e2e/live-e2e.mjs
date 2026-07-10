import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

export async function runLiveE2E(logDir) {
	const outDir = path.join(logDir, "live");
	await mkdir(outDir, { recursive: true });

	/** @type {{ name: string, pass: boolean, message: string }[]} */
	const checks = [];

	// Standalone win-doctor.ps1 (may exit 1 when ACL probe fails on this machine)
	try {
		let out = "";
		try {
			out = execSync(
				'powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/win-doctor.ps1"',
				{ cwd: REPO_ROOT, encoding: "utf8", timeout: 120000, windowsHide: true },
			);
		} catch (err) {
			const e = /** @type {{ stdout?: string, stderr?: string }} */ (err);
			out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
		}
		const pass = /pi-windows doctor/.test(out) && /Summary:/.test(out);
		checks.push({
			name: "win-doctor.ps1",
			pass,
			message: pass ? "Doctor produced report" : out.slice(0, 200),
		});
		await writeFile(path.join(outDir, "win-doctor.stdout.log"), out, "utf8");
	} catch (err) {
		const e = /** @type {{ stdout?: string, stderr?: string, message?: string }} */ (err);
		checks.push({
			name: "win-doctor.ps1",
			pass: false,
			message: e.message ?? String(err),
		});
		await writeFile(
			path.join(outDir, "win-doctor.stderr.log"),
			`${e.stdout ?? ""}\n${e.stderr ?? ""}`,
			"utf8",
		);
	}

	// Node probes directly
	try {
		const out = execSync("node --test tests/unit/probes.test.mjs", {
			cwd: REPO_ROOT,
			encoding: "utf8",
			timeout: 60000,
			windowsHide: true,
		});
		checks.push({ name: "probes-live", pass: true, message: "probes unit passed on live machine" });
		await writeFile(path.join(outDir, "probes.stdout.log"), out, "utf8");
	} catch (err) {
		const e = /** @type {{ message?: string }} */ (err);
		checks.push({ name: "probes-live", pass: false, message: e.message ?? String(err) });
	}

	const summary = {
		checks,
		passed: checks.filter((c) => c.pass).length,
		failed: checks.filter((c) => !c.pass).length,
	};
	await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
	return { summary, outDir };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
	const root = path.join(REPO_ROOT, "tests/logs", new Date().toISOString().replace(/[:.]/g, "-"));
	const { summary } = await runLiveE2E(root);
	console.log(`Live E2E: ${summary.passed}/${summary.checks.length} passed`);
	process.exit(summary.failed > 0 ? 1 : 0);
}
