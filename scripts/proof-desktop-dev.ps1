param(

    [string]$Root = "",

    [string]$ShareFile = ""

)



$ErrorActionPreference = "Stop"

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }

Set-Location $Root



$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")

$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")

$env:Path = "$env:USERPROFILE\.cargo\bin;$machinePath;$userPath"



$env:AETHELOS_SHARE_URL_FILE = $ShareFile

$env:VITE_E2E = "1"

# Invite links use the public share URL from the store when the tunnel is ready (not localhost env).

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"

pnpm --filter @aethelos/client-tauri desktop:dev

