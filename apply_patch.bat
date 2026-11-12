@echo off
setlocal
title Antigravity Overview Hub Patch
echo ====================================================
echo Antigravity Overview Hub Patch
echo Builds the patch against the installed Antigravity version.
echo ====================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required on PATH.
    pause
    exit /b 1
)

echo Closing Antigravity...
taskkill /F /IM Antigravity.exe >nul 2>&1
timeout /t 2 /nobreak >nul

node "%~dp0src\build.js" --install
if %errorlevel% neq 0 (
    echo [ERROR] Patch failed. Antigravity was not modified.
    pause
    exit /b 1
)

node "%~dp0src\verify.js"

echo.
echo Launching Antigravity...
start "" "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
echo Done.
