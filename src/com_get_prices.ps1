# Try to get real prices from AVImark COM Server
Write-Host "=== AVImark COM — Reading Prices ===" -ForegroundColor Cyan

# Set working directory to AVImark
Set-Location "C:\AVImark"

# Try TreatmentInProc.GetByCode
Write-Host "`n--- TreatmentInProc.GetByCode ---" -ForegroundColor Yellow
try {
    $treatment = New-Object -ComObject AVImarkCOMServer.AVITreatmentInProc
    Write-Host "Created!" -ForegroundColor Green
    
    $codes = @("HC", "HEF", "ANEX", "V1", "GERI", "2VW", "BLO", "0023", "CYSTO", "0714")
    
    foreach ($code in $codes) {
        Write-Host "  GetByCode('$code')... " -NoNewline
        try {
            $result = $treatment.GetByCode($code)
            Write-Host "Result: $result" -ForegroundColor Green
        } catch {
            Write-Host "$($_.Exception.Message)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try FileInProc with working dir set
Write-Host "`n--- FileInProc (from C:\AVImark) ---" -ForegroundColor Yellow
try {
    $file = New-Object -ComObject AVImarkCOMServer.AVIFileInProc
    
    Write-Host "OpenFiles('C:\AVImark')..."
    try {
        $file.OpenFiles("C:\AVImark")
        Write-Host "OK!" -ForegroundColor Green
        
        Write-Host "GetFileNames..."
        $names = $file.GetFileNames()
        Write-Host "Files: $names" -ForegroundColor Green
        
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        # Try without path
        Write-Host "Trying OpenFiles('')..."
        try {
            $file.OpenFiles("")
            Write-Host "OK!" -ForegroundColor Green
        } catch {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Try with just a period
        Write-Host "Trying OpenFiles('.')..."
        try {
            $file.OpenFiles(".")
            Write-Host "OK!" -ForegroundColor Green
            
            Write-Host "GetFileNames..."
            $names = $file.GetFileNames()
            Write-Host "Files: $names" -ForegroundColor Green
        } catch {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    # Try Login
    Write-Host "`nLogin('')..."
    try {
        $result = $file.Login("")
        Write-Host "Login result: $result" -ForegroundColor Green
    } catch {
        Write-Host "Login error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Try GetRecordCount for PRICE
    Write-Host "GetFileHandle('PRICE')..."
    try {
        $handle = $file.GetFileHandle("PRICE")
        Write-Host "Handle: $handle" -ForegroundColor Green
        
        Write-Host "GetRecordCount..."
        $count = $file.GetRecordCount($handle)
        Write-Host "PRICE record count: $count" -ForegroundColor Green
        
        Write-Host "GetFieldNames..."
        $fields = $file.GetFieldNames($handle, "")
        Write-Host "Fields: $fields" -ForegroundColor Green
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try ClientInProc with new method
Write-Host "`n--- ClientInProc.GetFirstByNameKey ---" -ForegroundColor Yellow
try {
    $client = New-Object -ComObject AVImarkCOMServer.AVIClientInProc
    
    Write-Host "GetFirstByNameKey('A')..."
    try {
        $result = $client.GetFirstByNameKey("A")
        Write-Host "Result: $result" -ForegroundColor Green
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} catch {
    Write-Host "Create error: $($_.Exception.Message)" -ForegroundColor Red
}
