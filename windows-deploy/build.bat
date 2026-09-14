@echo off
REM ==== Build the app on Windows: installs deps and builds the frontend ====
setlocal
cd /d "%~dp0.."

echo === Installing backend dependencies ===
cd backend
call npm install
if errorlevel 1 goto :err

echo === Installing frontend dependencies ===
cd ..\frontend
call npm install
if errorlevel 1 goto :err

echo === Building frontend (creates frontend\dist) ===
call npm run build
if errorlevel 1 goto :err

echo.
echo BUILD COMPLETE.
echo   - First time only: run seed.bat once to create the admin login.
echo   - To test now:      run start.bat
echo   - For auto-start:   run install-service.bat as Administrator
goto :done

:err
echo.
echo BUILD FAILED - see the error above.

:done
pause
