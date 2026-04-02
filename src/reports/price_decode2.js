import fs from 'fs';

// From the PRICE.V2$ analysis:
// @28 = always 64 or 320 — flags?
// @40-41 = seems to encode type (A=0x41)
// @42+ = Pascal-style code string
// @64 = currency value (Delphi int64/10000)
// Bytes 0-27 = some kind of hash/random + possible date
// @24 changes gradually: -468100417, -467710017, -468100402... for early records
//   vs -427723550, -427708148 for late records
// That's a ~40 million difference. Let's see if @24 or @20-27 encode a Delphi date.

// @24 values: 
//   Rec 0: -468100417 → could be signed int part of a double
//   Rec 12673: -427708145

// Actually, let's look at bytes 20-27 as a DOUBLE
const dataDir = 'C:\\AVImark';
const fd = fs.openSync(dataDir + '\\PRICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\PRICE.V2$');
const recSize = 108;
const totalRecs = Math.floor(stat.size / recSize);

const positions = [0, 1, 100, 500, 1000, 5000, 10000, 12670, totalRecs-1];
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

console.log('Testing bytes 20-27 as Delphi TDateTime (double):\n');

for (const pos of positions) {
  const buf = Buffer.alloc(recSize);
  fs.readSync(fd, buf, 0, recSize, pos * recSize);
  
  const codeLen = Math.min(buf[42] || 0, 14);
  const code = codeLen > 0 ? buf.toString('ascii', 43, 43 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Try every possible 8-byte window as a double
  for (let off = 16; off <= 28; off++) {
    if (off + 8 > recSize) continue;
    const v = buf.readDoubleLE(off);
    if (v > 30000 && v < 50000) {
      const dt = new Date(DELPHI_EPOCH + v * 86400000);
      console.log(`Rec ${pos} (${code}): @${off} = ${v.toFixed(6)} → ${dt.toISOString().split('T')[0]}`);
    }
  }
}

// Let's also try: take the int32 at @24, negate or transform it, see if it maps to dates
console.log('\n\nTrying int32 @24 transformations:\n');
for (const pos of positions) {
  const buf = Buffer.alloc(recSize);
  fs.readSync(fd, buf, 0, recSize, pos * recSize);
  const codeLen = Math.min(buf[42] || 0, 14);
  const code = codeLen > 0 ? buf.toString('ascii', 43, 43 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  const v24 = buf.readInt32LE(24);
  const u24 = buf.readUInt32LE(24);
  
  // Try as unsigned / 100 (Delphi sometimes stores dates as int)
  const asUnsigned = u24;
  // Try XOR with some mask
  // Try as days since some epoch
  console.log(`Rec ${pos} (${code}): @24 signed=${v24}, unsigned=${u24}`);
}

// Let's try a completely different approach — look at LOG files
// LOG004.V2$ is 363 MB, likely the main transaction log
// It probably has dates + treatment codes for every charge
console.log('\n\n=== Checking LOG004.V2$ (363 MB — main transaction log?) ===');
const logStat = fs.statSync(dataDir + '\\LOG004.V2$');
console.log('Size:', (logStat.size/1024/1024).toFixed(1), 'MB');

// Determine record size
for (const s of [32, 48, 64, 80, 96, 112, 128, 160, 192, 256, 512]) {
  if (logStat.size % s === 0) console.log(`  Divisible by ${s} → ${logStat.size/s} records`);
}

// Read last few records at likely sizes
const logFd = fs.openSync(dataDir + '\\LOG004.V2$', 'r');
for (const trySize of [64, 128, 256]) {
  if (logStat.size % trySize !== 0) continue;
  const nRecs = logStat.size / trySize;
  console.log(`\nTrying record size ${trySize} (${nRecs} records):`);
  
  for (let r = nRecs - 3; r < nRecs; r++) {
    const buf = Buffer.alloc(trySize);
    fs.readSync(logFd, buf, 0, trySize, r * trySize);
    
    let ascii = '';
    for (let i = 0; i < Math.min(trySize, 120); i++) {
      const b = buf[i];
      ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
    }
    
    // Check for dates
    const dates = [];
    for (let off = 0; off + 8 <= trySize; off += 4) {
      try {
        const v = buf.readDoubleLE(off);
        if (v > 35000 && v < 47000) {
          const dt = new Date(DELPHI_EPOCH + v * 86400000);
          dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
        }
      } catch(e) {}
    }
    
    console.log(`  Rec ${r}: ${ascii}`);
    if (dates.length) console.log(`  DATES: ${dates.join(', ')}`);
  }
}
fs.closeSync(logFd);

fs.closeSync(fd);
