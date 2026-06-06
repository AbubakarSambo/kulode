# Automated Local Development environment startup script for Kulode

# 1. Clean up stale PostgreSQL PID files and start local Postgres
if (Test-Path "postgres_data/postmaster.pid") {
    $pidVal = Get-Content "postgres_data/postmaster.pid" -First 1
    if (-not (Get-Process -Id $pidVal -ErrorAction SilentlyContinue)) {
        Write-Host "Removing stale PostgreSQL PID file..." -ForegroundColor Yellow
        Remove-Item -Force "postgres_data/postmaster.pid"
    }
}

$portCheck = Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq 5433} -ErrorAction SilentlyContinue
if (-not $portCheck) {
    Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Green
    Start-Process -FilePath "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -ArgumentList "-D postgres_data", "-p 5433" -NoNewWindow
} else {
    Write-Host "PostgreSQL is already running on port 5433." -ForegroundColor Cyan
}

# 2. Start Application Servers in separate Command Prompt windows
Write-Host "Starting NestJS API, React Client, and Astro Marketing servers..." -ForegroundColor Green

# Start NestJS API
Start-Process cmd.exe -ArgumentList "/k npm.cmd run start:dev" -WorkingDirectory "api"

# Start Vite React Client
Start-Process cmd.exe -ArgumentList "/k npm.cmd run dev" -WorkingDirectory "client"

# Start Astro Marketing Landing page
Start-Process cmd.exe -ArgumentList "/k npm.cmd run dev" -WorkingDirectory "marketing"

Write-Host "All servers launched!" -ForegroundColor Green
