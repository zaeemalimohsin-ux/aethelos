@echo off
title AethelOS
cd /d "%~dp0"

echo.
echo Starting AethelOS...
echo   Opens the app (developer / operator launcher)
echo   For everyday use, install from Build-Release.bat instead
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-aethelos.ps1" %*
if errorlevel 1 pause
