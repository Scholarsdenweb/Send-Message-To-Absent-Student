@echo off
REM ==== Run the app in a normal window (for testing). Ctrl+C to stop. ====
REM Once running, open http://localhost:4000 in a browser.
setlocal
cd /d "%~dp0..\backend"
node src\server.js
pause
