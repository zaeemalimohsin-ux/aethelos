# Publisher deploy — Docker stack on port 8080 (internal; not the regular user path).
param(
    [switch]$Lan
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker required for publisher deploy. Regular users: Start-AethelOS.bat"
}

$envPath = Join-Path $Root ".env.docker"
@(
    "# Publisher deploy"
    "VITE_DEFAULT_RELAY_URL="
    "VITE_BOOTSTRAP_RELAYS="
    "VITE_INVITE_BASE_URL="
) | Set-Content -Path $envPath -Encoding utf8

Write-Host "Starting publisher stack on http://localhost:8080 ..."
docker compose --env-file .env.docker up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Start-Sleep -Seconds 4

if (-not $Lan) {
    & (Join-Path $Root "scripts\share-public.ps1")
}

Start-Process "http://localhost:8080"
Write-Host ""
Write-Host "Publisher stack running. Point your permanent domain here."
Write-Host "See docs/PUBLISHER.md for TLS and named tunnel setup."
Write-Host "Stop: docker compose down"
