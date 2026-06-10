@echo off
title AethelOS Multi-Person Playground
cd /d "%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm was not found on PATH. Install Node 20+ and pnpm, then try again.
  pause
  exit /b 1
)

echo.
echo Launching AethelOS multi-person playground...
echo First run may download Chromium once (~150 MB) — please wait.
echo Double-click this file anytime to open 6 test windows.
echo Pass a number as an argument for a different count, e.g. Multi-Person-Test.bat 4
echo.

if "%~1"=="" (
  call pnpm playground
) else (
  call pnpm playground -- %~1
)

if errorlevel 1 pause
