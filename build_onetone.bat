@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM OneTone build / run launcher (bypasses broken .ps1 file association)
REM Usage:
REM   build_onetone.bat            rebuild + run
REM   build_onetone.bat compile    build only
REM   build_onetone.bat run        run newest onetone.exe (no build)

set "ROOT=%~dp0"
set "TAURI=%ROOT%src-tauri"
REM Force one output dir so IDE cargo and bat agree.
set "CARGO_TARGET_DIR=%TAURI%\target-release-live"
set "BUILD_ROOT=%CARGO_TARGET_DIR%"
set "EXE_PRIMARY=%BUILD_ROOT%\release\onetone.exe"
set "EXE_FALLBACK=%TAURI%\target\release\onetone.exe"

set "MODE=%~1"
if /I "%MODE%"=="" set "MODE=rebuild"
if /I "%MODE%"=="build" set "MODE=compile"
if /I "%MODE%"=="only" set "MODE=compile"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

if /I "%MODE%"=="run" goto :run
if /I "%MODE%"=="rebuild" goto :rebuild
if /I "%MODE%"=="compile" goto :compile

echo Unknown mode: %MODE%
echo Usage: build_onetone.bat [rebuild^|compile^|run]
pause
exit /b 1

:rebuild
echo [OneTone] Rebuild + run  (output: %EXE_PRIMARY%)
echo [OneTone] CARGO_TARGET_DIR=%CARGO_TARGET_DIR%
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%run_onetone.ps1" -Rebuild
set "EC=!ERRORLEVEL!"
if "!EC!"=="0" exit /b 0
echo.
echo [OneTone] run_onetone.ps1 failed (exit !EC!). Trying direct compile...
goto :compile

:compile
echo [OneTone] Compile only...
echo [OneTone] CARGO_TARGET_DIR=%CARGO_TARGET_DIR%

where cargo >nul 2>&1
if errorlevel 1 (
  echo ERROR: cargo not found. Install Rust: https://rustup.rs
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found.
  pause
  exit /b 1
)

echo [1/4] Stop running onetone...
taskkill /IM onetone.exe /F >nul 2>&1
taskkill /IM voice-pilot.exe /F >nul 2>&1

echo [2/4] Prepare assets...
call npm run prebuild
if errorlevel 1 goto :fail

if not exist "%TAURI%\icons\icon.ico" (
  py -3 "%ROOT%scripts\generate_onetone_icon.py"
  if errorlevel 1 goto :fail
)

echo [3/4] cargo tauri build --no-bundle ...
pushd "%TAURI%"
cargo tauri build --no-bundle -- --target-dir "%BUILD_ROOT%"
set "EC=!ERRORLEVEL!"
popd
if not "!EC!"=="0" goto :fail

call :find_exe
if not defined ONETONE_EXE goto :fail_no_exe

echo [4/4] OK
echo Output: !ONETONE_EXE!
call :copy_vosk_dlls "!ONETONE_EXE!"
exit /b 0

:run
call :find_exe
if not defined ONETONE_EXE goto :fail_no_exe

echo [OneTone] Launch: !ONETONE_EXE!
call :copy_vosk_dlls "!ONETONE_EXE!"
call :ensure_serve
for %%D in ("!ONETONE_EXE!") do set "EXE_DIR=%%~dpD"
start "" /D "!EXE_DIR!" "!ONETONE_EXE!"
echo Started. If the window is blank, wait a few seconds for frontend serve on :1420.
exit /b 0

:find_exe
set "ONETONE_EXE="
if exist "%EXE_PRIMARY%" set "ONETONE_EXE=%EXE_PRIMARY%"
if not defined ONETONE_EXE if exist "%EXE_FALLBACK%" set "ONETONE_EXE=%EXE_FALLBACK%"
if defined ONETONE_EXE exit /b 0
REM newest candidate from run_onetone.ps1 search order
for %%P in (
  "%LOCALAPPDATA%\Programs\com.onetone.app\onetone.exe"
  "%LOCALAPPDATA%\Programs\com.onetone.app\_up_\onetone.exe"
  "%LOCALAPPDATA%\Programs\onetone\onetone.exe"
  "%LOCALAPPDATA%\Programs\onetone\_up_\onetone.exe"
) do (
  if not defined ONETONE_EXE if exist %%P set "ONETONE_EXE=%%~fP"
)
exit /b 0

:copy_vosk_dlls
set "DEST=%~1"
for %%D in ("%DEST%") do set "DEST_DIR=%%~dpD"
if not exist "%TAURI%\resources\vosk" exit /b 0
for %%F in (libvosk.dll libgcc_s_seh-1.dll libstdc++-6.dll libwinpthread-1.dll) do (
  if exist "%TAURI%\resources\vosk\%%F" (
    copy /Y "%TAURI%\resources\vosk\%%F" "!DEST_DIR!" >nul 2>&1
  )
)
exit /b 0

:ensure_serve
powershell -NoProfile -Command ^
  "$p=1420; $ok=$false; try{$c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',$p,$null,$null); if($iar.AsyncWaitHandle.WaitOne(400)){$c.EndConnect($iar)|Out-Null; $ok=$true}; $c.Close()}catch{}; if(-not $ok){Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c','npm','run','serve' -WorkingDirectory '%ROOT%'; Start-Sleep -Seconds 2}"
exit /b 0

:fail_no_exe
echo.
echo ERROR: onetone.exe not found. Searched:
echo   %EXE_PRIMARY%
echo   %EXE_FALLBACK%
echo.
echo Build first: build_onetone.bat compile
goto :fail

:fail
echo.
echo *** FAILED ***
pause
exit /b 1
