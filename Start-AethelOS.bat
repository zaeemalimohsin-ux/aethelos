@echo off
title AethelOS
cd /d "%~dp0"

echo.
echo Starting AethelOS...
echo   Opens the app (developer / operator launcher)
echo   For everyday use, download the installer from GitHub Releases
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-aethelos.ps1" %*
if errorlevel 1 pause
