Set-Location "C:\AVImark"
$t = New-Object -ComObject AVImarkCOMServer.AVITreatmentInProc
Write-Host "Treatment object created"
try { $r = $t.GetByCode("HC"); Write-Host "HC: $r" } catch { Write-Host "HC error: $($_.Exception.Message)" }
try { $r = $t.GetByCode("ANEX"); Write-Host "ANEX: $r" } catch { Write-Host "ANEX error: $($_.Exception.Message)" }

$f = New-Object -ComObject AVImarkCOMServer.AVIFileInProc  
Write-Host "File object created"
try { $f.OpenFiles("."); Write-Host "OpenFiles OK" } catch { Write-Host "OpenFiles(.): $($_.Exception.Message)" }
try { $f.OpenFiles("C:\AVImark"); Write-Host "OpenFiles OK" } catch { Write-Host "OpenFiles(C:\AVImark): $($_.Exception.Message)" }
try { $h = $f.GetFileHandle("PRICE"); Write-Host "PRICE handle: $h" } catch { Write-Host "GetFileHandle: $($_.Exception.Message)" }

$c = New-Object -ComObject AVImarkCOMServer.AVIClientInProc
Write-Host "Client object created"
try { $r = $c.GetFirstByNameKey("A"); Write-Host "Client A: $r" } catch { Write-Host "Client error: $($_.Exception.Message)" }
