import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// SERVICE.V2$ bytes 20-27 as a double at offset 21 gave dates for PRICE.V2$.
// Let's try the same for SERVICE.V2$ — but earlier scans showed "no date doubles."
// That's because we tried aligned offsets. Let's try @21 (unaligned) like PRICE.V2$.
// Also try other unaligned offsets.

const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
const totalRecs = Math.floor(stat.size / 256);

console.log('=== Testing unaligned offsets for dates in SERVICE.V2$ ===\n');

const positions = [0, 100, 1000, 10000, 50000, 100000, 300000, 500000, 600000, totalRecs - 5, totalRecs - 1];

for (const pos of positions) {
  const buf = Buffer.alloc(256);
  fs.readSync(fd, buf, 0, 256, pos * 256);
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  const dates = [];
  // Try EVERY offset from 0-248
  for (let off = 0; off + 8 <= 256; off++) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        const dt = new Date(DELPHI_EPOCH + v * 86400000);
        dates.push({ off, date: dt.toISOString().split('T')[0], raw: v.toFixed(4) });
      }
    } catch(e) {}
  }
  
  console.log(`Rec ${pos} (${code}):`);
  if (dates.length) {
    for (const d of dates) {
      console.log(`  @${d.off} → ${d.date} (${d.raw})`);
    }
  } else {
    console.log('  No dates found at any offset');
    // Show bytes 20-27 hex
    console.log(`  @20-27: ${buf.subarray(20, 28).toString('hex')}`);
  }
}

fs.closeSync(fd);

// Alternative: SERVICE.V2$ links to ANIMAL via @4.
// ANIMAL records might have visit dates that we can correlate.
// But better: VISIT.V2$ likely has dates AND links to SERVICE records.

console.log('\n\n=== VISIT.V2$ deep dive ===\n');
const vfd = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const vstat = fs.statSync(dataDir + '\\VISIT.V2$');
// Try 256 byte records (it was divisible by 256)
const vRecSize = 256;
const vTotalRecs = Math.floor(vstat.size / vRecSize);

for (const pos of [0, 1, 100, 1000, vTotalRecs - 5, vTotalRecs - 1]) {
  const buf = Buffer.alloc(vRecSize);
  fs.readSync(vfd, buf, 0, vRecSize, pos * vRecSize);
  
  const dates = [];
  for (let off = 0; off + 8 <= vRecSize; off++) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        const dt = new Date(DELPHI_EPOCH + v * 86400000);
        dates.push({ off, date: dt.toISOString().split('T')[0] });
      }
    } catch(e) {}
  }
  
  let ascii = '';
  for (let i = 30; i < 70; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  const int40 = buf.readInt32LE(40);
  
  console.log(`Rec ${pos}: @40=${int40} ascii[30-70]="${ascii}"`);
  if (dates.length) {
    for (const d of dates) console.log(`  @${d.off} → ${d.date}`);
  }
}
fs.closeSync(vfd);

// Also check: does SERVICE link to VISIT?
// @40 in VISIT had values like 289604, 302148 — these are within SERVICE range (625K).
// So VISIT.@40 might point to the first SERVICE record for that visit!
// If VISIT has dates, we can map VISIT→SERVICE and get dates for each service.
console.log('\n\n=== Testing VISIT.@40 as SERVICE record pointer ===');
const testFd = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const sfd2 = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');

// Read last 5 visits
for (let r = vTotalRecs - 5; r < vTotalRecs; r++) {
  const vbuf = Buffer.alloc(256);
  fs.readSync(testFd, vbuf, 0, 256, r * 256);
  
  const servicePtr = vbuf.readInt32LE(40);
  
  // Check for visit date
  let visitDate = null;
  for (let off = 20; off <= 28; off++) {
    try {
      const v = vbuf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        visitDate = new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0];
        break;
      }
    } catch(e) {}
  }
  
  // Read the SERVICE record pointed to
  if (servicePtr > 0 && servicePtr < totalRecs) {
    const sbuf = Buffer.alloc(256);
    fs.readSync(sfd2, sbuf, 0, 256, servicePtr * 256);
    const codeLen = Math.min(sbuf[103] || 0, 12);
    const code = codeLen > 0 ? sbuf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
    console.log(`Visit ${r}: date=${visitDate || '?'}, servicePtr=${servicePtr}, serviceCode=${code}`);
  } else {
    console.log(`Visit ${r}: date=${visitDate || '?'}, servicePtr=${servicePtr} (out of range)`);
  }
}

fs.closeSync(testFd);
fs.closeSync(sfd2);
