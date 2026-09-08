@echo off
start "CMA CRM API" cmd /k "cd /d %~dp0server && npm run dev"
start "CMA CRM Web" cmd /k "cd /d %~dp0client && npm run dev"
echo CRM starting...
echo Open http://localhost:5173 after both terminals are ready.
timeout /t 3 >nul
start http://localhost:5173
