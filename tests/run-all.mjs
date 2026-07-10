import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLiveE2E } from "./e2e/live-e2e.mjs";
import { runMockE2E } from "./e2e/mock-e2e.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function timestampDir() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function gitSha() {
	try {
		return execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
	} catch {
		return "unknown";
	}
}

export async function runAllTiers(logDir) {
	const root = logDir ?? path.join(REPO_ROOT, "tests/logs", timestampDir());
	await mkdir(root, { recursive: true });

	await writeFile(
		path.join(root, "manifest.json"),
		JSON.stringify({ timestamp: new Date().toISOString(), gitSha: gitSha(), logDir: root }, null, 2),
		"utf8",
	);

	// Unit
	const unitDir = path.join(root, "unit");
	await mkdir(unitDir, { recursive: true });
	let unitOk = true;
	let unitOutput = "";
	try {
		unitOutput = execSync(
			"node --test tests/unit/normalize.test.mjs tests/unit/probes.test.mjs",
			{
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		},
		);
	} catch (err) {
		unitOk = false;
		const e = /** @type {{ stdout?: string, stderr?: string, message?: string }} */ (err);
		unitOutput = `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`;
	}
	await writeFile(path.join(unitDir, "output.log"), unitOutput, "utf8");

	const mock = await runMockE2E(root);
	const live = await runLiveE2E(root);

	const summary = {
		unitOk,
		mock: mock.summary,
		live: live.summary,
		passed:
			(unitOk ? 1 : 0) +
			mock.summary.passed +
			live.summary.passed,
		failed:
			(unitOk ? 0 : 1) +
			mock.summary.failed +
			live.summary.failed,
	};
	await writeFile(path.join(root, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
	return { root, summary };
}

const isMain =
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
	const { summary, root } = await runAllTiers();
	console.log(`\npi-windows test harness complete`);
	console.log(`Logs: ${root}`);
	console.log(`Unit: ${summary.unitOk ? "PASS" : "FAIL"}`);
	console.log(`Mock: ${summary.mock.passed}/${summary.mock.checks.length}`);
	console.log(`Live: ${summary.live.passed}/${summary.live.checks.length}`);
	process.exit(summary.failed > 0 ? 1 : 0);
}
