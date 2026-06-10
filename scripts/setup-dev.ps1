# One-shot dev prerequisite check (Windows). Run from repo root: .\scripts\setup-dev.ps1
$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\ms-playwright"

Write-Host "Rust:" -NoNewline
rustc --version
Write-Host "cloudflared:" -NoNewline
cloudflared --version
Write-Host "Playwright path: $env:PLAYWRIGHT_BROWSERS_PATH"

Push-Location $PSScriptRoot\..
pnpm --filter @aethelos/relay build
pnpm --filter @aethelos/client-tauri check:local-node
pnpm setup:e2e
Pop-Location

Write-Host "Dev toolchain OK."
