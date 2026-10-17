@echo off
rem Builds the optimised production version and serves it on http://localhost:4173 (this is what Vercel serves).
cd /d "%~dp0"
where node >nul 2>nul || ( echo Node.js 20 or newer is required: https://nodejs.org & pause & exit /b 1 )
if not exist node_modules ( call npm install --no-audit --no-fund || ( pause & exit /b 1 ) )
call npm run build || ( pause & exit /b 1 )
call npm run preview
