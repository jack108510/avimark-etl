$TaskName = "Avimark-RefreshListPrices"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed $TaskName" -ForegroundColor Yellow
