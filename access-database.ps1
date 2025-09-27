# POS Database Access Script
# This script provides multiple ways to access your SQLite database

Write-Host "🗄️  POS Database Access Options" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$dbPath = ".\database\pos.db"
$webViewer = "http://localhost:5001/api/database/viewer"
$posApp = "http://localhost:3000"

Write-Host "1. 📱 POS Application: $posApp" -ForegroundColor Green
Write-Host "2. 🔍 Database Viewer: $webViewer" -ForegroundColor Green
Write-Host "3. 💾 Database File Location: $dbPath" -ForegroundColor Yellow
Write-Host ""

Write-Host "Choose an option:" -ForegroundColor White
Write-Host "[1] Open POS Application" -ForegroundColor Gray
Write-Host "[2] Open Database Viewer" -ForegroundColor Gray
Write-Host "[3] Open Both (POS + Database Viewer)" -ForegroundColor Gray
Write-Host "[4] Download SQLite Browser (External Tool)" -ForegroundColor Gray
Write-Host "[5] Show Database Info" -ForegroundColor Gray
Write-Host "[Q] Quit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter your choice"

switch ($choice.ToUpper()) {
    "1" {
        Write-Host "🚀 Opening POS Application..." -ForegroundColor Green
        Start-Process $posApp
    }
    "2" {
        Write-Host "🔍 Opening Database Viewer..." -ForegroundColor Green
        Start-Process $webViewer
    }
    "3" {
        Write-Host "🚀 Opening POS Application..." -ForegroundColor Green
        Start-Process $posApp
        Start-Sleep 2
        Write-Host "🔍 Opening Database Viewer..." -ForegroundColor Green
        Start-Process $webViewer
    }
    "4" {
        Write-Host "📥 Opening SQLite Browser download page..." -ForegroundColor Green
        Start-Process "https://sqlitebrowser.org/dl/"
        Write-Host ""
        Write-Host "After installing DB Browser for SQLite:" -ForegroundColor Yellow
        Write-Host "1. Open DB Browser for SQLite" -ForegroundColor Gray
        Write-Host "2. Click 'Open Database'" -ForegroundColor Gray
        Write-Host "3. Navigate to: $((Get-Location).Path)\database\pos.db" -ForegroundColor Gray
    }
    "5" {
        Write-Host "📊 Database Information:" -ForegroundColor Cyan
        Write-Host "========================" -ForegroundColor Cyan
        if (Test-Path $dbPath) {
            $fileInfo = Get-Item $dbPath
            Write-Host "✅ Database Status: Connected" -ForegroundColor Green
            Write-Host "📍 Location: $($fileInfo.FullName)" -ForegroundColor Gray
            Write-Host "📐 Size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Gray
            Write-Host "📅 Last Modified: $($fileInfo.LastWriteTime)" -ForegroundColor Gray
            Write-Host ""
            Write-Host "🔗 Access URLs:" -ForegroundColor Yellow
            Write-Host "   POS App: $posApp" -ForegroundColor Gray
            Write-Host "   DB Viewer: $webViewer" -ForegroundColor Gray
        } else {
            Write-Host "❌ Database file not found at: $dbPath" -ForegroundColor Red
        }
    }
    "Q" {
        Write-Host "👋 Goodbye!" -ForegroundColor Green
        exit
    }
    default {
        Write-Host "❌ Invalid choice. Please try again." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "💡 Tip: You can run this script anytime with: .\access-database.ps1" -ForegroundColor Cyan
