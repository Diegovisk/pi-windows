import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * @param {string} baseName e.g. "win-doctor"
 * @param {string} text
 */
export function saveTextReport(baseName, text) {
	const outPath = path.join(os.homedir(), ".pi", `${baseName}-last.txt`);
	fs.writeFileSync(outPath, text, "utf8");
	return outPath;
}

/**
 * @param {string} baseName
 * @param {unknown} data
 */
export function saveJsonReport(baseName, data) {
	const outPath = path.join(os.homedir(), ".pi", `${baseName}-last.json`);
	fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	return outPath;
}

/**
 * Show full report in pi editor + persist to ~/.pi/{baseName}-last.txt
 * @param {import("@earendil-works/pi-coding-agent").ExtensionContext} ctx
 * @param {{ title: string, text: string, baseName: string, json?: unknown }} opts
 */
export async function showFullReport(ctx, opts) {
	const txtPath = saveTextReport(opts.baseName, opts.text);
	const paths = [txtPath];
	if (opts.json !== undefined) {
		paths.push(saveJsonReport(opts.baseName, opts.json));
	}

	const pathHint = paths.map((p) => p.replace(/\\/g, "/")).join("  |  ");

	if (ctx.hasUI) {
		ctx.ui.notify(`Saved: ${pathHint}`, "info");
		// Scrollable overlay — dismiss with Esc when done reading.
		await ctx.ui.editor(`${opts.title} (Esc to close)`, opts.text);
	} else {
		console.log(opts.text);
		console.log(`\nSaved: ${pathHint}`);
	}

	return { txtPath, paths };
}
