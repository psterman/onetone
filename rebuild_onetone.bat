@echo off
cd /d "%~dp0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_onetone.ps1" -Rebuild
exit /b %ERRORLEVEL%
