@echo off
REM ==== Install the app as a Windows Service so it auto-starts on boot ====
REM REQUIREMENTS:
REM   1. Run this file as Administrator (right-click -> Run as administrator)
REM   2. nssm.exe must be in this same folder (download from https://nssm.cc/download)
setlocal
set SVCNAME=AttendanceReport
set HERE=%~dp0
set BACKEND=%~dp0..\backend
set NSSM=%HERE%nssm.exe

if not exist "%NSSM%" (
  echo ERROR: nssm.exe not found in this folder.
  echo Download it from https://nssm.cc/download and copy nssm.exe next to this script.
  pause
  exit /b 1
)

REM Find node.exe
for /f "delims=" %%i in ('where node') do set NODEPATH=%%i
if "%NODEPATH%"=="" (
  echo ERROR: Node.js not found. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

echo Node:    %NODEPATH%
echo Backend: %BACKEND%
echo.

"%NSSM%" install %SVCNAME% "%NODEPATH%" "src\server.js"
"%NSSM%" set %SVCNAME% AppDirectory "%BACKEND%"
"%NSSM%" set %SVCNAME% Start SERVICE_AUTO_START
"%NSSM%" set %SVCNAME% AppStdout "%BACKEND%\service.log"
"%NSSM%" set %SVCNAME% AppStderr "%BACKEND%\service.log"
"%NSSM%" start %SVCNAME%

echo.
echo Opening firewall for port 4000 (so other PCs on the network can access it)...
netsh advfirewall firewall add rule name="Attendance Report 4000" dir=in action=allow protocol=TCP localport=4000

echo.
echo DONE. The service "AttendanceReport" is installed and will start on every boot.
echo   On this PC:        http://localhost:4000
echo   From another PC:   http://192.168.10.10:4000
pause
