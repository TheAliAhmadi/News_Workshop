# Sign and timestamp the Windows executable and/or installer with Azure Artifact Signing.
#
# Requires a validated Public Trust identity and GitHub OIDC authentication.
# Signing establishes the publisher identity. It does not promise that every
# Windows reputation prompt or institutional policy warning disappears; SmartScreen
# reputation builds over time and managed machines may apply their own rules.
#
# Order for publication:
#   1. packaging/build_windows.ps1 -SkipInstaller
#   2. packaging/sign_windows.ps1 -Target Exe
#   3. packaging/build_windows.ps1 -InstallerOnly
#   4. packaging/sign_windows.ps1 -Target Setup
param(
    [ValidateSet('Exe', 'Setup', 'All')]
    [string]$Target = 'All'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $true

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($name in 'AZURE_SIGNING_ENDPOINT', 'AZURE_CODE_SIGNING_ACCOUNT', 'AZURE_CERTIFICATE_PROFILE') {
    if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue)) { throw "Set $name before signing." }
}

$python = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
$version = & $python -c "import sys; sys.path.insert(0, '.'); from workbench.version import VERSION; print(VERSION)"

Write-Host '==> Installing the signing tools'
if (-not (Get-Command sign -ErrorAction SilentlyContinue)) {
    dotnet tool install --global sign --version '0.9.*'
}
$env:PATH = "$env:USERPROFILE\.dotnet\tools;$env:PATH"

$exe = "dist\ResearchWorkbench\ResearchWorkbench.exe"
$setup = "dist\ResearchWorkbench-$version-Windows-x64-Setup.exe"
$targets = @()
if ($Target -eq 'Exe' -or $Target -eq 'All') { $targets += $exe }
if ($Target -eq 'Setup' -or $Target -eq 'All') { $targets += $setup }

foreach ($path in $targets) {
    if (-not (Test-Path $path)) {
        throw "Expected $path before signing ($Target)."
    }
    Write-Host "==> Signing $path"
    sign code azure-code-signing `
        --azure-code-signing-url $env:AZURE_SIGNING_ENDPOINT `
        --azure-code-signing-account $env:AZURE_CODE_SIGNING_ACCOUNT `
        --azure-code-signing-certificate-profile $env:AZURE_CERTIFICATE_PROFILE `
        --description 'Research Workbench' `
        --description-url 'https://github.com/TheAliAhmadi/News_Workshop' `
        --timestamp-url 'http://timestamp.acs.microsoft.com' `
        --file-digest SHA256 `
        $path
    if ($LASTEXITCODE -ne 0) { throw "Signing failed for $path" }
}

Write-Host '==> Verifying signatures'
foreach ($path in $targets) {
    $signature = Get-AuthenticodeSignature $path
    $signature | Format-List Status, StatusMessage, SignerCertificate
    if ($signature.Status -ne 'Valid') { throw "Invalid signature on $path" }
}
