<#
.SYNOPSIS
    IronRisk Connector Installer - Interactive Deployment for MetaTrader 5.
.PARAMETER Token
    The IronRisk API Token (irk_...). 
.PARAMETER Server
    The source server URL to download EX5 files from.
.EXAMPLE
    .\Install-IronRisk.ps1 -Token "irk_abc123xyz" -Server "http://localhost:3000/downloads"
#>

param(
    [string]$Token = "",
    [string]$Server = "https://ironrisk.pro/downloads",
    [switch]$SkipDashboard
)

$ServiceFileName   = "IronRisk_Service.ex5"
$DashboardFileName = "IronRisk_Dashboard.ex5"
$TerminalBasePath  = Join-Path $env:APPDATA "MetaQuotes\Terminal"

# --- UI ---
Write-Host ""
Write-Host "  ========================================================" -ForegroundColor DarkGreen
Write-Host "                 IRONRISK SETUP INITIALIZING              " -ForegroundColor Green
Write-Host "  ========================================================" -ForegroundColor DarkGreen
Write-Host ""

# --- Detect MT5 terminals ---
Write-Host "  Scanning for MetaTrader 5..." -ForegroundColor Yellow

if (-not (Test-Path $TerminalBasePath)) {
    Write-Host "  [X] MetaQuotes folder not found at $TerminalBasePath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$terminals = @()
Get-ChildItem $TerminalBasePath -Directory | ForEach-Object {
    $folder = $_.FullName
    $mql5Path = Join-Path $folder "MQL5"
    $originFile = Join-Path $folder "origin.txt"
    
    if ((Test-Path $mql5Path) -and (Test-Path $originFile)) {
        $brokerPath = (Get-Content $originFile -Encoding Unicode -TotalCount 1).Trim()
        $brokerName = Split-Path $brokerPath -Leaf
        
        # Identify associated brokers/servers
        $baseFolder = Join-Path $folder "bases"
        $servers = @()
        if (Test-Path $baseFolder) {
            $servers = (Get-ChildItem $baseFolder -Directory | Where-Object Name -notin @('Custom','Default','signals')).Name
        }
        $serverText = if ($servers.Count -gt 0) { "[$($servers -join ', ')]" } else { "" }
        
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
            BrokerName = "$brokerName $serverText $runText"
            BrokerPath = $brokerPath
        }
    }
}

if ($terminals.Count -eq 0) {
    Write-Host "  [X] No MetaTrader 5 installations found" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  Please select the MetaTrader 5 terminal to connect:" -ForegroundColor Cyan
Write-Host ""
foreach ($t in $terminals) {
    Write-Host "    [$($t.Id)] $($t.BrokerName)" -ForegroundColor White
}
Write-Host ""

$selected = $null
while ($null -eq $selected) {
    $ans = Read-Host "  Enter number (1-$($terminals.Count))"
    if ([int]::TryParse($ans, [ref]0)) {
        $idx = [int]$ans
        $selected = $terminals | Where-Object Id -eq $idx
    }
}

Write-Host ""
Write-Host "  [+] Selected: $($selected.BrokerName)" -ForegroundColor Green
Write-Host "  Installing files..." -ForegroundColor Yellow

# --- Install Files ---
$base = $selected.DataPath

# Download Service
$svcDir = Join-Path $base "MQL5\Services"
if (-not (Test-Path $svcDir)) { New-Item -ItemType Directory -Path $svcDir -Force | Out-Null }
$svcDest = Join-Path $svcDir $ServiceFileName
Invoke-WebRequest -Uri "$Server/$ServiceFileName" -OutFile $svcDest -UseBasicParsing

# Download Dashboard (optional)
if (-not $SkipDashboard) {
    $expDir = Join-Path $base "MQL5\Experts"
    if (-not (Test-Path $expDir)) { New-Item -ItemType Directory -Path $expDir -Force | Out-Null }
    $expDest = Join-Path $expDir $DashboardFileName
    try {
        Invoke-WebRequest -Uri "$Server/$DashboardFileName" -OutFile $expDest -UseBasicParsing
    } catch {
        Write-Host "  [!] Dashboard not found on server, continuing without it." -ForegroundColor DarkGray
    }
}

# Write Config
$cfgDir = Join-Path $base "MQL5\Files\IronRisk"
if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null }
$cfgFile = Join-Path $cfgDir "config.txt"

$configText = "token=$Token"
if ($Server -match "localhost") {
    $configText += "`r`nhost=127.0.0.1`r`nport=8001`r`nhttps=false"
}
$configText | Set-Content -Path $cfgFile -Encoding ASCII -Force

# Patch DLL Allow
$iniFile = Join-Path $base "config\common.ini"
if (Test-Path $iniFile) {
    (Get-Content $iniFile) -replace '^AllowDllImport=0', 'AllowDllImport=1' | Set-Content $iniFile
}

Write-Host "  [OK] Files installed securely." -ForegroundColor Green
Write-Host ""

# Ask for restart directly in the console (100% reliable focus)
Write-Host "IronRisk Connector installed effectively targeting $($selected.BrokerName)!" -ForegroundColor Cyan
Write-Host ""
$ans = Read-Host "Would you like to auto-restart MetaTrader 5 now to finish the connection? (Y/N)"

if ($ans -match "^[yY]") {
    Write-Host "  [SYSTEM] Restarting MetaTrader 5..." -ForegroundColor Yellow
    $targetKillExe = (Join-Path $selected.BrokerPath "terminal64.exe").ToLower()
    try {
        $procsToKill = Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procsToKill) {
            if ($p.ExecutablePath -and $p.ExecutablePath.ToLower() -eq $targetKillExe) {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
    Start-Sleep -Seconds 3
    
    # Inject Auto-start Service
    $termIni = Join-Path $base "config\terminal.ini"
    if (Test-Path $termIni) {
        (Get-Content $termIni) -replace '^IronRisk_Service=1', '' | Set-Content $termIni
        Add-Content $termIni 'IronRisk_Service=1'
    }
    
    $exePath = Join-Path $selected.BrokerPath "terminal64.exe"
    if (Test-Path $exePath) {
        Start-Process $exePath
    }
} else {
    Write-Host "OK! To connect later, manually open MT5, go to Navigator -> Services, and DOUBLE-CLICK IronRisk_Service." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  IronRisk installation complete. You can close this window." -ForegroundColor Green
Start-Sleep -Seconds 5
