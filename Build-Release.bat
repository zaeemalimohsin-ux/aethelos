@echo off
title AethelOS Release Build
cd /d "%~dp0"
echo Building Windows desktop installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release.ps1"
if errorlevel 1 pause
