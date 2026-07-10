# Start the AethelosProof AVD for product proof (headless, host adb keys).
param(
    [string]$AvdName = "AethelosProof"
)

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false

$bootLock = Join-Path $env:TEMP "aethelos-emulator-boot.lock"
if (Test-Path $bootLock) {
    $lockAge = (Get-Date) - (Get-Item $bootLock).LastWriteTime
    if ($lockAge.TotalMinutes -lt 15) {
        throw "Another emulator boot is already in progress"
    }
    Remove-Item $bootLock -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType File -Path $bootLock -Force | Out-Null

try {
    $Root = Split-Path $PSScriptRoot -Parent
    $proofAvdHome = Join-Path $Root ".android-avd"
    if (-not (Test-Path $proofAvdHome)) {
        New-Item -ItemType Directory -Path $proofAvdHome -Force | Out-Null
    }
    $env:ANDROID_AVD_HOME = $proofAvdHome
    $androidKeysDir = Join-Path $env:USERPROFILE ".android"
    $env:ADB_VENDOR_KEYS = $androidKeysDir

    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    $adb = Join-Path $sdk "platform-tools\adb.exe"
    $emu = Join-Path $sdk "emulator\emulator.exe"
    if (-not (Test-Path $emu)) {
        throw "emulator.exe not found. Install Android Studio and an AVD."
    }

    $keyFile = Join-Path $androidKeysDir "adbkey"
    if (-not (Test-Path $keyFile) -and (Test-Path $adb)) {
        & $adb keygen $keyFile 2>$null | Out-Null
    }
    if (Test-Path $keyFile) {
        $env:ADBKEY = (Get-Content $keyFile -Raw).Trim()
    }
    $pubFile = Join-Path $androidKeysDir "adbkey.pub"
    if (Test-Path $pubFile) {
        $env:ADBKEY_PUB = (Get-Content $pubFile -Raw).Trim()
    }

    if (Test-Path $adb) {
        & $adb start-server 2>$null | Out-Null
        $ready = & $adb devices 2>$null | Select-String "emulator-\d+\s+device"
        if ($ready) {
            $booted = (& $adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
            if ($booted -eq "1") {
                Write-Host "Emulator already running."
                return
            }
        }
    }

    Get-Process emulator, qemu-system-x86_64, qemu-system-x86_64-headless -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $avdDir = Join-Path $proofAvdHome "$AvdName.avd"
    if (-not (Test-Path $avdDir)) {
        $avdDir = Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd"
    }
    if (Test-Path $avdDir) {
        Get-ChildItem $avdDir -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "*.lock" } |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    $initializedMarker = Join-Path $proofAvdHome ".adb-initialized"
    $emuArgs = @(
        "-avd", $AvdName,
        "-no-boot-anim",
        "-no-window",
        "-skip-adb-auth",
        "-partition-size", "512"
    )
    if ($env:GITHUB_ACTIONS -eq "true") {
        $emuArgs += @("-gpu", "swiftshader_indirect", "-no-snapshot-save")
    }
    if (-not (Test-Path $initializedMarker)) {
        $emuArgs += "-wipe-data"
        Write-Host "First boot: wiping AVD data to seed host adb keys"
    }
    if (-not (Test-Path (Join-Path $avdDir "snapshots"))) {
        $emuArgs += "-no-snapshot-save"
        Write-Host "Starting AVD: $AvdName (cold boot, headless)"
    } else {
        Write-Host "Starting AVD: $AvdName (snapshot boot, headless)"
    }

    $emuLog = Join-Path $env:TEMP "aethelos-emulator.log"
    if (Test-Path $emuLog) { Remove-Item $emuLog -Force -ErrorAction SilentlyContinue }

    $emuProc = Start-Process -FilePath $emu -ArgumentList $emuArgs `
        -WindowStyle Minimized -PassThru `
        -RedirectStandardError $emuLog

    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
        if ($emuProc.HasExited) {
            $tail = if (Test-Path $emuLog) { Get-Content $emuLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
            throw ("Emulator exited early (code {0}). Log tail:`n{1}" -f $emuProc.ExitCode, ($tail -join "`n"))
        }
        if (Test-Path $adb) {
            $devices = & $adb devices 2>$null | Select-String "emulator-\d+\s+device"
            if ($devices) {
                $booted = (& $adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
                $devBoot = (& $adb shell getprop dev.bootcomplete 2>$null | Out-String).Trim()
                if ($booted -eq "1" -and $devBoot -eq "1") {
                    Write-Host "Emulator ready. Configuring environment..."
                    & $adb shell "echo 'chrome --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line" 2>$null
                    & $adb shell am set-debug-app --persistent com.android.chrome 2>$null
                    & $adb shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS 2>$null
                    & $adb shell settings put system screen_off_timeout 600000 2>$null
                    if (-not (Test-Path $initializedMarker)) {
                        New-Item -ItemType File -Path $initializedMarker -Force | Out-Null
                    }
                    Write-Host "Emulator boot complete."
                    return
                }
            }
        }
        Start-Sleep -Seconds 5
    }

    $tail = if (Test-Path $emuLog) { Get-Content $emuLog -Tail 30 -ErrorAction SilentlyContinue } else { @() }
    throw ("Emulator did not boot within 10 minutes. Log tail:`n{0}" -f ($tail -join "`n"))
} finally {
    Remove-Item $bootLock -Force -ErrorAction SilentlyContinue
}
