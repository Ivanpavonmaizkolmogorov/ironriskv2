@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo                 IRONRISK UNINSTALLER
echo ========================================================
echo.

set "URL=https://ironrisk.pro/downloads/Uninstall-IronRisk.ps1"
set "TEMP_SCRIPT=%TEMP%\Uninstall-IronRisk.ps1"

echo Iniciando proceso de limipieza...
echo.
echo Descargando modulo de desinstalacion seguro desde el servidor...
curl -sL -o "%TEMP_SCRIPT%" "%URL%"

if not exist "%TEMP_SCRIPT%" (
    echo [X] No se pudo descargar el modulo. Comprueba tu conexion a internet.
    pause
    exit /b 1
)

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%TEMP_SCRIPT%"
del "%TEMP_SCRIPT%" /q
exit /b
