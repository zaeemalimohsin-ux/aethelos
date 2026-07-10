# Bootstrap Android SDK + AethelosProof AVD for GitHub Actions windows-latest.
param(
    [string]$ApiLevel = "34"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$Root = Split-Path $PSScriptRoot -Parent
$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot

$proofAvdHome = Join-Path $Root ".android-avd"
if (-not (Test-Path $proofAvdHome)) {
    New-Item -ItemType Directory -Path $proofAvdHome -Force | Out-Null
}
$env:ANDROID_AVD_HOME = $proofAvdHome

$emuExe = Join-Path $sdkRoot "emulator\emulator.exe"
$avdDir = Join-Path $proofAvdHome "AethelosProof.avd"
if ((Test-Path $emuExe) -and (Test-Path $avdDir)) {
    Write-Host "Android SDK and AethelosProof AVD already present."
    exit 0
}

$cmdlineRoot = Join-Path $sdkRoot "cmdline-tools\latest"
$sdkmanager = Join-Path $cmdlineRoot "bin\sdkmanager.bat"
$avdmanager = Join-Path $cmdlineRoot "bin\avdmanager.bat"

if (-not (Test-Path $sdkmanager)) {
    Write-Host "Installing Android command-line tools..."
    $zip = Join-Path $env:TEMP "android-cmdline-tools.zip"
    $extractRoot = Join-Path $env:TEMP "android-cmdline-tools-extract"
    if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $extractRoot -Force
    $latestDir = Join-Path $sdkRoot "cmdline-tools\latest"
    if (Test-Path $latestDir) { Remove-Item $latestDir -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path $latestDir -Parent) -Force | Out-Null
    Move-Item (Join-Path $extractRoot "cmdline-tools") $latestDir
}

if (-not $env:JAVA_HOME) {
    $javaCandidates = @(
        "C:\Program Files\Eclipse Adoptium\jdk-17*",
        "C:\Program Files\Microsoft\jdk-17*",
        "C:\Program Files\Java\jdk-17*"
    )
    foreach ($pattern in $javaCandidates) {
        $match = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) {
            $env:JAVA_HOME = $match.FullName
            break
        }
    }
}
if ($env:JAVA_HOME) {
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

$image = "system-images;android-$ApiLevel;google_apis_playstore;x86_64"
$packages = @("platform-tools", "emulator", $image)

Write-Host "Installing Android packages: $($packages -join ', ')"
$yes = ("y`n" * 40)
$yes | & $sdkmanager --sdk_root=$sdkRoot @packages
if ($LASTEXITCODE -ne 0) { throw "sdkmanager failed with exit $LASTEXITCODE" }

if (-not (Test-Path $avdDir)) {
    Write-Host "Creating AethelosProof AVD..."
    "no`n" | & $avdmanager create avd -n AethelosProof -k $image -d pixel_6 --force
    if ($LASTEXITCODE -ne 0) { throw "avdmanager failed with exit $LASTEXITCODE" }
}

$env:Path = "$sdkRoot\platform-tools;$sdkRoot\emulator;$env:Path"
Write-Host "Android bootstrap complete."
