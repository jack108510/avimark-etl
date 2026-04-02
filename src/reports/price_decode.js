import fs from 'fs';

const dataDir = 'C:\\AVImark';
const fd = fs.openSync(dataDir + '\\PRICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\PRICE.V2$');
const recSize = 108;
const totalRecs = Math.floor(stat.size / recSize);

console.log(`PRICE.V2$ — ${totalRecs} records @ ${recSize} bytes\n`);

// We know from our parser: treatment_code and price are in here somewhere.
// Let's do a thorough decode of a few records.

// Read our existing price parser to see what we already know
import { readFileSync } from 'fs';

// From prices.js parser we know the structure somewhat. Let's look at raw bytes.
// Read 20 records from various positions
const positions = [0, 1, 2, 3, 4, 100, 500, 1000, 5000, 10000, totalRecs-5, totalRecs-4, totalRecs-3, totalRecs-2, totalRecs-1];

for (const pos of positions) {
  const buf = Buffer.alloc(recSize);
  fs.readSync(fd, buf, 0, recSize, pos * recSize);
  
  // Hex dump in groups of 4 bytes
  let hexLine = '';
  for (let i = 0; i < recSize; i++) {
    hexLine += buf[i].toString(16).padStart(2, '0');
    if ((i+1) % 4 === 0) hexLine += ' ';
    if ((i+1) % 32 === 0) hexLine += '\n         ';
  }
  
  // ASCII
  let ascii = '';
  for (let i = 0; i < recSize; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  // Try to find the treatment code (Pascal-style: length byte + string)
  // Try various offsets for length+string
  const codeAttempts = [];
  for (let off = 30; off < 80; off++) {
    const len = buf[off];
    if (len > 2 && len < 15) {
      const s = buf.toString('ascii', off+1, off+1+len).replace(/[\x00-\x1F\x7F-\xFF]/g, '');
      if (/^[A-Z0-9$ ]{2,14}$/.test(s)) {
        codeAttempts.push({ off, len, str: s });
      }
    }
  }
  
  // Try reading doubles at every offset for Delphi TDateTime
  const dates = [];
  for (let off = 0; off + 8 <= recSize; off += 4) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
        dates.push({ off, date: dt.toISOString().split('T')[0], raw: v.toFixed(4) });
      }
    } catch(e) {}
  }
  
  // Int32 values
  const ints = [];
  for (let off = 0; off < recSize; off += 4) {
    const v = buf.readInt32LE(off);
    if (v !== 0) ints.push(`@${off}=${v}`);
  }
  
  // Delphi currency (int64/10000) at various offsets
  const currencies = [];
  for (let off = 0; off + 8 <= recSize; off += 8) {
    const lo = buf.readUInt32LE(off);
    const hi = buf.readInt32LE(off + 4);
    const raw = hi * 0x100000000 + lo;
    const val = raw / 10000;
    if (val > 0.5 && val < 100000) {
      currencies.push({ off, val: val.toFixed(2) });
    }
  }
  
  console.log(`\n=== Rec ${pos} ===`);
  console.log(`ASCII: ${ascii}`);
  if (codeAttempts.length) console.log(`Codes: ${codeAttempts.map(c => `@${c.off}[${c.len}]="${c.str}"`).join(', ')}`);
  if (dates.length) console.log(`DATES: ${dates.map(d => `@${d.off}=${d.date} (${d.raw})`).join(', ')}`);
  console.log(`Non-zero int32s: ${ints.join(', ')}`);
  if (currencies.length) console.log(`Currencies: ${currencies.map(c => `@${c.off}=$${c.val}`).join(', ')}`);
}

fs.closeSync(fd);
