const fs = require('fs');
const dir = 'C:\\AVImark\\';
const epoch = new Date(1899, 11, 30);

function delphiToDate(d) {
  if (d < 30000 || d > 50000) return null;
  const ms = epoch.getTime() + d * 86400000;
  return new Date(ms).toISOString().substring(0, 10);
}

function hexdump(buf, start, len) {
  let out = '';
  for (let i = 0; i < len; i += 16) {
    const hex = [];
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      if (i + j < len) {
        hex.push(buf[start + i + j].toString(16).padStart(2, '0'));
        const c = buf[start + i + j];
        ascii += (c >= 32 && c <= 126) ? String.fromCharCode(c) : '.';
      }
    }
    out += (start + i).toString(16).padStart(6, '0') + '  ' + hex.join(' ') + '  ' + ascii + '\n';
  }
  return out;
}

function readRecords(file, recSize, count, startRec = 0) {
  const fd = fs.openSync(dir + file, 'r');
  const stat = fs.fstatSync(fd);
  const totalRecs = Math.floor(stat.size / recSize);
  const toRead = Math.min(count, totalRecs - startRec);
  const buf = Buffer.alloc(toRead * recSize);
  fs.readSync(fd, buf, 0, toRead * recSize, startRec * recSize);
  fs.closeSync(fd);
  return { buf, totalRecs };
}

function analyzeFile(file, recSize) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${file} — recSize=${recSize}`);
  console.log('='.repeat(60));
  
  const { buf, totalRecs } = readRecords(file, recSize, 20);
  console.log(`Total records: ${totalRecs}`);
  
  // Find TDateTime doubles
  console.log('\nTDateTime scan (first record):');
  for (let off = 0; off < Math.min(recSize, 128); off++) {
    if (off + 8 > recSize) break;
    const d = buf.readDoubleLE(off);
    const dt = delphiToDate(d);
    if (dt) console.log(`  @${off}: ${d.toFixed(4)} -> ${dt}`);
  }
  
  // Show key int32 values
  console.log('\nInt32 values (first 5 records, offsets 0-60):');
  for (let rec = 0; rec < Math.min(5, totalRecs); rec++) {
    const roff = rec * recSize;
    const vals = [];
    for (let off = 0; off < Math.min(64, recSize); off += 4) {
      const v = buf.readInt32LE(roff + off);
      if (v !== 0) vals.push('@' + off + '=' + v);
    }
    console.log(`  Rec ${rec}: ${vals.join(' ')}`);
  }
  
  // String scan
  console.log('\nString scan (rec 0-2, printable runs >= 2 chars):');
  for (let rec = 0; rec < Math.min(3, totalRecs); rec++) {
    const roff = rec * recSize;
    let run = '';
    let runStart = 0;
    for (let off = 0; off < recSize; off++) {
      const c = buf[roff + off];
      if (c >= 32 && c <= 126) {
        if (run.length === 0) runStart = off;
        run += String.fromCharCode(c);
      } else {
        if (run.length >= 2) console.log(`  Rec ${rec} @${runStart}: "${run}"`);
        run = '';
      }
    }
    if (run.length >= 2) console.log(`  Rec ${rec} @${runStart}: "${run}"`);
  }
  
  // Hexdump first 2 records
  console.log('\nHexdump (rec 0):');
  console.log(hexdump(buf, 0, Math.min(recSize, 128)));
  console.log('Hexdump (rec 1):');
  console.log(hexdump(buf, recSize, Math.min(recSize, 128)));
}

// === VISIT ===
analyzeFile('VISIT.V2$', 256);

// === ACCOUNT ===
// Try 256 (526721 records) - reasonable for financial records
analyzeFile('ACCOUNT.V2$', 256);

// === MEDICAL ===  
analyzeFile('MEDICAL.V2$', 256);

// === VACCINE ===
analyzeFile('VACCINE.V2$', 72);

// === PROC ===
analyzeFile('PROC.V2$', 256);

// === WBOARD (whiteboard) ===
analyzeFile('WBOARD.V2$', 256);

// === VARIANCE ===
analyzeFile('VARIANCE.V2$', 96);

// === PROBHIST ===
analyzeFile('PROBHIST.V2$', 48);

// === OPTION ===
analyzeFile('OPTION.V2$', 100);

// === TASK ===
analyzeFile('TASK.V2$', 96);

// === PO ===
analyzeFile('PO.V2$', 208);
