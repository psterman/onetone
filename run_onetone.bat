@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "CARGO_TARGET_DIR=%~dp0src-tauri\target-release-live"

REM Bypass broken .ps1 file association entirely (cmd ShellExecute / Open-With dialog).
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_onetone.ps1" %*
exit /b %ERRORLEVEL%
