# Automated Local Development environment startup script for Tari1

# Resolve the project root directory regardless of where the script is called from
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# 1. Clean up stale PostgreSQL PID files
if (Test-Path "$ProjectRoot\postgres_data\postmaster.pid") {
    $pidVal = Get-Content "$ProjectRoot\postgres_data\postmaster.pid" -First 1
    if (-not (Get-Process -Id $pidVal -ErrorAction SilentlyContinue)) {
        Write-Host "Removing stale PostgreSQL PID file..." -ForegroundColor Yellow
        Remove-Item -Force "$ProjectRoot\postgres_data\postmaster.pid"
    }
}

# 2. Start PostgreSQL if not already running
$portCheck = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 5433 }
if (-not $portCheck) {
    Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Green
    Start-Process -FilePath "C:\Program Files\PostgreSQL\18\bin\postgres.exe" `
        -ArgumentList "-D `"$ProjectRoot\postgres_data`"", "-p 5433" `
        -NoNewWindow
    Start-Sleep -Seconds 2
} else {
    Write-Host "PostgreSQL already running on port 5433." -ForegroundColor Cyan
}

# 2.5 Clean up any existing processes on application ports (API, Client, Marketing)
$appPorts = @(3003, 5173, 4321)
foreach ($port in $appPorts) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            $procId = $c.OwningProcess
            if ($procId -gt 0) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "Port $port is in use by $($proc.ProcessName) (PID: $procId). Stopping process..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

# 3. Start application servers
Write-Host "Starting NestJS API, React Client, and Astro Marketing..." -ForegroundColor Green

$UseJobs = $false
if ($env:ANTIGRAVITY_AGENT -eq "1" -or $args -contains "-Headless") {
    $UseJobs = $true
}

if ($UseJobs) {
    Write-Host "Agent/Headless mode detected. Launching servers as background jobs..." -ForegroundColor Cyan
    Start-Job -Name "api" -ScriptBlock { Set-Location "$using:ProjectRoot\api"; npm.cmd run start:dev }
    Start-Job -Name "client" -ScriptBlock { Set-Location "$using:ProjectRoot\client"; npm.cmd run dev }
    Start-Job -Name "marketing" -ScriptBlock { Set-Location "$using:ProjectRoot\marketing"; npm.cmd run dev }
} else {
    Start-Process npm.cmd -ArgumentList "run", "start:dev" `
        -WorkingDirectory "$ProjectRoot\api"

    Start-Process npm.cmd -ArgumentList "run", "dev" `
        -WorkingDirectory "$ProjectRoot\client"

    Start-Process npm.cmd -ArgumentList "run", "dev" `
        -WorkingDirectory "$ProjectRoot\marketing"
}

Write-Host ""
Write-Host "All servers launched!" -ForegroundColor Green
Write-Host "  API      -> http://localhost:3003" -ForegroundColor White
Write-Host "  Client   -> http://localhost:5173" -ForegroundColor White
Write-Host "  Marketing-> http://localhost:4321" -ForegroundColor White

if ($UseJobs) {
    Write-Host ""
    Write-Host "Keeping script active to prevent background process termination. Press Ctrl+C in terminal or stop the task to exit." -ForegroundColor Yellow
    while ($true) {
        Start-Sleep -Seconds 10
    }
}

