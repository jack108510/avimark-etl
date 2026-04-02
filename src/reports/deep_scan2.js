import fs from 'fs';

const dataDir = 'C:\\AVImark';

// SERVICE.V2$ @20-27 has two int32s that look like they could encode a Delphi TDateTime as 
// two 32-bit parts. Let's check @20 and @24 more carefully.
// Actually @24 is consistently around -427697xxx across records. That's suspicious.
// Let's treat bytes 20-27 as a single int64 or double more carefully.

const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
const totalRecs = Math.floor(stat.size / 256);

console.log('SERVICE.V2$ date hunting\n');

// Sample from various positions
const positions = [100, 1000, 10000, 100000, 300000, 500000, totalRecs - 100, totalRecs - 10];

for (const pos of positions) {
  const buf = Buffer.alloc(256);
  fs.readSync(fd, buf, 0, 256, pos * 256);
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  const nameLen = Math.min(buf[53] || 0, 50);
  const name = nameLen > 0 ? buf.toString('ascii', 54, 54 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Try every 8-byte aligned offset as a Delphi TDateTime (double, days since 1899-12-30)
  const dates = [];
  for (let off = 0; off + 8 <= 256; off += 8) {
    const v = buf.readDoubleLE(off);
    if (v > 35000 && v < 47000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
    }
  }
  for (let off = 4; off + 8 <= 256; off += 8) {
    const v = buf.readDoubleLE(off);
    if (v > 35000 && v < 47000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      dates.push(`@${off}(u)=${dt.toISOString().split('T')[0]}`);
    }
  }
  
  console.log(`Rec ${pos}: code=${code}, name=${name.substring(0,30)}`);
  if (dates.length) console.log(`  DATES: ${dates.join(', ')}`);
  else console.log('  No date doubles found');
  
  // Show raw bytes 0-7 as hex
  console.log(`  Bytes 0-7: ${buf.subarray(0, 8).toString('hex')}`);
  console.log(`  Bytes 20-27: ${buf.subarray(20, 28).toString('hex')}`);
}

fs.closeSync(fd);

// Now check VISIT.V2$ for dates - it likely has TDateTime
console.log('\n\nVISIT.V2$ date hunting\n');
const fd2 = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const vstat = fs.statSync(dataDir + '\\VISIT.V2$');
const vTotal = Math.floor(vstat.size / 256);

for (const pos of [vTotal - 5, vTotal - 4, vTotal - 3, vTotal - 2, vTotal - 1]) {
  const buf = Buffer.alloc(256);
  fs.readSync(fd2, buf, 0, 256, pos * 256);
  
  const dates = [];
  for (let off = 0; off + 8 <= 256; off += 8) {
    const v = buf.readDoubleLE(off);
    if (v > 35000 && v < 47000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
    }
  }
  for (let off = 4; off + 8 <= 256; off += 8) {
    const v = buf.readDoubleLE(off);
    if (v > 35000 && v < 47000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      dates.push(`@${off}(u)=${dt.toISOString().split('T')[0]}`);
    }
  }
  
  // ASCII
  let ascii = '';
  for (let i = 0; i < 60; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  console.log(`Rec ${pos}: ${ascii}`);
  if (dates.length) console.log(`  DATES: ${dates.join(', ')}`);
  
  // Also check: does VISIT link to ANIMAL? offset @4 has small numbers...
  console.log(`  Int32 @0=${buf.readInt32LE(0)} @4=${buf.readInt32LE(4)} @8=${buf.readInt32LE(8)} @40=${buf.readInt32LE(40)}`);
}
fs.closeSync(fd2);
