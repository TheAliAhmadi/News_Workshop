@echo off
rem Double-click to start the Research Workbench on Windows.
rem Started from PowerShell 7, the inherited module path stops Windows
rem PowerShell from loading its own modules; it rebuilds the default when unset.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
