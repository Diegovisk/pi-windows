# Run in elevated PowerShell (Run as Administrator).
# Fixes pi-subagents temp dir with null/broken NTFS ACL on Windows.

param()

$ErrorActionPreference = 'Stop'
$user = [System.Environment]::UserName
$root = Join-Path $env:LOCALAPPDATA "Temp\pi-subagents-user-$user"
$broken = Join-Path $root 'async-subagent-results'

if (-not (Test-Path -LiteralPath $root)) {
    Write-Host "Nothing to fix: $root does not exist."
    exit 0
}

$principal = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = [Security.Principal.WindowsPrincipal]$principal
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Re-run this script in an elevated PowerShell (Run as Administrator)."
}

Write-Host "Fixing ACL on: $broken"

& takeown.exe /F $broken /A /R /D Y
if ($LASTEXITCODE -ne 0) { Write-Warning "takeown returned $LASTEXITCODE (continuing)" }

& icacls.exe $broken /setowner "*S-1-5-32-544" /C
& icacls.exe $broken /grant:r "*S-1-5-32-544:(OI)(CI)F" /C
& icacls.exe $broken /grant:r "*S-1-5-18:(OI)(CI)F" /C

try {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('O:BAG:BA D:(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)')
    Set-Acl -LiteralPath $broken -AclObject $acl
} catch {
    Write-Warning "Set-Acl fallback failed: $($_.Exception.Message)"
}

Remove-Item -LiteralPath $root -Recurse -Force
Write-Host "Removed $root"
Write-Host "Done."
