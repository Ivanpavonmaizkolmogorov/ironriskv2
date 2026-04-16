@echo off
setlocal EnableDelayedExpansion
set IDX=0
for /d %%D in ("%APPDATA%\MetaQuotes\Terminal\*") do (
    if exist "%%D\origin.txt" (
        set /a IDX+=1
        for /f "usebackq tokens=*" %%A in ("%%D\origin.txt") do set "ORIG=%%A"
        set "PATH_!IDX!=%%D"
        set "NAME_!IDX!=!ORIG!"
    )
)

echo.
echo ==================================================
echo   Select MetaTrader 5 Terminal to Auto-Connect:
echo ==================================================
echo.

set "CHOICES="
for /L %%I in (1,1,%IDX%) do (
    echo   [%%I] !NAME_%%I!
    set "CHOICES=!CHOICES!%%I"
)
echo.

if %IDX% GTR 9 (
    set /p "CHOICE=Enter number: "
) else (
    choice /c !CHOICES! /n /m "> Press number [!CHOICES!]: "
    set CHOICE=!ERRORLEVEL!
)

set TARGET=!PATH_%CHOICE%!
echo You selected: !TARGET!
