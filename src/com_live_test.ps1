# Live test of AVImark COM Server — read actual data!
Write-Host "=== AVImark COM Server Live Test ===" -ForegroundColor Cyan
Write-Host "Arch: $([IntPtr]::Size * 8)-bit"

# Test AVIFileInProc — direct file access
Write-Host "`n--- AVIFileInProc ---" -ForegroundColor Yellow
try {
    $file = New-Object -ComObject AVImarkCOMServer.AVIFileInProc
    Write-Host "Created!" -ForegroundColor Green
    
    # List available methods
    $methods = $file | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
    Write-Host "Methods: $($methods -join ', ')"
    
    # Try OpenFiles
    Write-Host "`nCalling OpenFiles('C:\AVImark')..."
    try {
        $file.OpenFiles("C:\AVImark")
        Write-Host "OpenFiles: OK" -ForegroundColor Green
    } catch {
        Write-Host "OpenFiles error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Try Login (empty password)
    Write-Host "Calling Login('')..."
    try {
        $result = $file.Login("")
        Write-Host "Login result: $result" -ForegroundColor Green
    } catch {
        Write-Host "Login error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Try GetFileNames
    Write-Host "Calling GetFileNames..."
    try {
        $names = $file.GetFileNames()
        Write-Host "FileNames: $names" -ForegroundColor Green
    } catch {
        Write-Host "GetFileNames error: $($_.Exception.Message)" -ForegroundColor Red
    }

    # Try GetFileHandles  
    Write-Host "Calling GetFileHandles..."
    try {
        $handles = $file.GetFileHandles()
        Write-Host "FileHandles: $handles" -ForegroundColor Green
    } catch {
        Write-Host "GetFileHandles error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test AVIClientInProc — client lookup
Write-Host "`n--- AVIClientInProc ---" -ForegroundColor Yellow
try {
    $client = New-Object -ComObject AVImarkCOMServer.AVIClientInProc
    Write-Host "Created!" -ForegroundColor Green
    
    $methods = $client | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
    Write-Host "Methods: $($methods -join ', ')"
    
    # Search for a client
    Write-Host "`nCalling GetFirstByName('Smith')..."
    try {
        $result = $client.GetFirstByName("Smith")
        Write-Host "Result: $result" -ForegroundColor Green
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "Calling GetFirstByName('A')..."
    try {
        $result = $client.GetFirstByName("A")
        Write-Host "Result: $result" -ForegroundColor Green
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test AVIPatientInProc
Write-Host "`n--- AVIPatientInProc ---" -ForegroundColor Yellow
try {
    $patient = New-Object -ComObject AVImarkCOMServer.AVIPatientInProc
    Write-Host "Created!" -ForegroundColor Green
    
    $methods = $patient | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
    Write-Host "Methods: $($methods -join ', ')"
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test AVITreatmentInProc
Write-Host "`n--- AVITreatmentInProc ---" -ForegroundColor Yellow
try {
    $treatment = New-Object -ComObject AVImarkCOMServer.AVITreatmentInProc
    Write-Host "Created!" -ForegroundColor Green
    
    $methods = $treatment | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
    Write-Host "Methods: $($methods -join ', ')"
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test AVIAppointmentInProc
Write-Host "`n--- AVIAppointmentInProc ---" -ForegroundColor Yellow
try {
    $appt = New-Object -ComObject AVImarkCOMServer.AVIAppointmentInProc
    Write-Host "Created!" -ForegroundColor Green
    
    $methods = $appt | Get-Member -MemberType Method | Select-Object -ExpandProperty Name
    Write-Host "Methods: $($methods -join ', ')"
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}
