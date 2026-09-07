# Build the Windows application folder and per-user installer.
#
# Signing is a separate step in sign_windows.ps1. When signing for publication,
# build the folder first, sign the executable, then build the installer and
# sign Setup.exe — see docs/publisher-signing.md.
param(
    [switch]$SkipInstaller,
    [switch]$InstallerOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
$version = & $python -c "import sys; sys.path.insert(0, '.'); from workbench.version import VERSION; print(VERSION)"
$appDir = Join-Path $root 'dist\ResearchWorkbench'
$setup = "ResearchWorkbench-$version-Windows-x64-Setup.exe"

function Build-Installer {
    Write-Host '==> Building the installer'
    $iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if (-not $iscc) {
        $iscc = Get-Item 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -ErrorAction SilentlyContinue
    }
    if (-not $iscc) { throw 'Inno Setup 6 was not found. Install it with: choco install innosetup' }

    & $iscc.Path "/DAppVersion=$version" "/DSourceDir=$appDir" "/DOutputDir=$root\dist" packaging\windows\installer.iss
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed.' }
}

if ($InstallerOnly) {
    if (-not (Test-Path $appDir)) { throw "Expected $appDir to exist before -InstallerOnly" }
    if (-not (Test-Path 'docs\student-guide.md')) { throw 'docs/student-guide.md is required by the installer.' }
    Build-Installer
    Write-Host "==> Sizes"
    '{0:N0} MB  installer' -f ((Get-Item "dist\$setup").Length / 1MB)
    Write-Host "Built dist\$setup"
    return
}

Write-Host '==> Building the interface'
if (-not (Test-Path 'frontend\out\index.html') -or $env:REBUILD_FRONTEND -eq '1') {
    Push-Location frontend
    npm ci
    npm run build
    Pop-Location
}

Write-Host '==> Collecting third-party notices'
& $python packaging\third_party_notices.py

Write-Host '==> Building the application folder'
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue
& $python -m PyInstaller --noconfirm --clean packaging\workbench.spec

if (-not (Test-Path $appDir)) { throw "Expected $appDir to exist" }

Write-Host '==> Verifying the packaged build'
# The windowed executable detaches immediately, so wait for it and keep its output.
$exe = Join-Path $appDir 'ResearchWorkbench.exe'
$report = Join-Path $root 'dist\self-test-windows.json'
$process = Start-Process -FilePath $exe -ArgumentList '--self-test' -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $report -RedirectStandardError 'dist\self-test-windows.err'
if ($process.ExitCode -ne 0) {
    Get-Content 'dist\self-test-windows.err' -ErrorAction SilentlyContinue
    throw "The packaged build failed its self test (exit code $($process.ExitCode))."
}
Get-Content $report

if (-not $SkipInstaller) {
    Build-Installer
}

Write-Host '==> Sizes'
'{0:N0} MB  application folder' -f ((Get-ChildItem $appDir -Recurse | Measure-Object Length -Sum).Sum / 1MB)
if (Test-Path "dist\$setup") {
    '{0:N0} MB  installer' -f ((Get-Item "dist\$setup").Length / 1MB)
    Write-Host "Built dist\$setup"
} else {
    Write-Host "Built $appDir (installer skipped)"
}
