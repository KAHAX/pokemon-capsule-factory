@echo off
setlocal
cd /d "%~dp0web"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
if not exist "node_modules\vite\bin\vite.js" (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run dev -- --port 5174 --open
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Install Node.js 22 with npm, then run this file again.
echo https://nodejs.org/
pause
exit /b 1
:failed
echo Startup failed. See the error above and README.md.
pause
exit /b 1
