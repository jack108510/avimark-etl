@echo off
:: Avimark ETL Nightly Sync
:: Runs all parsers and pushes to Supabase
cd /d C:\Users\Jackwilde\Projects\avimark-etl
echo [%date% %time%] Starting Avimark ETL sync... >> sync.log
node src/etl.js --all >> sync.log 2>&1
echo [%date% %time%] Sync complete (exit code: %ERRORLEVEL%) >> sync.log
echo. >> sync.log
