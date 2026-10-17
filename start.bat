@echo off
rem Prompt Forge - run on your own computer (http://localhost:5173). Double-click this file.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Download it from https://nodejs.org and run this again.
  pause & exit /b 1
)
if not exist node_modules (
  echo Installing dependencies - first run only, about a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Install failed. & pause & exit /b 1 )
)
echo Starting Prompt Forge. Press Ctrl+C to stop.
call npm run dev
