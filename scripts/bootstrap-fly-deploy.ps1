# Finish Fly.io deploy after `flyctl auth login` completes in Edge.
$ErrorActionPreference = "Stop"
$fly = "$env:LOCALAPPDATA\flyctl\flyctl.exe"
if (-not (Test-Path $fly)) { Write-Error "flyctl not found at $fly" }

& $fly auth whoami
if ($LASTEXITCODE -ne 0) { Write-Error "Fly not authenticated yet. Complete login in Edge first." }

$token = (& $fly tokens create deploy -a aethelos 2>&1 | Select-String -Pattern "FlyV1" | ForEach-Object { $_.Line })
if (-not $token) { $token = (& $fly tokens create deploy 2>&1 | Select-String -Pattern "FlyV1" | ForEach-Object { $_.Line }) }
if (-not $token) { Write-Error "Could not create Fly deploy token" }

$token | gh secret set FLY_API_TOKEN
gh workflow run deploy-fly.yml
Write-Host "FLY_API_TOKEN set; deploy-fly workflow dispatched."