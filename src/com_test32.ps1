Write-Host "=== 32-bit PowerShell COM Test ===" -ForegroundColor Cyan
Write-Host "Arch: $([IntPtr]::Size * 8)-bit"

$progIds = @(
    "AVImarkCOMServer.AVIFileInProc",
    "AVImarkCOMServer.AVIClientInProc",
    "AVImarkCOMServer.AVIPatientInProc",
    "AVImarkCOMServer.AVITreatmentInProc",
    "AVImarkCOMServer.AVIInventoryInProc"
)

foreach ($p in $progIds) {
    Write-Host "  Trying $p... " -NoNewline
    try {
        $obj = New-Object -ComObject $p -ErrorAction Stop
        Write-Host "SUCCESS!" -ForegroundColor Green
        $members = $obj | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
        foreach ($m in $members) {
            Write-Host "    - $m"
        }
    } catch {
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# If AVIFileInProc works, try calling methods
Write-Host "`n=== Trying AVIFileInProc.Login ===" -ForegroundColor Cyan
try {
    $file = New-Object -ComObject AVImarkCOMServer.AVIFileInProc -ErrorAction Stop
    Write-Host "Object created!" -ForegroundColor Green
    
    # Try OpenFiles with AVImark data path
    Write-Host "Calling OpenFiles('C:\AVImark')..."
    $file.OpenFiles("C:\AVImark")
    Write-Host "OpenFiles succeeded!" -ForegroundColor Green
    
    # Try Login
    Write-Host "Calling Login('')..."
    $file.Login("")
    Write-Host "Login succeeded!" -ForegroundColor Green
    
    # Try GetFileNames
    Write-Host "Calling GetFileNames..."
    $names = $file.GetFileNames()
    Write-Host "Files: $names"
    
    $file.CloseFiles()
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try AVIClientInProc
Write-Host "`n=== Trying AVIClientInProc ===" -ForegroundColor Cyan
try {
    $client = New-Object -ComObject AVImarkCOMServer.AVIClientInProc -ErrorAction Stop
    Write-Host "Object created!" -ForegroundColor Green
    
    Write-Host "Calling GetFirstByName('Smith')..."
    $result = $client.GetFirstByName("Smith")
    Write-Host "Result: $result"
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
