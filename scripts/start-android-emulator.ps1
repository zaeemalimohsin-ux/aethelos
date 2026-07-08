# Start the first configured Android Virtual Device (optional helper for proof runs).
param(
    [string]$AvdName = "AethelosProof"
)

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false

$Root = Split-Path $PSScriptRoot -Parent
$proofAvdHome = Join-Path $Root ".android-avd"
if (-not (Test-Path $proofAvdHome)) {
    New-Item -ItemType Directory -Path $proofAvdHome -Force | Out-Null
}
# Removed: $env:ANDROID_AVD_HOME = $proofAvdHome

function Get-EmulatorExe {
    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    $emu = Join-Path $sdk "emulator\emulator.exe"
    if (-not (Test-Path $emu)) {
        throw "emulator.exe not found. Install Android Studio and an AVD."
    }
    return $emu
}

function Get-Adb {
    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    return Join-Path $sdk "platform-tools\adb.exe"
}

function Test-DeviceReady {
    param([string]$Adb)
    & $Adb start-server 2>$null | Out-Null
    $devices = & $Adb devices 2>$null | Select-String "emulator-\d+\s+device"
    if (-not $devices) { return $false }
    try {
        $booted = (& $Adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
        $devBoot = (& $Adb shell getprop dev.bootcomplete 2>$null | Out-String).Trim()
        return ($booted -eq "1" -and $devBoot -eq "1")
    } catch {
        return $false
    }
}

$adb = Get-Adb
Get-Process emulator, qemu-system-x86_64 -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
if (Test-Path $adb) {
    if (Test-DeviceReady -Adb $adb) {
        Write-Host "Emulator already running."
        exit 0
    }
}

$emu = Get-EmulatorExe
if (-not $AvdName) {
    $list = & $emu -list-avds 2>$null
    if (-not $list -or $list.Count -eq 0) {
        throw "No AVDs configured. Create one in Android Studio Device Manager."
    }
    $AvdName = $list[0]
}

$avdDir = Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd"
$snapshotsDir = Join-Path $avdDir "snapshots"
$emuLog = Join-Path $env:TEMP "aethelos-emulator.log"
if (Test-Path $emuLog) { Remove-Item $emuLog -Force -ErrorAction SilentlyContinue }

$emuArgs = @(
    "-avd", $AvdName,
    "-no-boot-anim",
    "-no-window",
    "-partition-size", "512"
)
if (Test-Path $snapshotsDir) {
    Write-Host "Starting AVD: $AvdName (snapshot boot, headless)"
} else {
    $emuArgs += "-no-snapshot-save"
    Write-Host "Starting AVD: $AvdName (cold boot, headless, no snapshot yet)"
}

$emuProc = Start-Process -FilePath $emu -ArgumentList $emuArgs `
    -WindowStyle Minimized -PassThru `
    -RedirectStandardError $emuLog

$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
    if ($emuProc.HasExited) {
        $tail = if (Test-Path $emuLog) { Get-Content $emuLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
        throw ("Emulator exited early (code {0}). Log tail:`n{1}" -f $emuProc.ExitCode, ($tail -join "`n"))
    }
    if ((Test-Path $adb) -and (Test-DeviceReady -Adb $adb)) {
        Write-Host "Emulator ready. Configuring environment..."
        
        # Disable Chrome First-Run Experience
        & $adb shell "echo 'chrome --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
        & $adb shell am set-debug-app --persistent com.android.chrome
        
        # Grant notification permissions to avoid prompts
        & $adb shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS 2>$null
        
        # Ensure screen doesn't sleep quickly
        & $adb shell settings put system screen_off_timeout 600000 2>$null
        
        Write-Host "Environment configured."
        break
    }
    Start-Sleep -Seconds 5
}

if ($emuProc.HasExited) {
    $tail = if (Test-Path $emuLog) { Get-Content $emuLog -Tail 30 -ErrorAction SilentlyContinue } else { @() }
    throw ("Emulator did not boot within 10 minutes. Log tail:`n{0}" -f ($tail -join "`n"))
}

Write-Host "Keeping emulator task alive..."
Wait-Process -Id $emuProc.Id
