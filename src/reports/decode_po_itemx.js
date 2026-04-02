import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

// ============================================================
// PO.V2$ — 64 bytes/record, 28886 records
// From earlier scan: @21 = TDateTime (order date)
// Records alternate between two types — let's figure them out
// ============================================================
console.log('=== PO.V2$ Deep Decode ===\n');
const poFd = fs.openSync(dataDir + '\\PO.V2$', 'r');
const poStat = fs.statSync(dataDir + '\\PO.V2$');
const poTotal = Math.floor(poStat.size / 64);

// Read 20 records from various positions, full decode
for (const pos of [0, 1, 2, 3, 4, 5, 100, 101, 200, 201, 1000, 1001, poTotal-6, poTotal-5, poTotal-4, poTotal-3, poTotal-2, poTotal-1]) {
  if (pos >= poTotal) continue;
  const buf = Buffer.alloc(64);
  fs.readSync(poFd, buf, 0, 64, pos * 64);
  
  let ascii = '';
  for (let i = 0; i < 64; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  // Date at @21
  let date = null;
  try {
    const v = buf.readDoubleLE(21);
    if (v > 35000 && v < 47000) {
      date = new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0];
    }
  } catch(e) {}
  
  // Check for Pascal strings
  const strings = [];
  for (let off = 30; off < 60; off++) {
    const len = buf[off];
    if (len > 2 && len < 20 && off + 1 + len <= 64) {
      const s = buf.toString('ascii', off+1, off+1+len).replace(/[\x00-\x1F\x7F-\xFF]/g, '');
      if (/^[A-Za-z0-9 ]{2,}$/.test(s)) strings.push(`@${off}[${len}]="${s}"`);
    }
  }
  
  // Int32 values
  const int0 = buf.readInt32LE(0);
  const int4 = buf.readInt32LE(4);
  const int29 = buf.readUInt8(29);
  const int30 = buf.readUInt8(30);
  
  console.log(`Rec ${pos}: ${ascii}`);
  console.log(`  date=${date || 'none'} @0=${int0} @4=${int4} @29=${int29} @30=${int30}`);
  if (strings.length) console.log(`  Strings: ${strings.join(', ')}`);
  console.log('');
}
fs.closeSync(poFd);

// ============================================================
// ITEMXTRA.V2$ — find record size first
// ============================================================
console.log('\n=== ITEMXTRA.V2$ Deep Decode ===\n');
const ixStat = fs.statSync(dataDir + '\\ITEMXTRA.V2$');
console.log(`Size: ${ixStat.size} bytes (${(ixStat.size/1024/1024).toFixed(2)} MB)`);

// Find record size
const candidates = [];
for (const s of [32, 48, 64, 80, 96, 108, 112, 128, 160, 192, 224, 256, 320, 384, 512]) {
  if (ixStat.size % s === 0) candidates.push({ size: s, recs: ixStat.size / s });
}
console.log('Record size candidates:', candidates.map(c => `${c.size}b→${c.recs}r`).join(', '));

const ixFd = fs.openSync(dataDir + '\\ITEMXTRA.V2$', 'r');

// Try the most likely size and read some records
for (const { size: recSize, recs: totalRecs } of candidates.filter(c => c.size >= 48 && c.size <= 256)) {
  console.log(`\nTrying ${recSize} bytes (${totalRecs} records):`);
  
  for (const pos of [0, 1, 100, totalRecs-2, totalRecs-1]) {
    if (pos >= totalRecs) continue;
    const buf = Buffer.alloc(recSize);
    fs.readSync(ixFd, buf, 0, recSize, pos * recSize);
    
    let ascii = '';
    for (let i = 0; i < Math.min(recSize, 80); i++) {
      const b = buf[i];
      ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
    }
    
    // Look for dates, quantities, codes
    const dates = [];
    for (let off = 0; off + 8 <= recSize; off++) {
      try {
        const v = buf.readDoubleLE(off);
        if (v > 35000 && v < 47000) {
          dates.push(`@${off}=${new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0]}`);
        }
      } catch(e) {}
    }
    
    // Int32 values that look like quantities (1-99999)
    const qtys = [];
    for (let off = 0; off < recSize - 3; off += 4) {
      const v = buf.readInt32LE(off);
      if (v > 0 && v < 100000) qtys.push(`@${off}=${v}`);
    }
    
    console.log(`  Rec ${pos}: ${ascii}`);
    if (dates.length) console.log(`    DATES: ${dates.join(', ')}`);
    if (qtys.length) console.log(`    QTY-like: ${qtys.join(', ')}`);
  }
}
fs.closeSync(ixFd);
