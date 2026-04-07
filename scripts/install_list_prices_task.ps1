# Install Windows Scheduled Task to refresh list_prices nightly at 2:30 AM
# Run as Administrator

$TaskName = "Avimark-RefreshListPrices"
$ProjectDir = "C:\Users\Jackwilde\Projects\avimark-etl"
$NodePath = (Get-Command node).Source
$Script = "$ProjectDir\src\refresh_list_prices.js"
$LogDir = "$ProjectDir\logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$LogFile = "$LogDir\list_prices_refresh.log"

$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "`"$Script`"" `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger -Daily -At 2:30AM

$Principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description "Refreshes list_prices table in Supabase from Avimark billing data (SERVICE.V2$ via services table)."

Write-Host ""
Write-Host "✅ Scheduled Task '$TaskName' installed." -ForegroundColor Green
Write-Host "   Runs: Daily at 2:30 AM as SYSTEM"
Write-Host "   Script: $Script"
Write-Host "   Logs:   $LogFile"
Write-Host ""
Write-Host "Run now to test:" -ForegroundColor Yellow
Write-Host "   Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "   Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
