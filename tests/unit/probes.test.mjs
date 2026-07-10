import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProbes, summarizeDiagnostics } from "../../lib/probes.mjs";

describe("runProbes", () => {
	it("returns platform probe on Windows", () => {
		const results = runProbes({ extensionVersion: "test" });
		assert.ok(results.length > 0);
		const platform = results.find((r) => r.id === "platform");
		assert.ok(platform);
		assert.ok(["pass", "warn", "fail"].includes(platform.status));
	});

	it("includes pi-windows self report", () => {
		const results = runProbes({ extensionVersion: "test" });
		const self = results.find((r) => r.id === "pi-windows");
		assert.ok(self);
		assert.equal(self.status, "pass");
	});

	it("summarizeDiagnostics counts statuses", () => {
		const results = runProbes();
		const s = summarizeDiagnostics(results);
		assert.equal(s.results.length, results.length);
		assert.equal(s.passed + s.warned + s.failed, results.length);
	});
});
