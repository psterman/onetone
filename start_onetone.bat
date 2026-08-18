@echo off
REM Quick launch — no rebuild. Finds onetone.exe and starts frontend serve.
cd /d "%~dp0"
call "%~dp0build_onetone.bat" run
exit /b %ERRORLEVEL%
