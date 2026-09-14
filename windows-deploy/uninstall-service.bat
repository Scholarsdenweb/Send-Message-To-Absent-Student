@echo off
REM ==== Remove the Windows Service (run as Administrator) ====
setlocal
set SVCNAME=AttendanceReport
set NSSM=%~dp0nssm.exe
"%NSSM%" stop %SVCNAME%
"%NSSM%" remove %SVCNAME% confirm
echo Service removed.
pause
