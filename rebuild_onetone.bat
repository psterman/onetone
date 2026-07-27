@echo off
setlocal
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"
REM Avoid "Open with .ps1" dialog: never ShellExecute the script file.
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%~dp0'; & (Join-Path (Get-Location) 'run_onetone.ps1') -Rebuild"
exit /b %ERRORLEVEL%
