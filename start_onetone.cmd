@echo off
setlocal
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"
REM Use -Command + Join-Path so Windows never ShellExecute-opens the .ps1 file association.
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%~dp0'; & (Join-Path (Get-Location) 'run_onetone.ps1')"
exit /b %ERRORLEVEL%
