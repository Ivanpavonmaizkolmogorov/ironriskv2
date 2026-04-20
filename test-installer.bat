@echo off
chcp 65001 >nul
title IronRisk Auto-Installer
setlocal enabledelayedexpansion
mode con: cols=85 lines=25
color 0A

set "TOKEN=123"
set "SERVER=https://www.ironrisk.pro/downloads"

:: Create temporary script
set "PS1_FILE=%TEMP%\Install-IronRisk-Test.ps1"
curl -sL -o "%PS1_FILE%" "%SERVER%/Install-IronRisk.ps1?v=123"

if exist "%PS1_FILE%" (
    for %%I in ("%PS1_FILE%") do if %%~zI equ 0 (
        color 0C
        echo [X] Error: File is empty!
        del "%PS1_FILE%"
    ) else (
        echo YES EXISTE and is not empty. Size: %%~zI bytes
        head -n 2 "%PS1_FILE%"
    )
) else (
    color 0C
    echo [X] Error: Could not download the installer from %SERVER%
)
