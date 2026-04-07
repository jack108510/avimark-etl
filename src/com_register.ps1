# Load and inspect the AVImark COM Server typelib
# Then attempt registration

Write-Host "=== Step 1: Load TypeLib ===" -ForegroundColor Cyan

# Try loading the typelib directly
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public class TlbHelper {
    [DllImport("oleaut32.dll", CharSet = CharSet.Unicode)]
    public static extern int LoadTypeLib(string szFile, out ITypeLib ppTLib);
    
    [DllImport("oleaut32.dll")]
    public static extern int RegisterTypeLib(ITypeLib ptlib, string szFullPath, string szHelpDir);
}
"@

$tlb = $null
$hr = [TlbHelper]::LoadTypeLib("C:\AVImark\AVImarkCOMServer.dll", [ref]$tlb)
Write-Host "LoadTypeLib HRESULT: 0x$($hr.ToString('X8'))"

if ($hr -eq 0 -and $tlb -ne $null) {
    $count = $tlb.GetTypeInfoCount()
    Write-Host "Type info count: $count"
    
    # Get library attributes
    $libAttr = [IntPtr]::Zero
    $tlb.GetLibAttr([ref]$libAttr)
    if ($libAttr -ne [IntPtr]::Zero) {
        $attr = [System.Runtime.InteropServices.Marshal]::PtrToStructure($libAttr, [System.Runtime.InteropServices.ComTypes.TYPELIBATTR])
        Write-Host "Library GUID: $($attr.guid)"
        Write-Host "Library Version: $($attr.wMajorVerNum).$($attr.wMinorVerNum)"
        $tlb.ReleaseTLibAttr($libAttr)
    }
    
    for ($i = 0; $i -lt $count; $i++) {
        $name = ""
        $docString = ""
        $helpContext = 0
        $helpFile = ""
        $tlb.GetDocumentation($i, [ref]$name, [ref]$docString, [ref]$helpContext, [ref]$helpFile)
        
        $typeInfo = $null
        $tlb.GetTypeInfo($i, [ref]$typeInfo)
        
        $typeAttr = [IntPtr]::Zero
        $typeInfo.GetTypeAttr([ref]$typeAttr)
        $attr = [System.Runtime.InteropServices.Marshal]::PtrToStructure($typeAttr, [System.Runtime.InteropServices.ComTypes.TYPEATTR])
        
        $kind = $attr.typekind
        $guid = $attr.guid
        $funcCount = $attr.cFuncs
        
        Write-Host "`n[$i] $name (kind=$kind, funcs=$funcCount)" -ForegroundColor Yellow
        Write-Host "    GUID: $guid"
        Write-Host "    Desc: $docString"
        
        $typeInfo.ReleaseTypeAttr($typeAttr)
    }
    
    Write-Host "`n=== Step 2: Register TypeLib ===" -ForegroundColor Cyan
    $regHr = [TlbHelper]::RegisterTypeLib($tlb, "C:\AVImark\AVImarkCOMServer.dll", $null)
    Write-Host "RegisterTypeLib HRESULT: 0x$($regHr.ToString('X8'))"
    
} else {
    Write-Host "Failed to load typelib. Trying .tlb file..."
    $hr2 = [TlbHelper]::LoadTypeLib("C:\Users\Jackwilde\Projects\avimark-etl\avimark_com.tlb", [ref]$tlb)
    Write-Host "LoadTypeLib (extracted .tlb) HRESULT: 0x$($hr2.ToString('X8'))"
    
    if ($hr2 -eq 0 -and $tlb -ne $null) {
        $count = $tlb.GetTypeInfoCount()
        Write-Host "Type info count: $count"
        
        for ($i = 0; $i -lt $count; $i++) {
            $name = ""
            $docString = ""
            $helpContext = 0
            $helpFile = ""
            $tlb.GetDocumentation($i, [ref]$name, [ref]$docString, [ref]$helpContext, [ref]$helpFile)
            
            $typeInfo = $null
            $tlb.GetTypeInfo($i, [ref]$typeInfo)
            $typeAttr = [IntPtr]::Zero
            $typeInfo.GetTypeAttr([ref]$typeAttr)
            $attr = [System.Runtime.InteropServices.Marshal]::PtrToStructure($typeAttr, [System.Runtime.InteropServices.ComTypes.TYPEATTR])
            
            Write-Host "[$i] $name GUID=$($attr.guid) kind=$($attr.typekind) funcs=$($attr.cFuncs)" -ForegroundColor Yellow
            $typeInfo.ReleaseTypeAttr($typeAttr)
        }
    }
}

Write-Host "`n=== Step 3: Try COM Activation ===" -ForegroundColor Cyan

# Try creating COM objects with common ProgID patterns
$progIds = @(
    "AVImarkCOMServer.AVIClientInProc",
    "AVImarkCOMServer.AVIFileInProc",
    "AVImark.AVIClientInProc",
    "AVImark.AVIFileInProc",
    "AVIClientInProc",
    "AVIFileInProc"
)

foreach ($progId in $progIds) {
    try {
        $obj = New-Object -ComObject $progId -ErrorAction Stop
        Write-Host "  SUCCESS: $progId" -ForegroundColor Green
        Write-Host "  Methods: $($obj | Get-Member -MemberType Method | Select-Object -ExpandProperty Name)" 
    } catch {
        Write-Host "  FAILED: $progId - $($_.Exception.Message)" -ForegroundColor Red
    }
}
