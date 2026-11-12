@echo off
setlocal
set "TASK=AntigravityHubAutoRepatch"
if /i "%~1"=="/remove" (
    schtasks /Delete /TN "%TASK%" /F
    exit /b %errorlevel%
)
echo Registering scheduled task %TASK% (at logon and every 5 minutes)...
schtasks /Create /TN "%TASK%" /SC MINUTE /MO 5 /TR "wscript.exe \"%~dp0auto_repatch.vbs\"" /F >nul
if %errorlevel% neq 0 (
    echo [ERROR] Could not register the scheduled task.
    pause
    exit /b 1
)
echo [OK] Task registered. After an Antigravity update the patch is re-applied
echo      within 5 minutes of the application being closed.
echo      Log: %~dp0logs\auto_repatch.log
echo      Remove with: install_autopatch.bat /remove
