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

# --- Force TLS 1.2 (Windows Server defaults to TLS 1.0 which breaks HTTPS) ---
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ServiceFileName   = "IronRisk_Service.ex5"
$DashboardFileName = "IronRisk_Dashboard.ex5"
$TerminalBasePath  = Join-Path $env:APPDATA "MetaQuotes\Terminal"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
$terminals = $terminals | Sort-Object BrokerName
for ($i=0; $i -lt $terminals.Count; $i++) {
    $terminals[$i].Id = $i + 1
}

$selected = $null
$pageSize = 20
$page = 0
$totalPages = [math]::Ceiling($terminals.Count / $pageSize)

while ($null -eq $selected) {
    Clear-Host
    Write-Host ""
    Write-Host "  -------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  🛡️ IRONRISK AUTO-INSTALLER " -ForegroundColor Cyan
    Write-Host "  -------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    
    if ($totalPages -gt 1) {
        Write-Host "  Please select the MetaTrader 5 terminal (Page $($page + 1)/$totalPages):" -ForegroundColor Cyan
    } else {
        Write-Host "  Please select the MetaTrader 5 terminal:" -ForegroundColor Cyan
    }
    
    Write-Host ""
    
    $start = $page * $pageSize
    $end = [math]::Min($start + $pageSize - 1, $terminals.Count - 1)
    
    for ($i = $start; $i -le $end; $i++) {
        Write-Host "    [$($terminals[$i].Id)] $($terminals[$i].BrokerName)" -ForegroundColor White
    }
    Write-Host ""
    
    if ($totalPages -gt 1) {
        $ans = Read-Host "  Enter number (1-$($terminals.Count)), or 'N' for next page"
        if ($ans -match '^[nN]$') {
            $page = ($page + 1) % $totalPages
            continue
        }
    } else {
        $ans = Read-Host "  Enter number (1-$($terminals.Count))"
    }

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
try {
    Write-Host "  [*] Downloading $ServiceFileName from $Server..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "$Server/$ServiceFileName" -OutFile $svcDest -Headers @{"Cache-Control"="no-cache, no-store"} -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Host "  [X] DOWNLOAD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  [!] Your VPS may be blocking HTTPS connections to ironrisk.pro" -ForegroundColor Yellow
    Write-Host "  [!] Try running this installer as Administrator." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
# Validate downloaded file (must be > 1KB, not an HTML error page)
if (-not (Test-Path $svcDest) -or (Get-Item $svcDest).Length -lt 1024) {
    Write-Host "  [X] Downloaded file is missing or too small (corrupted)." -ForegroundColor Red
    Write-Host "  [!] Try downloading manually: $Server/$ServiceFileName" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  [OK] Service downloaded ($([math]::Round((Get-Item $svcDest).Length / 1024))KB)" -ForegroundColor Green

# Download Dashboard (optional)
if (-not $SkipDashboard) {
    $expDir = Join-Path $base "MQL5\Experts"
    if (-not (Test-Path $expDir)) { New-Item -ItemType Directory -Path $expDir -Force | Out-Null }
    $expDest = Join-Path $expDir $DashboardFileName
    try {
        Invoke-WebRequest -Uri "$Server/$DashboardFileName" -OutFile $expDest -Headers @{"Cache-Control"="no-cache, no-store"} -UseBasicParsing -ErrorAction Stop
        Write-Host "  [OK] Dashboard downloaded ($([math]::Round((Get-Item $expDest).Length / 1024))KB)" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Dashboard not found on server, continuing without it." -ForegroundColor DarkGray
    }
}

# Write Config
$cfgDir = Join-Path $base "MQL5\Files\IronRisk"
if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null }
$cfgFile = Join-Path $cfgDir "config.txt"

$configText = "token=$Token`r`nhostname=$env:COMPUTERNAME"
if ($Server -match "localhost") {
    $configText += "`r`nhost=127.0.0.1`r`nport=8001`r`nhttps=false"
}
$configText | Set-Content -Path $cfgFile -Encoding ASCII -Force



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
    Start-Sleep -Seconds 3
    
    # Inject Auto-start Service & DLL Permissions AFTER MT5 is closed
    $termIni = Join-Path $base "config\terminal.ini"
    if (Test-Path $termIni) {
        $iniLines = Get-Content $termIni
        $newLines = @()
        $inServices = $false
        $hasServices = $false
        
        foreach ($line in $iniLines) {
            if ($line -match '^\[Services\]') {
                $hasServices = $true
                $inServices = $true
                $newLines += $line
                continue
            } elseif ($line -match '^\[.*\]') {
                if ($inServices) {
                    $newLines += 'IronRisk_Service=3'
                    $inServices = $false
                }
            }
            if ($line -match '^IronRisk_Service=') { continue }
            if ($line.Trim() -eq '') { continue }
            $newLines += $line
        }
        
        if ($inServices) {
            $newLines += 'IronRisk_Service=3'
        } elseif (-not $hasServices) {
            $newLines += '[Services]'
            $newLines += 'IronRisk_Service=3'
        }
        
        $newLines | Set-Content $termIni -Encoding ASCII
    }

    $iniFile = Join-Path $base "config\common.ini"
    if (Test-Path $iniFile) {
        $cLines = Get-Content $iniFile
        $cNewLines = @()
        $inCommon = $false
        $hasCommon = $false
        
        foreach ($line in $cLines) {
            if ($line -match '^\[Experts\]') {
                $hasCommon = $true
                $inCommon = $true
                $cNewLines += $line
                continue
            } elseif ($line -match '^\[.*\]') {
                if ($inCommon) {
                    $cNewLines += 'AllowDllImport=1'
                    $inCommon = $false
                }
            }
            if ($line -match '^AllowDllImport=') { continue }
            if ($line.Trim() -eq '') { continue }
            $cNewLines += $line
        }
        
        if ($inCommon) {
            $cNewLines += 'AllowDllImport=1'
        } elseif (-not $hasCommon) {
            $cNewLines += '[Experts]'
            $cNewLines += 'AllowDllImport=1'
        }
        
        $cNewLines | Set-Content $iniFile -Encoding ASCII
    }
    
    $exePath = Join-Path $selected.BrokerPath "terminal64.exe"
    if (Test-Path $exePath) {
        Write-Host "  [SYSTEM] Respawning MetaTrader 5..." -ForegroundColor Yellow
        Start-Process -FilePath $exePath -WorkingDirectory $selected.BrokerPath
    }
} else {
    Write-Host "OK! To connect later, manually open MT5, go to Navigator -> Services, and DOUBLE-CLICK IronRisk_Service." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  IronRisk installation complete. You can close this window." -ForegroundColor Green
Start-Sleep -Seconds 5
