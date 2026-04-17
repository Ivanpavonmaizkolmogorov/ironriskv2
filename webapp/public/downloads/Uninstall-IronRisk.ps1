<#
.SYNOPSIS
    IronRisk Connector Uninstaller - Safely removes all IronRisk files from MetaTrader 5.
#>

$ServiceFileName   = "IronRisk_Service.ex5"
$DashboardFileName = "IronRisk_Dashboard.ex5"
$TerminalBasePath  = Join-Path $env:APPDATA "MetaQuotes\Terminal"

# --- UI ---
Write-Host ""
Write-Host "  ========================================================" -ForegroundColor DarkRed
Write-Host "                 IRONRISK SETUP UNINSTALLER               " -ForegroundColor Red
Write-Host "  ========================================================" -ForegroundColor DarkRed
Write-Host ""

# --- Detect MT5 terminals ---
Write-Host "  Scanning for MetaTrader 5..." -ForegroundColor Yellow

if (-not (Test-Path $TerminalBasePath)) {
    Write-Host "  [X] MetaQuotes folder not found. Nothing to uninstall." -ForegroundColor Gray
    Read-Host "Press Enter to exit"
    exit 0
}

$terminals = @()
Get-ChildItem $TerminalBasePath -Directory | ForEach-Object {
    $folder = $_.FullName
    $mql5Path = Join-Path $folder "MQL5"
    $originFile = Join-Path $folder "origin.txt"
    
    if ((Test-Path $mql5Path) -and (Test-Path $originFile)) {
        $brokerPath = (Get-Content $originFile -Encoding Unicode -TotalCount 1).Trim()
        $brokerName = Split-Path $brokerPath -Leaf
        
        # Check if IronRisk is actually in this terminal
        $hasIronRisk = $false
        $servicesLoc = Get-ChildItem -Path (Join-Path $folder "MQL5\Services") -Filter "*IronRisk*.ex5" -Recurse -ErrorAction SilentlyContinue
        $expertsLoc = Get-ChildItem -Path (Join-Path $folder "MQL5\Experts") -Filter "*IronRisk*.ex5" -Recurse -ErrorAction SilentlyContinue

        if ($servicesLoc -or $expertsLoc) {
            $hasIronRisk = $true
        }

        if ($hasIronRisk) {
            $terminals += [PSCustomObject]@{
                Id         = $terminals.Count + 1
                DataPath   = $folder
                BrokerName = $brokerName
                BrokerPath = $brokerPath
            }
        }
    }
}

if ($terminals.Count -eq 0) {
    Write-Host "  [OK] IronRisk is not installed on any MetaTrader 5 terminal in your system." -ForegroundColor Green
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""
Write-Host "  Select the MetaTrader 5 terminal to REMOVE IronRisk from:" -ForegroundColor Cyan
Write-Host "  (Type ALL to remove from all terminals)" -ForegroundColor Gray
Write-Host ""
foreach ($t in $terminals) {
    Write-Host "    [$($t.Id)] $($t.BrokerName)" -ForegroundColor White
}
Write-Host ""

$selectedTerminals = @()
while ($selectedTerminals.Count -eq 0) {
    $ans = Read-Host "  Enter number (1-$($terminals.Count)) or 'ALL'"
    if ($ans.ToUpper() -eq "ALL") {
        $selectedTerminals = $terminals
    } elseif ([int]::TryParse($ans, [ref]0)) {
        $idx = [int]$ans
        $match = $terminals | Where-Object Id -eq $idx
        if ($match) { $selectedTerminals += $match }
    }
}

Write-Host ""
$ans = Read-Host "We need to restart MetaTrader 5 to release the files for deletion. Proceed? (Y/N)"

if ($ans -match "^[yY]") {
    Write-Host "  [SYSTEM] Stopping MetaTrader 5..." -ForegroundColor Yellow
    foreach ($selected in $selectedTerminals) {
        $targetKillExe = (Join-Path $selected.BrokerPath "terminal64.exe").ToLower()
        try {
            $procsToKill = Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue
            foreach ($p in $procsToKill) {
                if ($p.ExecutablePath -and $p.ExecutablePath.ToLower() -eq $targetKillExe) {
                    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {}
    }
    
    Start-Sleep -Seconds 3

    foreach ($selected in $selectedTerminals) {
        Write-Host "  [-] Purging IronRisk from $($selected.BrokerName)..." -ForegroundColor Red
        $base = $selected.DataPath

        # Delete Service
        $svcDest = Join-Path $base "MQL5\Services"
        if (Test-Path $svcDest) { Get-ChildItem -Path $svcDest -Filter "*IronRisk*.ex5" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }

        # Delete Dashboard
        $expDest = Join-Path $base "MQL5\Experts"
        if (Test-Path $expDest) { Get-ChildItem -Path $expDest -Filter "*IronRisk*.ex5" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }

        # Delete Config Folder Entirely
        $cfgDir = Join-Path $base "MQL5\Files\IronRisk"
        if (Test-Path $cfgDir) { Remove-Item -Path $cfgDir -Recurse -Force -ErrorAction SilentlyContinue }

        # Remove Auto-start entry
        $termIni = Join-Path $base "config\terminal.ini"
        if (Test-Path $termIni) {
            (Get-Content $termIni) -replace '^IronRisk_Service=1', '' | Set-Content $termIni
        }
        
        # Restart the terminal
        $exePath = Join-Path $selected.BrokerPath "terminal64.exe"
        if (Test-Path $exePath) {
            Start-Process $exePath
        }
    }
    
    Write-Host ""
    Write-Host "  [OK] IronRisk has been completely REMOVED from your system." -ForegroundColor Green

} else {
    Write-Host "Operation cancelled. Files are locked by MetaTrader 5." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press Enter to exit..." 
Read-Host
