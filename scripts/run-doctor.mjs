import { runProbes, formatDiagnosticsReport, summarizeDiagnostics } from "../lib/probes.mjs";

const json = process.argv.includes("--json");
const results = runProbes({ extensionVersion: "1.0.0" });
const summary = summarizeDiagnostics(results);

if (json) {
	console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...summary }, null, 2));
} else {
	console.log(formatDiagnosticsReport(results));
}

process.exit(summary.failed > 0 ? 1 : 0);
