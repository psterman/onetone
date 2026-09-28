@echo off
REM OneTone Website 本地预览启动器（双击运行）
REM 优先 python，否则用 node；自动打开浏览器

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

start "" http://localhost:%PORT%

REM 检测可用的 python（排除 Windows Store 空壳）
set USE_PY=
where python >nul 2>&1
if %errorlevel%==0 (
    python -c "import http.server" >nul 2>&1
    if %errorlevel%==0 set USE_PY=1
)

if defined USE_PY (
    echo [OneTone] 使用 python http.server
    python -m http.server %PORT%
    goto :done
)

where node >nul 2>&1
if %errorlevel%==0 (
    echo [OneTone] 未找到可用 python，改用 node
    node -e "const http=require('http');const fs=require('fs');const path=require('path');const root=process.cwd();const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.map':'application/json','.txt':'text/plain','.md':'text/markdown'};http.createServer((req,res)=>{try{let u=decodeURIComponent((req.url||'/').split('?')[0]);if(u==='/')u='/index.html';let p=path.normalize(path.join(root,u.replace(/\//g,path.sep)));if(!p.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){const idx=path.join(p,'index.html');if(fs.existsSync(idx))p=idx;else{res.writeHead(404);return res.end('Not found')}}const ext=path.extname(p).toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});fs.createReadStream(p).pipe(res)}catch(e){res.writeHead(500);res.end(String(e))}}).listen(%PORT%,'127.0.0.1',()=>console.log('http://localhost:%PORT%'));"
    goto :done
)

echo [OneTone] 错误：未找到可用的 python 或 node
echo [OneTone] 请安装 Node.js 后再双击本文件
pause
exit /b 1

:done
echo.
echo [OneTone] server 已停止，按任意键关闭窗口
pause >nul
