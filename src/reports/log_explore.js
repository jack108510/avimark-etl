import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// Big active LOG files to investigate:
// LOG004.V2$ — 363 MB (biggest, recently modified)
// LOG016.V2$ — 284 MB
// LOG015.V2$ — 189 MB
// LOG003.V2$ — 181 MB

// Also SERVICE.V2$ might link to something with dates.
// SERVICE @4 was often < 27000 (animal_id range). 
// SERVICE @0 seems random (hash?). What about other int32 fields?

// Let's check if SERVICE has a pointer to a LOG or VISIT record
console.log('=== SERVICE.V2$ foreign key analysis ===\n');
const sfd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const sstat = fs.statSync(dataDir + '\\SERVICE.V2$');
const sTotalRecs = Math.floor(sstat.size / 256);

// Sample last 10 records, look at all int32 fields
for (let r = sTotalRecs - 5; r < sTotalRecs; r++) {
  const buf = Buffer.alloc(256);
  fs.readSync(sfd, buf, 0, 256, r * 256);
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Collect all int32 values at 4-byte boundaries
  const fields = {};
  for (let off = 0; off < 40; off += 4) {
    fields[off] = buf.readInt32LE(off);
  }
  // Also check @160+
  for (let off = 160; off < 200; off += 4) {
    fields[off] = buf.readInt32LE(off);
  }
  
  console.log(`Rec ${r} (${code}):`);
  console.log(`  @0=${fields[0]} @4=${fields[4]} @8=${fields[8]} @12=${fields[12]} @16=${fields[16]}`);
  console.log(`  @20-27 hex: ${buf.subarray(20, 28).toString('hex')}`);
  console.log(`  @160=${fields[160]} @164=${fields[164]} @168=${fields[168]} @172=${fields[172]}`);
}
fs.closeSync(sfd);

// Now explore the big LOG files
const bigLogs = [
  { name: 'LOG004.V2$', desc: 'biggest (363MB)' },
  { name: 'LOG003.V2$', desc: '181MB' },
  { name: 'LOG001.V2$', desc: '39MB' },
  { name: 'LOG011.V2$', desc: '60MB - services?' },
];

for (const log of bigLogs) {
  const fp = dataDir + '\\' + log.name;
  const stat = fs.statSync(fp);
  
  // Find record size
  const sizes = [];
  for (const s of [32, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 512]) {
    if (stat.size % s === 0) sizes.push({ s, n: stat.size / s });
  }
  
  console.log(`\n\n=== ${log.name} (${(stat.size/1024/1024).toFixed(1)} MB) — ${log.desc} ===`);
  console.log('Possible record sizes:', sizes.map(x => `${x.s}b→${x.n}recs`).join(', '));
  
  const fd = fs.openSync(fp, 'r');
  
  // For each plausible record size, read last 3 records and check for dates + codes
  for (const { s: recSize, n: nRecs } of sizes.filter(x => x.s >= 64 && x.s <= 512)) {
    let foundDates = 0;
    let foundCodes = 0;
    
    // Check last 5 records
    for (let r = nRecs - 5; r < nRecs; r++) {
      const buf = Buffer.alloc(recSize);
      fs.readSync(fd, buf, 0, recSize, r * recSize);
      
      // Look for TDateTime doubles
      for (let off = 0; off + 8 <= recSize; off += 4) {
        try {
          const v = buf.readDoubleLE(off);
          if (v > 35000 && v < 47000) foundDates++;
        } catch(e) {}
      }
      
      // Look for treatment code strings
      let ascii = '';
      for (let i = 0; i < recSize; i++) {
        const b = buf[i];
        ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '\0';
      }
      if (/ANEX|APPT|PAT1|NOTE|VACC|BLOOD|GERI/.test(ascii)) foundCodes++;
    }
    
    if (foundDates > 0 || foundCodes > 0) {
      console.log(`  RecSize ${recSize}: dates=${foundDates}, codes=${foundCodes} ← PROMISING`);
      
      // Show last 2 records for this size
      for (let r = nRecs - 2; r < nRecs; r++) {
        const buf = Buffer.alloc(recSize);
        fs.readSync(fd, buf, 0, recSize, r * recSize);
        
        let ascii = '';
        for (let i = 0; i < Math.min(recSize, 100); i++) {
          const b = buf[i];
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        }
        
        const dates = [];
        for (let off = 0; off + 8 <= recSize; off += 4) {
          try {
            const v = buf.readDoubleLE(off);
            if (v > 44000 && v < 47000) { // recent dates only (2020+)
              const dt = new Date(DELPHI_EPOCH + v * 86400000);
              dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
            }
          } catch(e) {}
        }
        
        console.log(`    Rec ${r}: ${ascii}`);
        if (dates.length) console.log(`    DATES: ${dates.join(', ')}`);
      }
    }
  }
  fs.closeSync(fd);
}

// Check WP (write-pointer?) files
console.log('\n\n=== LOG004WP.V2$ (write pointer file?) ===');
const wpBuf = fs.readFileSync(dataDir + '\\LOG004WP.V2$');
console.log('Size:', wpBuf.length, 'bytes');
console.log('Hex:', wpBuf.subarray(0, Math.min(64, wpBuf.length)).toString('hex'));
