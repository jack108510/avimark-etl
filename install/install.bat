@echo off
:: ============================================================
:: Avimark ETL Installer
:: Automatically sets up the nightly Avimark → Supabase sync
:: ============================================================
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Avimark ETL — Automated Installer      ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo         Download it from https://nodejs.org ^(LTS version^)
    echo         Install it, then re-run this script.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js %%v found

:: Determine install directory (where this script lives)
set "INSTALL_DIR=%~dp0.."
cd /d "%INSTALL_DIR%"
echo [OK] Install directory: %INSTALL_DIR%

:: Install npm dependencies
echo.
echo [STEP 1/5] Installing dependencies...
call npm install --production
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo [OK] Dependencies installed

:: Check for .env file
echo.
echo [STEP 2/5] Checking configuration...
if not exist ".env" (
    echo [ERROR] No .env file found!
    echo         Copy .env.example to .env and fill in:
    echo           SUPABASE_URL=https://your-project.supabase.co
    echo           SUPABASE_SERVICE_KEY=your-service-key
    echo         Then re-run this script.
    pause
    exit /b 1
)
echo [OK] .env file found

:: Detect AVImark data directory
echo.
echo [STEP 3/5] Locating AVImark data...
set "AVIMARK_DIR="
if exist "C:\AVImark\SERVICE.V2$" set "AVIMARK_DIR=C:\AVImark"
if exist "D:\AVImark\SERVICE.V2$" set "AVIMARK_DIR=D:\AVImark"
if exist "E:\AVImark\SERVICE.V2$" set "AVIMARK_DIR=E:\AVImark"

if "%AVIMARK_DIR%"=="" (
    echo [WARNING] Could not auto-detect AVImark data folder.
    set /p AVIMARK_DIR="Enter the path to AVImark data folder: "
)

if not exist "%AVIMARK_DIR%\SERVICE.V2$" (
    echo [ERROR] SERVICE.V2$ not found in %AVIMARK_DIR%
    echo         Make sure you entered the correct AVImark data path.
    pause
    exit /b 1
)

:: Count V2$ files
set count=0
for %%f in ("%AVIMARK_DIR%\*.V2$") do set /a count+=1
echo [OK] Found %count% V2$ files in %AVIMARK_DIR%

:: Update .env with data directory if not default
findstr /c:"AVIMARK_DATA_DIR" .env >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo AVIMARK_DATA_DIR=%AVIMARK_DIR%>> .env
    echo [OK] Added AVIMARK_DATA_DIR=%AVIMARK_DIR% to .env
) else (
    echo [OK] AVIMARK_DATA_DIR already set in .env
)

:: Test dry run
echo.
echo [STEP 4/5] Running test parse (dry run)...
node src/etl.js --dry-run --table treatments --limit 5
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Dry run failed. Check .env settings and AVImark path.
    pause
    exit /b 1
)
echo [OK] Test parse successful

:: Create scheduled task
echo.
echo [STEP 5/5] Creating nightly sync task (2:00 AM daily)...
schtasks /create /tn "Avimark ETL Nightly Sync" /tr "%INSTALL_DIR%\sync.bat" /sc daily /st 02:00 /f
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Could not create scheduled task. You may need to run as Administrator.
    echo           Manual alternative: create a Windows Task Scheduler entry that runs:
    echo           %INSTALL_DIR%\sync.bat
) else (
    echo [OK] Scheduled task created: runs nightly at 2:00 AM
)

:: Done
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         Installation Complete!            ║
echo  ╠══════════════════════════════════════════╣
echo  ║  Data source: %AVIMARK_DIR%
echo  ║  Sync runs:   Daily at 2:00 AM
echo  ║  Log file:    %INSTALL_DIR%\sync.log
echo  ║  Manual run:  %INSTALL_DIR%\sync.bat
echo  ╚══════════════════════════════════════════╝
echo.
echo  To run your first full sync now, type:
echo    node src/etl.js --all
echo.
pause
