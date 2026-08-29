@echo off
REM 关闭 OneTone Website 本地预览（结束占用 8080 端口的 python 进程）

setlocal
set PORT=8080

echo [OneTone] 正在结束端口 %PORT% 上的 python 进程...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo [OneTone] 结束 PID=%%P
    taskkill /F /PID %%P >nul 2>&1
)

echo [OneTone] 完成
timeout /t 2 >nul
