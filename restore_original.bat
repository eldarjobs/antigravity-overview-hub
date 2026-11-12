@echo off
title Restore Original Antigravity
echo ====================================================
echo Restoring original Antigravity app.asar...
echo ====================================================

set "RES_DIR=%LOCALAPPDATA%\Programs\Antigravity\resources"
if not exist "%RES_DIR%" (
    set "RES_DIR=%ProgramFiles%\Antigravity\resources"
)

echo Closing Antigravity...
taskkill /F /IM Antigravity.exe >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "%RES_DIR%\app.asar.bak" (
    copy /y "%RES_DIR%\app.asar.bak" "%RES_DIR%\app.asar" >nul
    echo [SUCCESS] Restored original app.asar from backup!
) else (
    echo [ERROR] Backup app.asar.bak not found!
)

timeout /t 2 /nobreak >nul
echo Relaunching Antigravity...
start "" "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
echo Done!
