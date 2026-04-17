@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo                 IRONRISK UNINSTALLER
echo ========================================================
echo.
echo Asking for Administrator privileges...
echo.

:: Check for Admin rights
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :RunUninstaller
) else (
    echo We need Administration Rights to close MetaTrader 5 and safely remove the files.
    echo Please grant permission in the pop-up window...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

:RunUninstaller
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0Uninstall-IronRisk.ps1"
exit /b
