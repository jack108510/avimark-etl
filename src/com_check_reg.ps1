# Check where 32-bit process sees COM registrations
Write-Host "Arch: $([IntPtr]::Size * 8)-bit"
$clsid = '{958a6183-e3e3-4f68-ab62-6a58b33feee0}'

$paths = @(
    "HKCU:\Software\Classes\CLSID\$clsid",
    "HKCU:\Software\Classes\WOW6432Node\CLSID\$clsid",
    "HKCU:\SOFTWARE\WOW6432Node\Classes\CLSID\$clsid",
    "HKLM:\SOFTWARE\Classes\CLSID\$clsid",
    "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$clsid"
)

foreach ($p in $paths) {
    $exists = Test-Path $p
    Write-Host "  $p : $exists"
}

# The fix: 32-bit COM on 64-bit OS looks in HKCU\Software\Classes\WOW6432Node\CLSID
# We registered in HKCU\Software\Classes\CLSID — wrong for 32-bit!
# Let's register in the right place
Write-Host "`n=== Re-registering under WOW6432Node for 32-bit ===" -ForegroundColor Cyan

$dllPath = "C:\AVImark\AVImarkCOMServer.dll"
$tlbGuid = "{b38a3049-38f6-40fd-a080-e99194c6df26}"

$coClasses = @{
    "AVIClientInProc"       = "{8c2adcc2-c4a7-44cf-8fc8-9c19f6dcd614}"
    "AVIPatientInProc"      = "{e34baebb-8578-4581-96ca-135f5e549a1b}"
    "AVITreatmentInProc"    = "{faa6c645-edd1-4818-a85f-2c496cb0ddb1}"
    "AVIInventoryInProc"    = "{feec57c8-45ce-424d-9b5e-1cf5a3bbe13f}"
    "AVIHistoryInProc"      = "{c2aae4fd-3392-42c2-b03b-4a767f905f28}"
    "AVIEntryInProc"        = "{2f584227-da85-437c-a75e-e0339ca5cfa0}"
    "AVISystemTableInProc"  = "{89fd5f0d-ff5c-4de6-a8e1-764d8970eec8}"
    "AVIOrderInProc"        = "{4ce9b1f3-372e-4e36-8628-7d3df0451e93}"
    "AVIFileInProc"         = "{958a6183-e3e3-4f68-ab62-6a58b33feee0}"
    "AVIEstimateInProc"     = "{9db6ff9c-e507-43e4-bace-19903c754d68}"
    "AVIAppointmentInProc"  = "{e8dfc3d7-6dcd-4f2d-a68d-1923ed673d6f}"
    "AVICensusInProc"       = "{ef886f93-fab4-4181-9dee-4bd8e00b799a}"
}

foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $progId = "AVImarkCOMServer.$name"
    
    try {
        # Register under WOW6432Node for 32-bit access
        $basePath = "HKCU:\Software\Classes\WOW6432Node\CLSID\$clsid"
        New-Item -Path $basePath -Force | Out-Null
        Set-ItemProperty -Path $basePath -Name "(default)" -Value "$name Object"
        
        New-Item -Path "$basePath\InprocServer32" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "(default)" -Value $dllPath
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "ThreadingModel" -Value "Apartment"
        
        New-Item -Path "$basePath\ProgID" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\ProgID" -Name "(default)" -Value $progId
        
        # Also ProgID mapping under WOW6432Node
        $progPath = "HKCU:\Software\Classes\WOW6432Node\$progId"
        New-Item -Path $progPath -Force | Out-Null
        Set-ItemProperty -Path $progPath -Name "(default)" -Value "$name Object"
        New-Item -Path "$progPath\CLSID" -Force | Out-Null
        Set-ItemProperty -Path "$progPath\CLSID" -Name "(default)" -Value $clsid
        
        Write-Host "  $name OK" -ForegroundColor Green
    } catch {
        Write-Host "  $name FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test activation
Write-Host "`n=== Testing 32-bit COM Activation ===" -ForegroundColor Cyan
try {
    $obj = New-Object -ComObject AVImarkCOMServer.AVIFileInProc -ErrorAction Stop
    Write-Host "AVIFileInProc: SUCCESS!" -ForegroundColor Green
} catch {
    Write-Host "AVIFileInProc: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $obj = New-Object -ComObject AVImarkCOMServer.AVIClientInProc -ErrorAction Stop
    Write-Host "AVIClientInProc: SUCCESS!" -ForegroundColor Green
} catch {
    Write-Host "AVIClientInProc: $($_.Exception.Message)" -ForegroundColor Red
}
