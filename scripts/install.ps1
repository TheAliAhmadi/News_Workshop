# One-line install for Windows (PowerShell):
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/TheAliAhmadi/News_Workshop/main/scripts/install.ps1 | iex"
#
# Downloads the project to %USERPROFILE%\News_Workshop (or $env:WORKBENCH_DIR)
# and starts it. Running it again updates the program files and keeps research
# data and keys.
$ErrorActionPreference = 'Stop'
$repo = if ($env:WORKBENCH_REPO) { $env:WORKBENCH_REPO } else { 'TheAliAhmadi/News_Workshop' }
$dest = if ($env:WORKBENCH_DIR) { $env:WORKBENCH_DIR } else { Join-Path $env:USERPROFILE 'News_Workshop' }

if (Test-Path (Join-Path $dest '.git')) {
    Write-Host "$dest is a git checkout; updating with git pull."
    git -C $dest pull --ff-only
} else {
    Write-Host "Downloading the Research Workbench into $dest..."
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("workbench-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'main.zip'
    $ProgressPreference = 'SilentlyContinue'  # The progress bar makes downloads very slow.
    Invoke-WebRequest "https://github.com/$repo/archive/refs/heads/main.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath $tmp
    $source = Get-ChildItem $tmp -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item (Join-Path $source.FullName '*') $dest -Recurse -Force
    Remove-Item $tmp -Recurse -Force
}
Write-Host ''
Write-Host "Next time, start it by double-clicking start.bat in $dest"
Write-Host ''
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'start.ps1')
