import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Create a directory and verify it is accessible (pi-subagents pattern).
 * @param {string} dirPath
 */
export function ensureAccessibleDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
	try {
		fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
		return { ok: true, recovered: false };
	} catch {
		try {
			fs.rmSync(dirPath, { recursive: true, force: true });
		} catch {
			// Best effort cleanup.
		}
		fs.mkdirSync(dirPath, { recursive: true });
		fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
		return { ok: true, recovered: true };
	}
}

/**
 * @returns {string}
 */
export function getSubagentsTempRoot() {
	const user = os.userInfo().username;
	return path.join(os.tmpdir(), `pi-subagents-user-${user}`);
}

/**
 * Probe pi-subagents temp directory writability.
 */
export function probeSubagentsTempAcl() {
	const root = getSubagentsTempRoot();
	const probeDir = path.join(root, "async-subagent-results");
	const probeFile = path.join(probeDir, ".pi-windows-probe");

	try {
		const result = ensureAccessibleDir(probeDir);
		fs.writeFileSync(probeFile, "ok", "utf8");
		fs.unlinkSync(probeFile);
		return {
			status: result.recovered ? "warn" : "pass",
			message: result.recovered
				? `Recovered broken ACL on ${probeDir}`
				: `Writable: ${probeDir}`,
			path: probeDir,
		};
	} catch (err) {
		return {
			status: "fail",
			message: `Cannot write to ${probeDir}: ${err instanceof Error ? err.message : String(err)}`,
			path: probeDir,
		};
	}
}

/**
 * @param {string} scriptPath
 */
export function getAclFixScriptPath(scriptPath) {
	return scriptPath;
}
