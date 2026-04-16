@echo off
title IronRisk Connector Installer v1.0
echo.
echo   IronRisk Connector Installer v1.0
echo   https://ironrisk.pro
echo.

:: Configuration
set "SERVER=https://ironrisk.pro/downloads"
set "SERVICE_FILE=IronRisk_Service.ex5"
set "DASHBOARD_FILE=IronRisk_Dashboard.ex5"
set "TERMINAL_BASE=%APPDATA%\MetaQuotes\Terminal"
set "TEMP_DIR=%TEMP%\IronRisk_Install"

:: Create temp dir
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: Download Service .ex5 automatically
echo   Downloading %SERVICE_FILE%...
curl -sL -o "%TEMP_DIR%\%SERVICE_FILE%" "%SERVER%/%SERVICE_FILE%"
if not exist "%TEMP_DIR%\%SERVICE_FILE%" (
    echo   [X] Download failed. Check your internet connection.
    pause
    exit /b 1
)
:: Check file size (must be > 1KB to be valid)
for %%A in ("%TEMP_DIR%\%SERVICE_FILE%") do if %%~zA LSS 1024 (
    echo   [X] Downloaded file is too small - may be corrupted.
    echo   [!] Try downloading manually from %SERVER%/%SERVICE_FILE%
    pause
    exit /b 1
)
echo   [OK] Downloaded %SERVICE_FILE%

:: Try downloading Dashboard (optional, don't fail if missing)
curl -sL -o "%TEMP_DIR%\%DASHBOARD_FILE%" "%SERVER%/%DASHBOARD_FILE%" 2>nul
set "HAS_DASHBOARD=0"
if exist "%TEMP_DIR%\%DASHBOARD_FILE%" (
    for %%A in ("%TEMP_DIR%\%DASHBOARD_FILE%") do if %%~zA GTR 1024 (
        echo   [OK] Downloaded %DASHBOARD_FILE% ^(optional^)
        set "HAS_DASHBOARD=1"
    )
)
if "%HAS_DASHBOARD%"=="0" echo   [--] Dashboard not available, installing Service only

:: Scan for MT5 terminals
echo.
echo   Scanning for MetaTrader 5...

if not exist "%TERMINAL_BASE%" (
    echo   [X] MetaQuotes folder not found at %TERMINAL_BASE%
    echo   [!] Make sure MetaTrader 5 is installed.
    pause
    exit /b 1
)

:: Count terminals
set "COUNT=0"
for /d %%D in ("%TERMINAL_BASE%\*") do (
    if exist "%%D\MQL5" if exist "%%D\origin.txt" (
        set /a COUNT+=1
    )
)

if %COUNT%==0 (
    echo   [X] No MetaTrader 5 installations found
    pause
    exit /b 1
)

echo.
echo   Found %COUNT% terminal^(s^):
echo.

for /d %%D in ("%TERMINAL_BASE%\*") do (
    if exist "%%D\MQL5" if exist "%%D\origin.txt" (
        for /f "usebackq delims=" %%B in ("%%D\origin.txt") do (
            for %%N in ("%%B") do echo     - %%~nxN
        )
    )
)

:: Ask for token
echo.
set /p "TOKEN=  Enter your IronRisk API Token (irk_...): "
echo.

:: Validate token
echo %TOKEN% | findstr /b "irk_" >nul
if errorlevel 1 (
    echo   [X] Invalid token. Must start with 'irk_'
    pause
    exit /b 1
)

echo   [OK] Token validated
echo.
echo   Installing...
echo.

:: Install to all terminals
set "OK=0"
for /d %%D in ("%TERMINAL_BASE%\*") do (
    if exist "%%D\MQL5" if exist "%%D\origin.txt" (
        :: Service
        if not exist "%%D\MQL5\Services" mkdir "%%D\MQL5\Services"
        copy /y "%TEMP_DIR%\%SERVICE_FILE%" "%%D\MQL5\Services\%SERVICE_FILE%" >nul

        :: Dashboard (optional)
        if "%HAS_DASHBOARD%"=="1" (
            if not exist "%%D\MQL5\Experts" mkdir "%%D\MQL5\Experts"
            copy /y "%TEMP_DIR%\%DASHBOARD_FILE%" "%%D\MQL5\Experts\%DASHBOARD_FILE%" >nul
        )

        :: Token config
        if not exist "%%D\MQL5\Files\IronRisk" mkdir "%%D\MQL5\Files\IronRisk"
        echo token=%TOKEN%> "%%D\MQL5\Files\IronRisk\config.txt"

        for /f "usebackq delims=" %%B in ("%%D\origin.txt") do (
            for %%N in ("%%B") do echo   [OK] %%~nxN
        )
        set /a OK+=1
    )
)

:: Cleanup temp
rmdir /s /q "%TEMP_DIR%" 2>nul

:: Summary
echo.
echo   ==========================================
echo   Installation Complete!
echo   Installed to %COUNT% terminal^(s^).
echo.
echo   Next steps:
echo     1. Open ^(or restart^) MetaTrader 5
echo     2. The Service auto-starts in background
echo     3. Allow DLL imports when prompted
echo     4. Check your dashboard at ironrisk.pro
echo   ==========================================
echo.
pause
