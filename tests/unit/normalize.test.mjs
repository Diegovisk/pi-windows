import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBashCommand, fixWindowsPaths } from "../../lib/normalize.mjs";
import { wrapCmd, wrapPowerShell } from "../../lib/powershell.mjs";

describe("normalizeBashCommand", () => {
	it("wraps findstr in cmd", () => {
		const r = normalizeBashCommand('systeminfo | findstr /B /C:"OS"');
		assert.equal(r.changed, true);
		assert.match(r.command, /cmd \/\/c/);
		assert.match(r.command, /findstr/i);
	});

	it("wraps dir /b in cmd", () => {
		const r = normalizeBashCommand('dir /b "C:\\Users\\diego"');
		assert.equal(r.changed, true);
		assert.match(r.command, /cmd \/\/c/);
	});

	it("wraps PowerShell Get-Service", () => {
		const r = normalizeBashCommand("Get-Service -Name 'Serviio*'");
		assert.equal(r.changed, true);
		assert.match(r.command, /powershell -NoProfile -Command/);
	});

	it("wraps winget", () => {
		const r = normalizeBashCommand("winget install EclipseAdoptium.Temurin.17.JDK");
		assert.equal(r.changed, true);
		assert.match(r.command, /powershell/);
	});

	it("does not double-wrap powershell", () => {
		const cmd = 'powershell -NoProfile -Command "Get-Date"';
		const r = normalizeBashCommand(cmd);
		assert.match(r.command, /^powershell/i);
		assert.doesNotMatch(r.command, /powershell.*powershell/i);
	});

	it("fixes backslash paths", () => {
		const r = normalizeBashCommand("ls C:\\Users\\diego\\.pi");
		assert.match(r.command, /C:\/Users\/diego\/\.pi/);
	});
});

describe("fixWindowsPaths", () => {
	it("converts drive paths", () => {
		assert.equal(fixWindowsPaths("C:\\Users\\diego"), "C:/Users/diego");
	});
});

describe("wrapPowerShell", () => {
	it("escapes single quotes", () => {
		const w = wrapPowerShell("Write-Output 'hi'");
		assert.match(w, /''/);
	});
});

describe("wrapCmd", () => {
	it("uses cmd //c", () => {
		const w = wrapCmd("echo hello");
		assert.match(w, /cmd \/\/c/);
	});
});
