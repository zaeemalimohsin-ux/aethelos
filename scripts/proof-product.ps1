# Full product proof: desktop share URL -> mobile E2E -> Android smoke -> release exe.
param(
    [switch]$SkipRelease,
    [switch]$ForceRelease,
    [switch]$SkipAndroid,
    [switch]$SkipPreflight,
    [switch]$SkipStaticGates
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$env:USERPROFILE\.cargo\bin;$machinePath;$userPath"
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
$proofAvdHome = Join-Path $Root ".android-avd"
if (-not (Test-Path $proofAvdHome)) {
    New-Item -ItemType Directory -Path $proofAvdHome -Force | Out-Null
}
$env:ANDROID_AVD_HOME = $proofAvdHome
Remove-Item Env:CI -ErrorAction SilentlyContinue
Remove-Item Env:VITE_E2E -ErrorAction SilentlyContinue
$env:CARGO_TARGET_DIR = Join-Path $Root "packages\client-tauri\src-tauri\target"
$env:AETHELOS_PROOF_BUILD = "1"

$ShareFile = Join-Path $Root ".share-url"
$Results = [ordered]@{}

function Write-StepResult {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    $Results[$Name] = if ($Detail) { "$Status ($Detail)" } else { $Status }
    $color = switch -Regex ($Status) {
        "^PASS" { "Green" }
        "^SKIP" { "Yellow" }
        default { "Red" }
    }
    $line = if ($Detail) { "$Name`: $Status - $Detail" } else { "$Name`: $Status" }
    Write-Host $line -ForegroundColor $color
}

function Test-CommandExists([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Pnpm {
    if (-not (Test-CommandExists "pnpm")) {
        if (-not (Test-CommandExists "node")) {
            throw "Node.js 20+ required (winget install OpenJS.NodeJS.LTS)"
        }
        corepack enable
        corepack prepare pnpm@9.15.0 --activate
    }
}

function Ensure-RelayBuilt {
    $relayScript = Join-Path $Root "packages\relay\dist\index.js"
    if (-not (Test-Path $relayScript)) {
        pnpm --filter @aethelos/relay build
    }
}

function Ensure-DesktopBuilt {
    $tauriDir = Join-Path $Root "packages\client-tauri\src-tauri"
    $exe = Join-Path $tauriDir "target\debug\aethelos-desktop.exe"
    $srcDir = Join-Path $tauriDir "src"
    $needsBuild = -not (Test-Path $exe)
    if (-not $needsBuild -and (Test-Path $srcDir)) {
        $exeTime = (Get-Item $exe).LastWriteTime
        $newerSrc = Get-ChildItem $srcDir -Recurse -File |
            Where-Object { $_.LastWriteTime -gt $exeTime } |
            Select-Object -First 1
        if ($newerSrc) { $needsBuild = $true }
    }
    if (-not $needsBuild) { return }
    Push-Location $tauriDir
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $null = & cargo build 2>&1
        if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit $LASTEXITCODE" }
    } finally {
        $ErrorActionPreference = $oldEap
        Pop-Location
    }
}

function Find-AethelosExe {
    $runtime = Join-Path $Root "packages\client-tauri\src-tauri\target\release\aethelos-desktop.exe"
    $relaySidecar = Join-Path $Root "packages\client-tauri\src-tauri\target\release\relay\server.cjs"
    if ((Test-Path $runtime) -and (Test-Path $relaySidecar)) { return $runtime }

    $releaseDir = Join-Path $Root "dist\releases"
    if (Test-Path $releaseDir) {
        $portable = Get-ChildItem $releaseDir -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "-setup" -and $_.Name -notmatch "_x64-setup" } |
            Select-Object -First 1
        if ($portable) { return $portable.FullName }
    }

    foreach ($p in @(
        (Join-Path $env:LOCALAPPDATA "AethelOS\AethelOS.exe"),
        (Join-Path $env:LOCALAPPDATA "org.aethelos.desktop\AethelOS.exe")
    )) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Stop-ProofProcesses {
    $proofPaths = @(
        (Join-Path $Root "packages\client-tauri\src-tauri\target"),
        (Join-Path $Root "dist\releases")
    )
    Get-Process "node", "cloudflared", "aethelos-desktop" -ErrorAction SilentlyContinue | Where-Object {
        $procPath = $_.Path
        if (-not $procPath) { return $false }
        foreach ($prefix in $proofPaths) {
            if ($procPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $true }
        }
        return $false
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process "emulator", "qemu-system-x86_64" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    if (Test-Path $ShareFile) { Remove-Item $ShareFile -Force -ErrorAction SilentlyContinue }
    foreach ($port in @(5173, 5174, 5175, 8080, 8787, 9222)) {
        try {
            $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
            foreach ($c in $conn) {
                $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
                if (-not $proc -or -not $proc.Path) { continue }
                foreach ($prefix in $proofPaths) {
                    if ($proc.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } catch {
            # Port free or NetTCPIP unavailable.
        }
    }
}

function Wait-ShareUrl {
    param(
        [int]$MaxSeconds = 600,
        [string]$ProofMode = "dev"
    )
    $env:AETHELOS_SHARE_URL_FILE = $ShareFile
    $env:AETHELOS_SHARE_URL_WAIT_MS = [string]($MaxSeconds * 1000)
    $env:AETHELOS_PROOF_MODE = $ProofMode
    $output = & node (Join-Path $Root "scripts\wait-share-url.mjs") 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output | Out-String)
    }
    $url = ($output | Select-Object -Last 1).ToString().Trim()
    if ($url -notmatch "^https://[a-z0-9-]+\.trycloudflare\.com/?$") {
        throw "Invalid share URL (expected quick tunnel): $url"
    }
    $url | Set-Content -Path $ShareFile -Encoding utf8 -NoNewline
    return $url
}

function Start-DesktopDevForProof {
    Ensure-Pnpm
    Ensure-RelayBuilt
    Ensure-DesktopBuilt
    $launcher = Join-Path $Root "scripts\proof-desktop-dev.ps1"
    return Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $launcher,
        "-Root", $Root,
        "-ShareFile", $ShareFile
    ) -PassThru -WindowStyle Minimized
}

function Start-ReleaseAppForProof {
    $exe = Find-AethelosExe
    if (-not $exe) { throw "Release exe not found" }
    $env:AETHELOS_SHARE_URL_FILE = $ShareFile
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
    return Start-Process -FilePath $exe -PassThru
}

function Invoke-ShareUrlE2E {
    param([string]$ShareUrl)
    $env:AETHELOS_SHARE_URL = $ShareUrl
    $savedCi = $env:CI
    $env:CI = "true"
    if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
        $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA "ms-playwright"
    }
    if (-not (Test-Path $env:PLAYWRIGHT_BROWSERS_PATH)) {
        pnpm --filter @aethelos/client exec playwright install chromium
    }
    try {
        pnpm --filter @aethelos/client test:e2e -- --project=share-url-mobile
        if ($LASTEXITCODE -ne 0) { throw "share-url Playwright failed" }
    } finally {
        if ($null -eq $savedCi) {
            Remove-Item Env:CI -ErrorAction SilentlyContinue
        } else {
            $env:CI = $savedCi
        }
    }
}

function Get-AdbCommand {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        return "adb"
    }
    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    $adbPath = Join-Path $sdk "platform-tools\adb.exe"
    if (-not (Test-Path $adbPath)) { return $null }
    return $adbPath
}

function Test-AndroidEmulator {
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $adbCmd = Get-AdbCommand
        if (-not $adbCmd) { return $false }
        & $adbCmd start-server 2>$null | Out-Null
        $devices = & $adbCmd devices 2>$null | Select-String "emulator-\d+\s+device"
        if (-not $devices) { return $false }
        $booted = (& $adbCmd shell getprop sys.boot_completed 2>$null | Out-String).Trim()
        $devBoot = (& $adbCmd shell getprop dev.bootcomplete 2>$null | Out-String).Trim()
        return ($booted -eq "1" -and $devBoot -eq "1")
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

function Ensure-AndroidEmulator {
    if (Test-AndroidEmulator) {
        return
    }
    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    $emu = Join-Path $sdk "emulator\emulator.exe"
    if (-not (Test-Path $emu)) {
        throw "Android SDK/emulator not installed (install Android Studio and an AVD)"
    }
    $starter = Join-Path $Root "scripts\start-android-emulator.ps1"
    if (-not (Test-Path $starter)) {
        throw "start-android-emulator.ps1 not found"
    }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $starterArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $starter, "-AvdName", "AethelosProof")
        $proc = Start-Process -FilePath powershell.exe -ArgumentList $starterArgs -PassThru -WindowStyle Hidden
        $proc | Wait-Process
        if ($proc.ExitCode -ne 0) {
            throw "Android emulator failed to boot"
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if (-not (Test-AndroidEmulator)) {
        throw "Android emulator not detected after boot"
    }
}

function Invoke-AndroidSmoke {
    param([string]$ShareUrl)
    Ensure-AndroidEmulator
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        pnpm android:smoke -- -Url $ShareUrl -WaitSeconds 120 -Screenshot
        if ($LASTEXITCODE -ne 0) { throw "android smoke failed" }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Invoke-ProofPath {
    param(
        [string]$Label,
        [scriptblock]$StartApp,
        [string]$ProofMode = "dev"
    )
    Stop-ProofProcesses
    Start-Sleep -Seconds 3

    $appProc = $null
    try {
        $appProc = & $StartApp
        $shareUrl = Wait-ShareUrl -ProofMode $ProofMode
        Write-StepResult "$Label share URL" "PASS" $shareUrl

        try {
            Invoke-ShareUrlE2E -ShareUrl $shareUrl
            Write-StepResult "$Label mobile E2E" "PASS"
        } catch {
            Write-StepResult "$Label mobile E2E" "FAIL" $_.Exception.Message
            throw
        }

        if (-not $SkipAndroid) {
            try {
                Invoke-AndroidSmoke -ShareUrl $shareUrl
                Write-StepResult "$Label Android smoke" "PASS"
            } catch {
                Write-StepResult "$Label Android smoke" "FAIL" $_.Exception.Message
                throw
            }
        }
    } catch {
        throw
    } finally {
        if ($appProc -and -not $appProc.HasExited) {
            Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue
        }
        Stop-ProofProcesses
    }
}

Write-Host ""
Write-Host "=== AethelOS product proof ===" -ForegroundColor Cyan
Write-Host ""

# --- Preflight ---
if (-not $SkipPreflight) {
    try {
        Ensure-Pnpm
        $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
        if ($nodeMajor -lt 20) { throw "Node $nodeMajor - need 20+" }
        Write-StepResult "Preflight" "PASS" "node $nodeMajor, pnpm ok"
    } catch {
        Write-StepResult "Preflight" "FAIL" $_.Exception.Message
        exit 1
    }
}

# --- Static gates ---
if (-not $SkipStaticGates) {
    foreach ($gate in @(
        @{ Name = "typecheck"; Cmd = "pnpm typecheck" },
        @{ Name = "unit tests"; Cmd = "pnpm test" },
        @{ Name = "user docs"; Cmd = "node scripts/check-user-docs.mjs" }
    )) {
        try {
            Invoke-Expression $gate.Cmd | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
            Write-StepResult $gate.Name "PASS"
        } catch {
            Write-StepResult $gate.Name "FAIL" $_.Exception.Message
            exit 1
        }
    }
}

# --- Desktop dev path ---
if (-not (Test-CommandExists "rustc")) {
    Write-StepResult "Desktop dev path" "SKIP" "rustc not installed"
} else {
    try {
        Invoke-ProofPath -Label "Desktop dev" -StartApp { Start-DesktopDevForProof } -ProofMode "dev"
    } catch {
        Write-StepResult "Desktop dev path" "FAIL" $_.Exception.Message
    }
}

# --- Release path ---
if (-not $SkipRelease) {
    Write-Host "Building release..."
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\build-release.ps1")
        if ($LASTEXITCODE -ne 0) { throw "Build-Release failed with exit $LASTEXITCODE" }
        Write-StepResult "Release build" "PASS"
    } catch {
        Write-StepResult "Release build" "FAIL" $_.Exception.Message
    }
    $exe = Find-AethelosExe

    if ($exe) {
        try {
            Invoke-ProofPath -Label "Release exe" -StartApp { Start-ReleaseAppForProof } -ProofMode "release"
        } catch {
            Write-StepResult "Release exe path" "FAIL" $_.Exception.Message
        }
    } else {
        Write-StepResult "Release exe path" "FAIL" "no exe after build"
    }
}

# --- Summary ---
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$failed = @()
foreach ($entry in $Results.GetEnumerator()) {
    $status = $entry.Value
    $color = switch -Regex ($status) {
        "^PASS" { "Green" }
        "^SKIP" { "Yellow" }
        default { "Red" }
    }
    Write-Host ("  {0,-22} {1}" -f $entry.Key, $status) -ForegroundColor $color
    if ($status -notmatch "^(PASS|SKIP)") { $failed += $entry.Key }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "PRODUCT PROOF: PASS" -ForegroundColor Green
    exit 0
}
Write-Host "PRODUCT PROOF: FAIL ($($failed.Count) step(s))" -ForegroundColor Red
exit 1
