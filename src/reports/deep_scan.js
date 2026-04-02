import fs from 'fs';

const dataDir = 'C:\\AVImark';

// Check ENTRY.V2$, VISIT.V2$, and SERVICE.V2$ structure
// SERVICE.V2$ is 256 bytes/rec — we know code is at 104, name at 54
// But what's in the first 42 bytes? Likely foreign keys (animal_id, entry_id, etc.)

function dumpRecords(filename, recSize, count, startOffset = 0) {
  const fp = dataDir + '\\' + filename;
  if (!fs.existsSync(fp)) { console.log(filename + ' not found'); return; }
  const stat = fs.statSync(fp);
  const totalRecs = Math.floor(stat.size / recSize);
  const fd = fs.openSync(fp, 'r');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${filename}: ${totalRecs} records @ ${recSize} bytes (${(stat.size/1024/1024).toFixed(1)} MB)`);
  console.log('='.repeat(60));
  
  // Read from near end (recent records)
  const start = Math.max(0, totalRecs - count);
  for (let r = start; r < start + count && r < totalRecs; r++) {
    const buf = Buffer.alloc(recSize);
    fs.readSync(fd, buf, 0, recSize, r * recSize);
    
    // Check all int32 values for potential record IDs (links) and dates
    const int32s = [];
    for (let off = 0; off < Math.min(recSize, 48); off += 4) {
      int32s.push({ off, val: buf.readInt32LE(off) });
    }
    
    // Check for Delphi TDateTime doubles in first 48 bytes
    const doubles = [];
    for (let off = 0; off < Math.min(recSize, 48); off += 8) {
      const v = buf.readDoubleLE(off);
      if (v > 30000 && v < 50000) {
        const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
        doubles.push({ off, date: dt.toISOString().split('T')[0] });
      }
    }
    
    // Extract readable text
    let ascii = '';
    for (let i = 0; i < recSize; i++) {
      const b = buf[i];
      ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
    }
    
    console.log(`\nRec ${r}:`);
    console.log('  Int32s (first 48 bytes):', int32s.map(i => `@${i.off}=${i.val}`).join(', '));
    if (doubles.length) console.log('  Dates found:', doubles.map(d => `@${d.off}=${d.date}`).join(', '));
    console.log('  ASCII:', ascii.substring(0, 120));
  }
  fs.closeSync(fd);
}

// Try to figure out ENTRY record size
const entrySize = fs.statSync(dataDir + '\\ENTRY.V2$').size;
console.log('ENTRY.V2$ size:', entrySize);
for (const s of [32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 256, 512]) {
  if (entrySize % s === 0) console.log(`  divisible by ${s} → ${entrySize/s} records`);
}

const visitSize = fs.statSync(dataDir + '\\VISIT.V2$').size;
console.log('\nVISIT.V2$ size:', visitSize);
for (const s of [32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 256, 512]) {
  if (visitSize % s === 0) console.log(`  divisible by ${s} → ${visitSize/s} records`);
}

// SERVICE.V2$ - look at the int32 fields at the start (likely foreign keys)
dumpRecords('SERVICE.V2$', 256, 10);

// ENTRY.V2$ - try likely sizes
const likelyEntrySize = [192, 208, 224][0]; // will try 192 first
dumpRecords('ENTRY.V2$', 192, 5);

// VISIT.V2$ - try sizes
dumpRecords('VISIT.V2$', 256, 5);
