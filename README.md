# pi-windows

Windows environment diagnostics, bash command normalization, and ACL remediation for [pi.dev](https://pi.dev).

## Install

### npm (recommended)

```bash
pi install npm:pi-windows@1.0.1
```

Or add to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-windows"]
}
```

### git

```bash
pi install git:github.com/Diegovisk/pi-windows@main
```

Then `/reload` in pi.

## Commands

| Command | Description |
|---------|-------------|
| `/win-doctor` | Run diagnostics (bash, PATH split, bundled tools, ACL, sessions) |
| `/win-setup` | Apply recommended `shellCommandPrefix` + terminal hints |
| `/win-sessions` | Scan session JSONL for Windows tool failures |
| `/win-last` | Reopen last doctor report in scrollable editor |
| `/win-last-sessions` | Reopen last sessions scan in editor |
| `/win-clear` | Remove pi-windows widgets from the TUI |
| `/win-fix-acl` | Launch elevated fix for pi-subagents temp ACL issues |

## What it fixes

Pi's `bash` tool runs **Git Bash**, not PowerShell. Models often emit Windows-native syntax that fails:

- `dir /b`, `findstr`, `systeminfo | findstr` → wrapped as `cmd //c`
- `Get-Service`, `$env:Path`, `winget`, `choco` → wrapped as `powershell -NoProfile -Command`
- `C:\...` paths → normalized to `C:/...` with MSYS path guards

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `PI_WINDOWS_NORMALIZE` | on | Set `0` to disable bash rewriting |
| `PI_WINDOWS_PROMPT` | on | Set `0` to disable Windows system prompt block |
| `PI_WINDOWS_NORMALIZE_QUIET` | off | Set `1` to hide normalize status updates |

## Standalone doctor

```powershell
.\scripts\win-doctor.ps1
.\scripts\win-doctor.ps1 -Json
```

## Viewing full output

The small widget above the prompt **truncates** long lines. After `/win-doctor` or `/win-sessions`:

1. **Scrollable editor** opens automatically — use arrow keys / PgUp / PgDn; press **Esc** to close.
2. **Text file** on disk: `~/.pi/win-doctor-last.txt` or `~/.pi/win-sessions-last.txt` (open in Notepad, Cursor, etc.).
3. **JSON** (doctor only): `~/.pi/win-doctor-last.json`
4. **Reopen later:** `/win-last` or `/win-last-sessions`
5. **Clear the compact widget:** `/win-clear`

Standalone doctor (outside pi):

```powershell
.\scripts\win-doctor.ps1
# or open the saved file after running /win-doctor in pi:
notepad $env:USERPROFILE\.pi\win-doctor-last.txt
```

## ACL fix (admin)

```powershell
# Elevated PowerShell
.\scripts\fix-subagents-acl.ps1
```

## Testing

```bash
npm test
npm run test:unit
npm run test:mock
npm run test:live
npm run doctor
```

Uses print mode patterns — no `--mode json` on Windows.

## Doctor output

Last report saved to `~/.pi/win-doctor-last.json`.
