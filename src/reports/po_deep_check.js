import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();
const fd = fs.openSync(dataDir + '\\PO.V2$', 'r');
const stat = fs.statSync(dataDir + '\\PO.V2$');
const recSize = 64;
const totalRecs = Math.floor(stat.size / recSize);

console.log(`PO.V2$ — ${totalRecs} records @ ${recSize} bytes\n`);

// Full hex + ascii dump of records at key positions
function dumpRecord(pos) {
  const buf = Buffer.alloc(recSize);
  fs.readSync(fd, buf, 0, recSize, pos * recSize);
  
  let ascii = '';
  for (let i = 0; i < recSize; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  // Hex in 16-byte rows
  let hex = '';
  for (let i = 0; i < recSize; i++) {
    hex += buf[i].toString(16).padStart(2, '0') + ' ';
    if ((i+1) % 16 === 0) hex += '\n         ';
  }
  
  // Try ALL offsets for dates
  const dates = [];
  for (let off = 0; off + 8 <= recSize; off++) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        dates.push(`@${off}=${new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0]} (${v.toFixed(2)})`);
      }
    } catch(e) {}
  }
  
  // All int32s
  const ints = [];
  for (let off = 0; off < recSize; off += 4) {
    ints.push(`@${off}=${buf.readInt32LE(off)}`);
  }
  
  // Pascal strings
  const strings = [];
  for (let off = 0; off < recSize - 2; off++) {
    const len = buf[off];
    if (len >= 2 && len <= 20 && off + 1 + len <= recSize) {
      const s = buf.toString('ascii', off+1, off+1+len).replace(/[\x00-\x1F\x7F-\xFF]/g, '');
      if (s.length >= 2 && /^[A-Za-z0-9 .#\-]+$/.test(s)) {
        strings.push(`@${off}[${len}]="${s}"`);
      }
    }
  }
  
  console.log(`=== Record ${pos} ===`);
  console.log(`ASCII: ${ascii}`);
  console.log(`Hex:   ${hex}`);
  if (dates.length) console.log(`Dates: ${dates.join(', ')}`);
  console.log(`Strings: ${strings.join(', ')}`);
  console.log(`Int32s: ${ints.join(', ')}`);
  console.log('');
}

// Sample from throughout the file
console.log('=== EARLY RECORDS ===\n');
for (let i = 0; i < 8; i++) dumpRecord(i);

console.log('\n=== MIDDLE RECORDS (around rec 14000) ===\n');
for (let i = 14000; i < 14008; i++) dumpRecord(i);

console.log('\n=== RECENT RECORDS (last 8) ===\n');
for (let i = totalRecs - 8; i < totalRecs; i++) dumpRecord(i);

fs.closeSync(fd);

// Also check: is the file really 64-byte records, or something else?
console.log('\n=== File structure check ===');
console.log('File size:', stat.size, 'bytes');
console.log('/ 64 =', stat.size / 64, 'records, remainder:', stat.size % 64);
console.log('/ 128 =', stat.size / 128, 'records, remainder:', stat.size % 128);
console.log('/ 32 =', stat.size / 32, 'records, remainder:', stat.size % 32);
