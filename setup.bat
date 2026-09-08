@echo off
echo Installing CMA Sales CRM dependencies...
cd server
call npm install
cd ..\client
call npm install
cd ..
echo.
echo Setup complete. Run start.bat
pause
