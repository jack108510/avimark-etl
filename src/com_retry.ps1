Set-Location "C:\AVImark"
$f = New-Object -ComObject AVImarkCOMServer.AVIFileInProc
Write-Host "Trying Login..."
try { $f.Login(""); Write-Host "Login OK!" } catch { Write-Host "Login: $($_.Exception.Message)" }
try { $f.OpenFiles("C:\AVImark"); Write-Host "OpenFiles OK!" } catch { Write-Host "OpenFiles: $($_.Exception.Message)" }
try { $names = $f.GetFileNames(); Write-Host "Files: $names" } catch { Write-Host "GetFileNames: $($_.Exception.Message)" }

$t = New-Object -ComObject AVImarkCOMServer.AVITreatmentInProc
try { $r = $t.GetByCode("HC"); Write-Host "HC: $r" } catch { Write-Host "GetByCode HC: $($_.Exception.Message)" }

$c = New-Object -ComObject AVImarkCOMServer.AVIClientInProc
try { $r = $c.GetFirstByNameKey("A"); Write-Host "Client A: $r" } catch { Write-Host "Client A: $($_.Exception.Message)" }
