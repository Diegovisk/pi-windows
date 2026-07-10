/** Safe PowerShell and cmd wrappers for Git Bash. */

export const MSYS_PREFIX =
	"export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'; ";

/**
 * Escape a string for use inside PowerShell single-quoted literals.
 * @param {string} command
 */
export function escapePowerShell(command) {
	return command.replace(/'/g, "''");
}

/**
 * Wrap a command for PowerShell -NoProfile -Command.
 * @param {string} command
 * @param {{ withMsysPrefix?: boolean }} [opts]
 */
export function wrapPowerShell(command, opts = {}) {
	const withMsysPrefix = opts.withMsysPrefix !== false;
	const escaped = escapePowerShell(command.trim());
	const wrapped = `powershell -NoProfile -Command '${escaped}'`;
	return withMsysPrefix ? `${MSYS_PREFIX}${wrapped}` : wrapped;
}

/**
 * Wrap a command for cmd //c (Git Bash style).
 * @param {string} command
 * @param {{ withMsysPrefix?: boolean }} [opts]
 */
export function wrapCmd(command, opts = {}) {
	const withMsysPrefix = opts.withMsysPrefix !== false;
	const escaped = command.trim().replace(/"/g, '\\"');
	const wrapped = `cmd //c "${escaped}"`;
	return withMsysPrefix ? `${MSYS_PREFIX}${wrapped}` : wrapped;
}
