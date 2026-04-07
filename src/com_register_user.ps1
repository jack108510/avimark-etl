# Register AVImark COM Server under HKCU (no admin needed)
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

Write-Host "=== Registering CLSIDs under HKCU ===" -ForegroundColor Cyan

$success = 0
$failed = 0

foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $progId = "AVImarkCOMServer.$name"
    
    try {
        # HKCU\Software\Classes\CLSID\{...}
        $basePath = "HKCU:\Software\Classes\CLSID\$clsid"
        New-Item -Path $basePath -Force | Out-Null
        Set-ItemProperty -Path $basePath -Name "(default)" -Value "$name Object"
        
        # InprocServer32
        New-Item -Path "$basePath\InprocServer32" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "(default)" -Value $dllPath
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "ThreadingModel" -Value "Apartment"
        
        # ProgID
        New-Item -Path "$basePath\ProgID" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\ProgID" -Name "(default)" -Value $progId
        
        # TypeLib
        New-Item -Path "$basePath\TypeLib" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\TypeLib" -Name "(default)" -Value $tlbGuid
        
        # ProgID mapping
        $progPath = "HKCU:\Software\Classes\$progId"
        New-Item -Path $progPath -Force | Out-Null
        Set-ItemProperty -Path $progPath -Name "(default)" -Value "$name Object"
        New-Item -Path "$progPath\CLSID" -Force | Out-Null
        Set-ItemProperty -Path "$progPath\CLSID" -Name "(default)" -Value $clsid
        
        Write-Host "  $name OK" -ForegroundColor Green
        $success++
    } catch {
        Write-Host "  $name FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`nRegistered: $success, Failed: $failed" -ForegroundColor Cyan

# Verify
Write-Host "`n=== Verifying ===" -ForegroundColor Cyan
foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $check = Get-ItemProperty "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -ErrorAction SilentlyContinue
    if ($check) {
        Write-Host "  $name : $($check.'(default)')" -ForegroundColor Green
    } else {
        Write-Host "  $name : NOT FOUND" -ForegroundColor Red
    }
}

# Now try activation from 32-bit PowerShell
Write-Host "`n=== Testing COM Activation ===" -ForegroundColor Cyan
$progIds = @(
    "AVImarkCOMServer.AVIFileInProc",
    "AVImarkCOMServer.AVIClientInProc"
)
foreach ($p in $progIds) {
    Write-Host "  Trying $p... " -NoNewline
    try {
        $obj = New-Object -ComObject $p -ErrorAction Stop
        Write-Host "SUCCESS!" -ForegroundColor Green
        $obj | Get-Member -MemberType Method | ForEach-Object { Write-Host "    Method: $($_.Name)" }
    } catch {
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}
