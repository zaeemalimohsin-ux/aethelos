# Open the AethelOS share URL on an Android emulator (Android Studio).
param(
    [string]$Url = "",
    [int]$WaitSeconds = 30,
    [switch]$Screenshot
)

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

function Get-Adb {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        return (Get-Command adb).Source
    }
    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
    $adb = Join-Path $sdk "platform-tools\adb.exe"
    if (-not (Test-Path $adb)) {
        throw "adb not found. Open Android Studio once and install SDK platform-tools."
    }
    return $adb
}

function Test-AndroidUiLoaded {
    param([string]$Adb)
    $patterns = @(
        "Create a new identity",
        "Create a new",
        "AethelOS",
        "Community life",
        "You've been invited",
        "Start a new community",
        "Unlock",
        "Share link",
        "Restore from recovery",
        "Join with invite link",
        "I have an invite link",
        "Community"
    )
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $temp = Join-Path $env:TEMP "aethelos-android-uidump.xml"
        if (Test-Path $temp) { Remove-Item $temp -Force -ErrorAction SilentlyContinue }
        & $Adb shell uiautomator dump /sdcard/uidump.xml 2>$null | Out-Null
        & $Adb pull /sdcard/uidump.xml $temp 2>$null | Out-Null
        if (Test-Path $temp) {
            $xml = Get-Content $temp -Raw -ErrorAction SilentlyContinue
            if ($xml) {
                foreach ($pattern in $patterns) {
                    if ($xml -match [regex]::Escape($pattern)) { return $true }
                }
            }
        }
        if ($attempt -lt 8) { Start-Sleep -Seconds 15 }
    }
    return $false
}

$adb = Get-Adb
& $adb start-server 2>$null | Out-Null
$devices = & $adb devices 2>$null | Select-String "device$"
if (-not $devices) {
    throw "No emulator running. Run scripts/start-android-emulator.ps1 first."
}

if (-not $Url) {
    $shareFile = Join-Path $Root ".share-url"
    if (Test-Path $shareFile) {
        $Url = (Get-Content $shareFile -Raw).Trim()
    } else {
        throw "No share URL. Pass -Url or run proof with a live .share-url file."
    }
}

if ($env:AETHELOS_PROOF_BUILD -eq "1") {
    # Suppress emulator system error dialogs during product proof only.
    & $adb shell settings put global hide_error_dialogs 1 2>$null | Out-Null
}
Write-Host "Opening on emulator: $Url"
& $adb shell am start -a android.intent.action.VIEW -d $Url 2>$null | Out-Null

if ($WaitSeconds -gt 0) {
    Write-Host "Waiting ${WaitSeconds}s for page load..."
    Start-Sleep -Seconds $WaitSeconds
}

$outDir = Join-Path $Root "test-results"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$timestamp = Get-Date -Format "HHmmss"
$outFile = Join-Path $outDir "android-smoke-$timestamp.png"

if (-not (Test-AndroidUiLoaded -Adb $adb)) {
    cmd.exe /c ""$adb" exec-out screencap -p > "$outFile""
    throw "Android UI assertion failed (expected onboarding or community UI). Screenshot: $outFile"
}

if ($Screenshot) {
    cmd.exe /c ""$adb" exec-out screencap -p > "$outFile""
    if (-not (Test-Path $outFile)) {
        throw "Screenshot failed"
    }
    Write-Host "Screenshot saved: $outFile"
}

Write-Host "Android smoke: PASS"
