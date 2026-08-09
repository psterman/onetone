@echo off
setlocal
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"
REM Bypass .ps1 association — use -File, never ShellExecute the script.
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_onetone.ps1"
exit /b %ERRORLEVEL%
