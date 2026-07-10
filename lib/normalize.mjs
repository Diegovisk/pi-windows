import { MSYS_PREFIX, wrapCmd, wrapPowerShell } from "./powershell.mjs";

const PS_PATTERNS = [
	/\$env:/,
	/\$_\b/,
	/\$\{/,
	/\bSelect-/,
	/\bGet-Command\b/,
	/\bGet-Service\b/,
	/\bGet-Net/,
	/\bGet-Cim/,
	/\bGet-Process\b/,
	/\bSet-/,
	/\bNew-/,
	/\bTest-Path\b/,
	/\bWrite-Output\b/,
	/\bInvoke-/,
];

const CMD_PATTERNS = [/\bfindstr\b/i, /\bwhere\s+\/[a-z]/i, /\bdir\s+\/[a-z]/i, /\bsysteminfo\b/i];

const WINDOWS_TOOL_PREFIX = /^\s*(winget|choco|sc\.exe|netsh)\b/i;

/**
 * @typedef {{ command: string, changed: boolean, reason?: string }} NormalizeResult
 */

/**
 * Normalize a bash tool command for Windows Git Bash.
 * @param {string} command
 * @returns {NormalizeResult}
 */
export function normalizeBashCommand(command) {
	if (!command || typeof command !== "string") {
		return { command: command ?? "", changed: false };
	}

	const trimmed = command.trim();
	if (!trimmed) return { command: trimmed, changed: false };

	if (isAlreadyWrapped(trimmed)) {
		return { command: ensureMsysPrefix(trimmed), changed: !trimmed.startsWith(MSYS_PREFIX.trim()) };
	}

	if (needsPowerShell(trimmed)) {
		return {
			command: wrapPowerShell(trimmed),
			changed: true,
			reason: "powershell",
		};
	}

	if (needsCmd(trimmed)) {
		return {
			command: wrapCmd(trimmed),
			changed: true,
			reason: "cmd",
		};
	}

	const pathFixed = fixWindowsPaths(trimmed);
	if (pathFixed !== trimmed) {
		return {
			command: ensureMsysPrefix(pathFixed),
			changed: true,
			reason: "path",
		};
	}

	return { command: ensureMsysPrefix(trimmed), changed: !trimmed.startsWith(MSYS_PREFIX.trim()) };
}

/**
 * @param {string} command
 */
function isAlreadyWrapped(command) {
	return (
		/^powershell\s/i.test(command) ||
		/^cmd\s/i.test(command) ||
		/\bcmd\s+\/\//i.test(command)
	);
}

/**
 * @param {string} command
 */
function needsPowerShell(command) {
	if (WINDOWS_TOOL_PREFIX.test(command)) return true;
	return PS_PATTERNS.some((re) => re.test(command));
}

/**
 * @param {string} command
 */
function needsCmd(command) {
	if (/\|\s*findstr\b/i.test(command)) return true;
	return CMD_PATTERNS.some((re) => re.test(command));
}

/**
 * Prefer forward slashes in bare Windows drive paths.
 * @param {string} command
 */
export function fixWindowsPaths(command) {
	return command.replace(/([A-Za-z]):\\([^"'`\s]+)/g, (_m, drive, rest) => {
		return `${drive}:/${rest.replace(/\\/g, "/")}`;
	});
}

/**
 * @param {string} command
 */
function ensureMsysPrefix(command) {
	if (command.includes("MSYS_NO_PATHCONV")) return command;
	if (!needsMsysGuard(command)) return command;
	return `${MSYS_PREFIX}${command}`;
}

/**
 * @param {string} command
 */
function needsMsysGuard(command) {
	return /[A-Za-z]:\\/.test(command) || /\bcmd\b/i.test(command) || /\bfindstr\b/i.test(command);
}
