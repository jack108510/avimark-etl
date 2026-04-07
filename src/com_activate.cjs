#!/usr/bin/env node
/**
 * Attempt to extract CLSIDs from AVImark COM Server typelib and activate COM objects.
 * Tries multiple approaches:
 * 1. Parse MSFT typelib binary for CLSIDs
 * 2. Try regsvr32 from the AVImark directory
 * 3. Try direct DllGetClassObject via FFI
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dllPath = 'C:\\AVImark\\AVImarkCOMServer.dll';
const tlbPath = 'C:\\Users\\Jackwilde\\Projects\\avimark-etl\\avimark_com.tlb';

// Step 1: Parse the typelib for GUIDs
// MSFT typelib format: GUIDs are stored as 16-byte binary blocks
console.log('=== Step 1: Extracting GUIDs from typelib ===');
const tlb = fs.readFileSync(tlbPath);

// MSFT header magic
const magic = tlb.toString('ascii', 0, 4);
console.log('TLB magic:', magic);

// GUIDs in MSFT typelibs are at the GUID table
// Parse MSFT header to find GUID table offset
// Offsets based on MSFT typelib format:
// @0: magic (MSFT)
// @4: version
// @8: flags  
// @56: nrtypeinfos
// @60: helpstring offset
// ...GUID table is further in

// Quick scan: look for 16-byte sequences that look like valid GUIDs
const guids = [];
for (let i = 0; i < tlb.length - 16; i++) {
  // A GUID has Data1(4) Data2(2) Data3(2) Data4(8)
  // Common COM GUIDs have non-zero Data1 and typical version nibble in Data3
  const d1 = tlb.readUInt32LE(i);
  const d2 = tlb.readUInt16LE(i + 4);
  const d3 = tlb.readUInt16LE(i + 6);
  
  if (d1 === 0 || d2 === 0 || d3 === 0) continue;
  
  // Check if Data3 upper nibble is a valid version (1-5)
  const version = (d3 >> 12) & 0xF;
  if (version < 1 || version > 5) continue;
  
  // Format as GUID string
  const hex = (n, len) => n.toString(16).padStart(len, '0').toUpperCase();
  const d4 = [];
  for (let j = 0; j < 8; j++) d4.push(hex(tlb[i + 8 + j], 2));
  
  const guid = `{${hex(d1,8)}-${hex(d2,4)}-${hex(d3,4)}-${d4.slice(0,2).join('')}-${d4.slice(2).join('')}}`;
  
  // Filter: skip known standard GUIDs
  if (guid.startsWith('{00000000-') || guid.startsWith('{00020400-')) continue;
  
  guids.push({ offset: i, guid });
}

// Deduplicate
const uniqueGuids = [...new Set(guids.map(g => g.guid))];
console.log(`Found ${uniqueGuids.length} potential GUIDs:`);
for (const g of uniqueGuids.slice(0, 30)) {
  console.log(' ', g);
}

// Step 2: Scan the main DLL for GUIDs too
console.log('\n=== Step 2: Scanning DLL for CLSID patterns ===');
const dll = fs.readFileSync(dllPath);

// Look for the DllRegisterServer exported function's data
// Delphi COM servers typically store factory info near the exports
// Search for known interface name strings near GUID-like binary sequences

// Look for the string "AVImarkCOMServer" and nearby GUIDs
const dllStr = dll.toString('latin1');
const comServerIdx = dllStr.indexOf('AVImarkCOMServer');
console.log('AVImarkCOMServer string at offset:', comServerIdx);

// Search around that area for GUIDs  
if (comServerIdx > 0) {
  const searchStart = Math.max(0, comServerIdx - 10000);
  const searchEnd = Math.min(dll.length - 16, comServerIdx + 10000);
  
  const nearbyGuids = [];
  for (let i = searchStart; i < searchEnd; i++) {
    const d1 = dll.readUInt32LE(i);
    const d2 = dll.readUInt16LE(i + 4);
    const d3 = dll.readUInt16LE(i + 6);
    
    if (d1 === 0 || d2 === 0 || d3 === 0) continue;
    const version = (d3 >> 12) & 0xF;
    if (version < 1 || version > 5) continue;
    
    const hex = (n, len) => n.toString(16).padStart(len, '0').toUpperCase();
    const d4 = [];
    for (let j = 0; j < 8; j++) d4.push(hex(dll[i + 8 + j], 2));
    const guid = `{${hex(d1,8)}-${hex(d2,4)}-${hex(d3,4)}-${d4.slice(0,2).join('')}-${d4.slice(2).join('')}}`;
    
    nearbyGuids.push({ offset: i, guid });
  }
  
  const uniqueNear = [...new Set(nearbyGuids.map(g => g.guid))];
  console.log(`Found ${uniqueNear.length} GUIDs near COM server string:`);
  for (const g of uniqueNear.slice(0, 20)) {
    console.log(' ', g);
  }
}

// Step 3: Look for Delphi TComObjectFactory registration data
// Delphi stores class factories in a linked list, each with CLSID, ClassName, ProgID
// Search for "AVIClient", "AVIPatient", etc. strings and their nearby GUIDs
console.log('\n=== Step 3: Finding class factory entries ===');
const classNames = [
  'AVIClientInProc', 'AVIPatientInProc', 'AVITreatmentInProc',
  'AVIInventoryInProc', 'AVIHistoryInProc', 'AVIEntryInProc',
  'AVISystemTableInProc', 'AVIOrderInProc', 'AVIFileInProc',
  'AVIEstimateInProc', 'AVIAppointmentInProc', 'AVICensusInProc'
];

for (const name of classNames) {
  let idx = 0;
  const offsets = [];
  while (true) {
    idx = dllStr.indexOf(name, idx);
    if (idx === -1) break;
    offsets.push(idx);
    idx += name.length;
  }
  
  if (offsets.length > 0) {
    console.log(`\n${name} found at ${offsets.length} offsets:`);
    // For each occurrence, check nearby for 16-byte GUID patterns
    for (const off of offsets.slice(0, 3)) {
      // Look backwards up to 200 bytes for a GUID
      for (let scan = off - 200; scan < off; scan += 4) {
        if (scan < 0) continue;
        const d1 = dll.readUInt32LE(scan);
        if (d1 === 0) continue;
        const d2 = dll.readUInt16LE(scan + 4);
        const d3 = dll.readUInt16LE(scan + 6);
        if (d2 === 0 || d3 === 0) continue;
        
        const hex = (n, len) => n.toString(16).padStart(len, '0').toUpperCase();
        const d4 = [];
        for (let j = 0; j < 8; j++) d4.push(hex(dll[scan + 8 + j], 2));
        const guid = `{${hex(d1,8)}-${hex(d2,4)}-${hex(d3,4)}-${d4.slice(0,2).join('')}-${d4.slice(2).join('')}}`;
        
        // Heuristic: reasonable CLSID has version 1-5
        const version = (d3 >> 12) & 0xF;
        if (version >= 1 && version <= 5) {
          console.log(`  @${off} nearby GUID @${scan}: ${guid}`);
        }
      }
    }
  }
}
