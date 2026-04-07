# Manually register AVImark COM Server CLSIDs in the registry
# 32-bit COM server → goes in WOW6432Node

$dllPath = "C:\AVImark\AVImarkCOMServer.dll"
$tlbGuid = "{b38a3049-38f6-40fd-a080-e99194c6df26}"

# CoClass GUIDs extracted from typelib
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

# Interface GUIDs
$interfaces = @{
    "IAVIClientInProc"      = "{32ed79b7-b096-46af-b84d-dd49026c5547}"
    "IAVIPatientInProc"     = "{4c650e1f-5549-4dcd-98a6-3a31f7be040a}"
    "IAVITreatmentInProc"   = "{7a708b9a-0afc-4be8-800f-5f3d100cfe38}"
    "IAVIInventoryInProc"   = "{cba33ebd-8f43-472c-8be3-be8d0e9bd615}"
    "IAVIHistoryInProc"     = "{9de56d1f-2977-43fb-8013-0911c0057cf8}"
    "IAVIEntryInProc"       = "{a25d37e4-d4ef-41cb-a61f-7168da1ff95b}"
    "IAVISystemTableInProc" = "{955c1cbc-c38f-4919-bf7e-7df3c527feaa}"
    "IAVIOrderInProc"       = "{41bf8bc4-0424-4d2f-964b-92fd77084151}"
    "IAVIFileInProc"        = "{bdf5ca94-699d-4a66-b9d7-ca590583058f}"
    "IAVIEstimateInProc"    = "{36dc3cd9-c138-4729-bf5d-edc081088604}"
    "IAVIAppointmentInProc" = "{c68f52e1-0714-4ab8-b97f-7040d26682af}"
    "IAVICensusInProc"      = "{7341871c-ec57-4073-a422-26ae561c6df4}"
}

Write-Host "=== Registering CLSIDs (WOW6432Node for 32-bit) ===" -ForegroundColor Cyan

foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $progId = "AVImarkCOMServer.$name"
    $basePath = "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$clsid"
    
    Write-Host "  Registering $name $clsid..." -NoNewline
    
    try {
        # Create CLSID entry
        New-Item -Path $basePath -Force | Out-Null
        Set-ItemProperty -Path $basePath -Name "(default)" -Value "$name Object"
        
        # InprocServer32 — points to the DLL
        New-Item -Path "$basePath\InprocServer32" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "(default)" -Value $dllPath
        Set-ItemProperty -Path "$basePath\InprocServer32" -Name "ThreadingModel" -Value "Apartment"
        
        # ProgID
        New-Item -Path "$basePath\ProgID" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\ProgID" -Name "(default)" -Value $progId
        
        # TypeLib reference
        New-Item -Path "$basePath\TypeLib" -Force | Out-Null
        Set-ItemProperty -Path "$basePath\TypeLib" -Name "(default)" -Value $tlbGuid
        
        # Also register the ProgID → CLSID mapping
        $progPath = "HKLM:\SOFTWARE\WOW6432Node\Classes\$progId"
        New-Item -Path $progPath -Force | Out-Null
        Set-ItemProperty -Path $progPath -Name "(default)" -Value "$name Object"
        New-Item -Path "$progPath\CLSID" -Force | Out-Null
        Set-ItemProperty -Path "$progPath\CLSID" -Name "(default)" -Value $clsid
        
        Write-Host " OK" -ForegroundColor Green
    } catch {
        Write-Host " FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Also register in native 64-bit classes (some COM lookups check here too)
Write-Host "`n=== Registering ProgIDs in HKLM\SOFTWARE\Classes ===" -ForegroundColor Cyan
foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $progId = "AVImarkCOMServer.$name"
    
    try {
        $progPath = "HKLM:\SOFTWARE\Classes\$progId"
        New-Item -Path $progPath -Force | Out-Null
        Set-ItemProperty -Path $progPath -Name "(default)" -Value "$name Object"
        New-Item -Path "$progPath\CLSID" -Force | Out-Null
        Set-ItemProperty -Path "$progPath\CLSID" -Name "(default)" -Value $clsid
        Write-Host "  $progId OK" -ForegroundColor Green
    } catch {
        Write-Host "  $progId FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Verifying Registration ===" -ForegroundColor Cyan
foreach ($name in $coClasses.Keys) {
    $clsid = $coClasses[$name]
    $check = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$clsid\InprocServer32" -ErrorAction SilentlyContinue
    if ($check) {
        Write-Host "  $name : $($check.'(default)')" -ForegroundColor Green
    } else {
        Write-Host "  $name : NOT FOUND" -ForegroundColor Red
    }
}

Write-Host "`n=== Attempting COM Activation (32-bit process) ===" -ForegroundColor Cyan
Write-Host "  (Need to run from 32-bit PowerShell for InprocServer32 to load)"
