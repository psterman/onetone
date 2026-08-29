@echo off
REM OneTone Website 本地预览启动器（双击运行）
REM 起 python http.server + 自动打开浏览器 + Ctrl+C 关闭

setlocal
cd /d "%~dp0"

set PORT=8080

REM 检查端口是否被占用
netstat -ano | findstr ":%PORT% " >nul 2>&1
if %errorlevel%==0 (
    echo [OneTone] 端口 %PORT% 已被占用，可能是 server 已在运行
    echo [OneTone] 直接打开 http://localhost:%PORT%
    start "" http://localhost:%PORT%
    exit /b 0
)

title OneTone Website Preview (port %PORT%)

echo.
echo  ==============================================
echo   OneTone Website 本地预览
echo  ==============================================
echo   地址  http://localhost:%PORT%
echo   关闭  Ctrl + C 后回车
echo  ==============================================
echo.

REM 浏览器（默认浏览器）
start "" http://localhost:%PORT%

REM 起 server（阻塞）
python -m http.server %PORT%

REM python 退出后清理
echo.
echo [OneTone] server 已停止，按任意键关闭窗口
pause >nul
