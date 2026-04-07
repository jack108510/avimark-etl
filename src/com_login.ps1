Set-Location "C:\AVImark"

# Read the server password from INI
$serverPwd = "E41391C0F1235697DC2D79C4146DB20C65BAFF579EEC3E8FD42264B1F4428AE43475BF146BC40E66A7FF4098D92166ABF83E"
$clientPwd = "E41391C0F1235698DB206DBA014F9AE83D8CD32D76BE0758A2FB459CE0256FB3044589DA2373C0054EA0F03781CC1E67BE02"

$f = New-Object -ComObject AVImarkCOMServer.AVIFileInProc
Write-Host "FileInProc created"

# Try Login with various passwords
$passwords = @("", "password", "admin", "avimark", $serverPwd, $clientPwd, "AVImark")
foreach ($pwd in $passwords) {
    $display = if ($pwd.Length -gt 20) { $pwd.Substring(0,20) + "..." } else { $pwd }
    Write-Host "  Login('$display')... " -NoNewline
    try {
        $f.Login($pwd)
        Write-Host "SUCCESS!" -ForegroundColor Green
        break
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

# Try Treatment with login first
$t = New-Object -ComObject AVImarkCOMServer.AVITreatmentInProc
try { $t.Login($serverPwd) } catch {}
try { $r = $t.GetByCode("HC"); Write-Host "HC: $r" } catch { Write-Host "Treatment HC: $($_.Exception.Message)" }
