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
set "URL=https://ironrisk.pro/downloads/Uninstall-IronRisk.ps1"
set "TEMP_SCRIPT=%TEMP%\Uninstall-IronRisk.ps1"

echo Descargando modulo de desinstalacion seguro...
curl -sL -o "%TEMP_SCRIPT%" "%URL%"

if not exist "%TEMP_SCRIPT%" (
    echo [X] No se pudo descargar el modulo. Comprueba tu conexion a internet.
    pause
    exit /b 1
)

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%TEMP_SCRIPT%"
del "%TEMP_SCRIPT%" /q
exit /b
