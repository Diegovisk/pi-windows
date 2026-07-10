# Run standalone Windows diagnostics for pi (no pi session required).
# Usage: .\scripts\win-doctor.ps1 [-Json]

param(
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if ($Json) {
        node scripts/run-doctor.mjs --json
    } else {
        node scripts/run-doctor.mjs
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
