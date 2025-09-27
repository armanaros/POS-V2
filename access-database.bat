@echo off
title POS Database Access
color 0A

echo.
echo ================================================
echo           🗄️  POS Database Access
echo ================================================
echo.
echo Choose an option:
echo.
echo [1] Open POS Application (http://localhost:3000)
echo [2] Open Database Viewer (http://localhost:5001/api/database/viewer)
echo [3] Open Both POS + Database Viewer
echo [4] Download SQLite Browser (External Tool)
echo [5] Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo Opening POS Application...
    start http://localhost:3000
    goto end
)

if "%choice%"=="2" (
    echo Opening Database Viewer...
    start http://localhost:5001/api/database/viewer
    goto end
)

if "%choice%"=="3" (
    echo Opening POS Application...
    start http://localhost:3000
    timeout /t 2 /nobreak >nul
    echo Opening Database Viewer...
    start http://localhost:5001/api/database/viewer
    goto end
)

if "%choice%"=="4" (
    echo Opening SQLite Browser download page...
    start https://sqlitebrowser.org/dl/
    echo.
    echo After installing DB Browser for SQLite:
    echo 1. Open DB Browser for SQLite
    echo 2. Click 'Open Database'
    echo 3. Navigate to: %~dp0database\pos.db
    goto end
)

if "%choice%"=="5" (
    goto end
)

echo Invalid choice. Please try again.
pause
goto start

:end
echo.
echo Done! Press any key to exit...
pause >nul
