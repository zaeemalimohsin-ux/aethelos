# Re-print or create the public share URL for the running Docker stack.
param(
    [switch]$Refresh
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$shareFile = Join-Path $Root ".share-url"
$cloudflared = Join-Path $Root "scripts\.bin\cloudflared.exe"

function Get-CloudflaredExe {
    if (Test-Path $cloudflared) { return $cloudflared }
    if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
        return (Get-Command cloudflared).Source
    }
    Write-Host "Fetching cloudflared..."
    node (Join-Path $Root "scripts\fetch-cloudflared.mjs")
    if (-not (Test-Path $cloudflared)) {
        Write-Error "cloudflared not available"
    }
    return $cloudflared
}

function Start-PublicTunnel {
    $exe = Get-CloudflaredExe
    $logFile = Join-Path $Root ".cloudflared.log"
    if (Test-Path $logFile) { Remove-Item $logFile -Force }

    $proc = Start-Process -FilePath $exe -ArgumentList @(
        "tunnel", "--url", "http://127.0.0.1:8080", "--no-autoupdate"
    ) -RedirectStandardOutput $logFile -RedirectStandardError $logFile -PassThru -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds(120)
    $publicUrl = $null
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $logFile) {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
                $publicUrl = $Matches[1]
                break
            }
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $publicUrl) {
        if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        Write-Error "Could not obtain a public share URL. Is Docker running on port 8080?"
    }

    $publicUrl | Set-Content -Path $shareFile -Encoding utf8 -NoNewline
    Write-Host ""
    Write-Host "=== Share this link (phone or PC) ===" -ForegroundColor Green
    Write-Host "  $publicUrl"
    Write-Host "  Open on your phone, create a community, then Invite people."
    Write-Host ""
    return $publicUrl
}

if ($Refresh -or -not (Test-Path $shareFile)) {
    Start-PublicTunnel | Out-Null
} else {
    $url = Get-Content $shareFile -Raw
    Write-Host ""
    Write-Host "=== Share link ===" -ForegroundColor Green
    Write-Host "  $url"
    Write-Host "  (Run with -Refresh to get a new URL)"
    Write-Host ""
}
