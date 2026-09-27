@echo off
title Pellas IT Command - Server
cd /d "%~dp0"
echo.
echo  ============================================
echo    Pellas IT Command - starting the server
echo  ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed yet.
  echo  1. Download and install the LTS version from https://nodejs.org
  echo  2. Then double-click START-SERVER.bat again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo  First run: installing, please wait 1-3 minutes...
  call npm install --omit=dev
  if errorlevel 1 (
    echo  Install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)
rem Share on the office network / Tailscale. Change to 127.0.0.1 to allow this PC only.
set HOST=0.0.0.0
set PORT=4000
echo.
echo  Open on this PC:        http://localhost:4000
echo  Open on other devices:  http://THIS-PC-IP:4000   (see IPv4 Address below)
ipconfig | findstr /i "IPv4"
echo.
echo  If Windows Firewall asks, click "Allow access".
echo  Keep this window open. Closing it stops the server.
echo.
start "" http://localhost:4000
node server\index.js
pause
