@echo off
REM ==== First-time only: create the initial admin user in the app database ====
REM Login is set by SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in backend\.env
setlocal
cd /d "%~dp0..\backend"
call npm run seed
pause
