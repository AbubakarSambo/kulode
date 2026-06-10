# Automated Local Development environment startup script for Kulode

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

# 3. Start application servers in labelled windows
Write-Host "Starting NestJS API, React Client, and Astro Marketing..." -ForegroundColor Green

Start-Process cmd.exe -ArgumentList "/k title Kulode-API && npm.cmd run start:dev" `
    -WorkingDirectory "$ProjectRoot\api"

Start-Process cmd.exe -ArgumentList "/k title Kulode-Client && npm.cmd run dev" `
    -WorkingDirectory "$ProjectRoot\client"

Start-Process cmd.exe -ArgumentList "/k title Kulode-Marketing && npm.cmd run dev" `
    -WorkingDirectory "$ProjectRoot\marketing"

Write-Host ""
Write-Host "All servers launched!" -ForegroundColor Green
Write-Host "  API      -> http://localhost:3003" -ForegroundColor White
Write-Host "  Client   -> http://localhost:5173" -ForegroundColor White
Write-Host "  Marketing-> http://localhost:4321" -ForegroundColor White
