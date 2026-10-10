# Start the Research Workbench from this folder (Windows).
#
# The first run installs uv, Python 3.12, and the pinned packages into this
# folder; later runs only launch. Nothing else needs to be installed first.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$uvHome = Join-Path $env:USERPROFILE '.local\bin'
$env:Path = "$uvHome;$env:Path"

function Fail($message) {
    Write-Host ''
    Write-Host "Setup stopped: $message" -ForegroundColor Red
    Write-Host 'Ask your instructor for help and include the message above.'
    # Keep a double-clicked window open so the message can be read.
    # Not when run by CI or an AI assistant, where nobody can press Enter.
    if (-not $env:CI -and -not [Console]::IsInputRedirected) { Read-Host 'Press Enter to close' }
    exit 1
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    # Download uv.exe directly: no installer script, so no execution-policy
    # or PowerShell module requirements on locked-down machines.
    Write-Host 'Installing uv (one time only)...'
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
    $zip = Join-Path ([IO.Path]::GetTempPath()) ("uv-" + [guid]::NewGuid() + '.zip')
    try {
        $ProgressPreference = 'SilentlyContinue'  # The progress bar makes downloads very slow.
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest "https://github.com/astral-sh/uv/releases/latest/download/uv-$arch-pc-windows-msvc.zip" -OutFile $zip -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $uvHome | Out-Null
        Expand-Archive $zip -DestinationPath $uvHome -Force
        $exe = Get-ChildItem $uvHome -Recurse -Filter uv.exe | Select-Object -First 1
        if (-not $exe) { throw 'uv.exe missing from download' }
        if ($exe.DirectoryName -ne $uvHome) { Copy-Item (Join-Path $exe.DirectoryName 'uv*.exe') $uvHome -Force }
    }
    catch { Fail 'could not download uv. Check your internet connection.' }
    finally { Remove-Item $zip -ErrorAction SilentlyContinue }
}

$python = '.venv\Scripts\python.exe'
$stamp = '.venv\.requirements-sha256'
$wanted = (Get-FileHash requirements-tested.txt -Algorithm SHA256).Hash.ToLower()
$current = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { '' }
if (-not (Test-Path $python) -or $current -ne $wanted) {
    Write-Host 'Preparing Python and packages (first run takes a few minutes)...'
    uv venv --quiet --clear --python 3.12 .venv
    if ($LASTEXITCODE -ne 0) { Fail 'could not create the Python environment.' }
    uv pip install --python $python -r requirements-tested.txt
    if ($LASTEXITCODE -ne 0) { Fail 'could not install packages. Check your internet connection and run this again.' }
    Set-Content -Path $stamp -Value $wanted -NoNewline
}

if (-not (Test-Path 'frontend\out\index.html')) { Fail 'the interface files are missing. Download the project again.' }

# Ignore settings inherited from an installed copy of the app.
'WORKBENCH_PROJECT_DIR', 'WORKBENCH_STATE_DIR', 'WORKBENCH_WORKSPACE_DIR', 'WORKBENCH_STATIC_DIR' |
    ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
Write-Host 'Starting the workbench. Keep this window open; close it to stop.'
& $python -m workbench @args
if ($LASTEXITCODE -ne 0) { Fail 'the workbench stopped with an error (see above).' }
