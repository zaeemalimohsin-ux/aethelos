@echo off
title AethelOS
cd /d "%~dp0"

echo.
echo Starting AethelOS...
echo   Docker mode if Docker Desktop is running
echo   Otherwise desktop app (Rust) or browser dev
echo   Pass -Lan to scripts\start-aethelos.ps1 for LAN sharing URLs
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-aethelos.ps1" %*
if errorlevel 1 pause
