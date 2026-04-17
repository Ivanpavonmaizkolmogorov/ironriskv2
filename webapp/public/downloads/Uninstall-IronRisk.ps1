<#
.SYNOPSIS
    IronRisk Connector Uninstaller - Safely removes all IronRisk files from MetaTrader 5.
#>

$ServiceFileName   = "IronRisk_Service.ex5"
$DashboardFileName = "IronRisk_Dashboard.ex5"
$TerminalBasePath  = Join-Path $env:APPDATA "MetaQuotes\Terminal"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- UI ---
Write-Host ""
Write-Host "  ========================================================" -ForegroundColor DarkRed
Write-Host "                IRONRISK SETUP UNINSTALLER                " -ForegroundColor Red
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
            # Check if terminal is currently running
            $isRunning = $false
            $targetExe = (Join-Path $brokerPath "terminal64.exe").ToLower()
            try {
                $runningProcs = Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue
                foreach ($p in $runningProcs) {
                    if ($p.ExecutablePath -and $p.ExecutablePath.ToLower() -eq $targetExe) {
                        $isRunning = $true
                        break
                    }
                }
            } catch {}
            $runText = if ($isRunning) { "(RUNNING)" } else { "" }

            $terminals += [PSCustomObject]@{
                Id         = $terminals.Count + 1
                DataPath   = $folder
                BrokerName = "$brokerName $runText"
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
$terminals = $terminals | Sort-Object BrokerName
for ($i=0; $i -lt $terminals.Count; $i++) {
    $terminals[$i].Id = $i + 1
}

$selectedTerminals = @()
$pageSize = 20
$page = 0
$totalPages = [math]::Ceiling($terminals.Count / $pageSize)

while ($selectedTerminals.Count -eq 0) {
    Clear-Host
    Write-Host ""
    Write-Host "  -------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  🗑️ IRONRISK UNINSTALLER " -ForegroundColor Red
    Write-Host "  -------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    
    if ($totalPages -gt 1) {
        Write-Host "  Select the MetaTrader 5 terminal to REMOVE IronRisk from (Page $($page + 1)/$totalPages):" -ForegroundColor Cyan
    } else {
        Write-Host "  Select the MetaTrader 5 terminal to REMOVE IronRisk from:" -ForegroundColor Cyan
    }
    Write-Host "  (Type ALL to remove from all terminals)" -ForegroundColor Gray
    Write-Host ""
    
    $start = $page * $pageSize
    $end = [math]::Min($start + $pageSize - 1, $terminals.Count - 1)
    
    for ($i = $start; $i -le $end; $i++) {
        Write-Host "    [$($terminals[$i].Id)] $($terminals[$i].BrokerName)" -ForegroundColor White
    }
    Write-Host ""

    if ($totalPages -gt 1) {
        $ans = Read-Host "  Enter number (1-$($terminals.Count)), 'ALL', or 'N' for next page"
        if ($ans -match '^[nN]$') {
            $page = ($page + 1) % $totalPages
            continue
        }
    } else {
        $ans = Read-Host "  Enter number (1-$($terminals.Count)) or 'ALL'"
    }

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
                    $procObj = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
                    if ($procObj) {
                        $procObj.CloseMainWindow() | Out-Null
                        $waitTime = 0
                        while (-not $procObj.HasExited -and $waitTime -lt 10) {
                            Start-Sleep -Seconds 1
                            $waitTime++
                        }
                        if (-not $procObj.HasExited) {
                            Write-Host "  [!] MetaTrader is blocked and cannot close gracefully." -ForegroundColor Red
                            Write-Host "      Operation aborted to protect your open charts and layouts." -ForegroundColor Yellow
                            Write-Host "      Please close any blocking pop-ups in MT5 or shut it down manually to proceed." -ForegroundColor Yellow
                            exit 1
                        }
                    }
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

        # Send Final Uninstall Signal to Sever the Green Connection
        $cfgDir = Join-Path $base "MQL5\Files\IronRisk"
        $cfgFile = Join-Path $cfgDir "config.txt"
        if (Test-Path $cfgFile) {
            try {
                # Parse the token= line from config.txt (multi-line format: token=xxx, hostname=xxx, host=xxx...)
                $cfgLines = Get-Content $cfgFile
                $tokenLine = $cfgLines | Where-Object { $_ -match '^token=' } | Select-Object -First 1
                if ($tokenLine) {
                    $extToken = ($tokenLine -replace '^token=','').Trim()
                    $body = @{ api_token = $extToken; magic_number = 0 } | ConvertTo-Json
                    # Parse server host from config to know where to send the kill signal
                    $cfgHost = ($cfgLines | Where-Object { $_ -match '^host=' } | Select-Object -First 1) -replace '^host=',''
                    $cfgPort = ($cfgLines | Where-Object { $_ -match '^port=' } | Select-Object -First 1) -replace '^port=',''
                    $cfgHttps = ($cfgLines | Where-Object { $_ -match '^https=' } | Select-Object -First 1) -replace '^https=',''
                    if ($cfgHost) {
                        $scheme = if ($cfgHttps -eq 'true') { 'https' } else { 'http' }
                        $targetUrl = "${scheme}://${cfgHost}:${cfgPort}/api/live/uninstall"
                    } else {
                        $targetUrl = "https://api.ironrisk.pro/api/live/uninstall"
                    }
                    Write-Host "  [*] Sending kill signal to $targetUrl..." -ForegroundColor Yellow
                    Invoke-RestMethod -Uri $targetUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop | Out-Null
                    Write-Host "  [+] Connection cleanly severed from server." -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] Kill signal failed: $_" -ForegroundColor DarkYellow
            }
        }

        # Delete Config Folder Entirely
        if (Test-Path $cfgDir) { Remove-Item -Path $cfgDir -Recurse -Force -ErrorAction SilentlyContinue }

        # Remove Auto-start entry
        $termIni = Join-Path $base "config\terminal.ini"
        if (Test-Path $termIni) {
            (Get-Content $termIni) -replace '^IronRisk_Service=1', '' | Set-Content $termIni
        }
        
        # Restart the terminal
        $exePath = Join-Path $selected.BrokerPath "terminal64.exe"
        if (Test-Path $exePath) {
            Write-Host "  [SYSTEM] Respawning MetaTrader 5..." -ForegroundColor Yellow
            Start-Process -FilePath $exePath -WorkingDirectory $selected.BrokerPath
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
