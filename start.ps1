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
    Read-Host 'Press Enter to close'
    exit 1
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing uv (one time only)...'
    $env:UV_INSTALL_DIR = $uvHome
    $env:UV_NO_MODIFY_PATH = '1'
    try { Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression }
    catch { Fail 'could not download uv. Check your internet connection.' }
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
