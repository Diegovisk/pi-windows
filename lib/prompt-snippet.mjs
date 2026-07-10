/** Windows system prompt block appended in before_agent_start. */

export const WINDOWS_PROMPT_SNIPPET = `

## Windows environment (pi-windows)

You are running on **Windows**. Pi's shell tool uses **Git Bash** (\`bash -c\`), **not** PowerShell or cmd directly.

Rules:
- Use **read**, **write**, and **edit** tools for file operations — avoid \`cat\`, \`sed\`, and \`awk\` on Windows paths.
- For Windows-only tasks, wrap commands explicitly:
  - PowerShell: \`powershell -NoProfile -Command "..."\`
  - cmd: \`cmd //c "..."\`
- Prefer forward slashes in paths: \`C:/Users/diego/...\` instead of \`C:\\Users\\diego\\...\`.
- \`winget\`, \`choco\`, and many Windows tools are **not** in Git Bash PATH — invoke via PowerShell or full path.
- \`dir /b\`, \`findstr\`, and \`systeminfo | findstr\` are **cmd** syntax — do not run them as bare bash commands.
- For process/service management on Windows, use PowerShell (\`Get-Service\`, \`Get-Process\`), not Linux \`systemctl\`.
- Linux-only tools (MiniDLNA, systemd) require WSL or a remote Linux host (e.g. Raspberry Pi via SSH).
`;

/**
 * @param {string} [basePrompt]
 */
export function appendWindowsPrompt(basePrompt) {
	return (basePrompt ?? "") + WINDOWS_PROMPT_SNIPPET;
}
