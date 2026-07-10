import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBashCommand } from "../../lib/normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const CASES = [
	{
		name: "findstr",
		input: 'systeminfo | findstr /B /C:"OS Name"',
		expect: /cmd \/\/c/,
	},
	{
		name: "dir-slash-b",
		input: 'dir /b "C:\\Users\\diego"',
		expect: /cmd \/\/c/,
	},
	{
		name: "get-service",
		input: "Get-Service -Name Serviio*",
		expect: /powershell -NoProfile -Command/,
	},
	{
		name: "winget",
		input: "winget --version",
		expect: /powershell/,
	},
];

export async function runMockE2E(logDir) {
	const outDir = path.join(logDir, "mock");
	await mkdir(outDir, { recursive: true });

	/** @type {{ name: string, pass: boolean, message: string }[]} */
	const checks = [];

	for (const c of CASES) {
		const r = normalizeBashCommand(c.input);
		const pass = c.expect.test(r.command);
		checks.push({
			name: c.name,
			pass,
			message: pass ? r.command.slice(0, 120) : `expected ${c.expect}, got ${r.command}`,
		});
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
	const { summary } = await runMockE2E(root);
	console.log(`Mock E2E: ${summary.passed}/${summary.checks.length} passed`);
	process.exit(summary.failed > 0 ? 1 : 0);
}
