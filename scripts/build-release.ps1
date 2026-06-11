# Build Windows desktop installer -> dist/releases/
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
node scripts/build-release.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
Write-Host "Done. See dist/releases/" -ForegroundColor Green
