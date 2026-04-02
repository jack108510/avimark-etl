const fs = require('fs');
const dir = 'C:\\AVImark\\';

function delphiToDate(d) {
  if (d < 30000 || d > 50000) return null;
  try {
    const epoch = new Date(1899, 11, 30).getTime();
    const ms = epoch + d * 86400000;
    const dt = new Date(ms);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().substring(0, 10);
  } catch { return null; }
}

function readBuf(file, offset, len) {
  const fd = fs.openSync(dir + file, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, offset);
  fs.closeSync(fd);
  return buf;
}

function analyzeFile(file, recSize) {
  const stat = fs.statSync(dir + file);
  const totalRecs = Math.floor(stat.size / recSize);
  console.log(`\n=== ${file} recSize=${recSize} totalRecs=${totalRecs} ===`);

  // Read first 10, middle 5, and 5 near end
  const samples = [];
  for (let i = 0; i < Math.min(10, totalRecs); i++) samples.push(i);
  const mid = Math.floor(totalRecs / 2);
  for (let i = mid; i < Math.min(mid + 5, totalRecs); i++) samples.push(i);
  const end = Math.max(totalRecs - 5, 0);
  for (let i = end; i < totalRecs; i++) samples.push(i);

  // Scan first few for TDateTime
  const buf0 = readBuf(file, 0, recSize);
  console.log('TDateTime scan rec 0:');
  for (let off = 0; off < Math.min(recSize - 8, 200); off++) {
    const d = buf0.readDoubleLE(off);
    const dt = delphiToDate(d);
    if (dt) console.log(`  @${off}: ${d.toFixed(4)} -> ${dt}`);
  }

  // String scan first 3 records
  for (let r = 0; r < Math.min(3, totalRecs); r++) {
    const buf = readBuf(file, r * recSize, recSize);
    let run = '', runStart = 0;
    const strings = [];
    for (let off = 0; off < recSize; off++) {
      const c = buf[off];
      if (c >= 32 && c <= 126) {
        if (!run.length) runStart = off;
        run += String.fromCharCode(c);
      } else {
        if (run.length >= 2) strings.push(`@${runStart}:"${run}"`);
        run = '';
      }
    }
    if (run.length >= 2) strings.push(`@${runStart}:"${run}"`);
    console.log(`Strings rec ${r}: ${strings.join(' ')}`);
  }

  // Hexdump first record
  const hex = [];
  for (let i = 0; i < Math.min(recSize, 96); i++) {
    if (i % 16 === 0) hex.push('\n  ' + i.toString(16).padStart(4, '0') + ': ');
    hex.push(buf0[i].toString(16).padStart(2, '0'));
  }
  console.log('Hex rec 0:' + hex.join(' '));
}

// Files we still need to check
analyzeFile('WBOARD.V2$', 256);
analyzeFile('VARIANCE.V2$', 96);
analyzeFile('PROBHIST.V2$', 48);
analyzeFile('OPTION.V2$', 100);
analyzeFile('TASK.V2$', 96);
analyzeFile('PO.V2$', 208);
analyzeFile('SERVICEX.V2$', 200);
analyzeFile('SPLIT.V2$', 48);
analyzeFile('REMINDAS.V2$', 128);
analyzeFile('QA.V2$', 128);
analyzeFile('RESOURCE.V2$', 160);
analyzeFile('ESTIMATE.V2$', 128);
analyzeFile('BLKOFFEX.V2$', 108);
analyzeFile('TRTSPEC.V2$', 208);
analyzeFile('GRANT.V2$', 120);
analyzeFile('CATEGORY.V2$', 72);
analyzeFile('GLOSSCAT.V2$', 40);
analyzeFile('TABLE.V2$', 56);
analyzeFile('HEADER.V2$', 384);

// Check variable-length priority files
console.log('\n=== Checking APPOINT.V2$ at recSize=449 ===');
analyzeFile('APPOINT.V2$', 449);

// PRESCRIP - try various
const presSize = fs.statSync(dir + 'PRESCRIP.V2$').size;
for (const s of [41, 62, 82, 155, 205, 310]) {
  if (presSize % s === 0) console.log(`PRESCRIP.V2$ divides evenly by ${s} -> ${presSize/s} records`);
}
analyzeFile('PRESCRIP.V2$', 310);

// FOLLOW
const followSize = fs.statSync(dir + 'FOLLOW.V2$').size;
for (const s of [30, 45, 90, 142, 213, 355, 426, 710]) {
  if (followSize % s === 0) console.log(`FOLLOW.V2$ divides evenly by ${s} -> ${followSize/s} records`);
}
analyzeFile('FOLLOW.V2$', 90);

// DIAGNOSE
const diagSize = fs.statSync(dir + 'DIAGNOSE.V2$').size;
for (const s of [17, 19, 85, 95, 289, 323, 361]) {
  if (diagSize % s === 0) console.log(`DIAGNOSE.V2$ divides evenly by ${s} -> ${diagSize/s} records`);
}
analyzeFile('DIAGNOSE.V2$', 85);

// PROBLEM
const probSize = fs.statSync(dir + 'PROBLEM.V2$').size;
for (const s of [17, 47, 167, 799]) {
  if (probSize % s === 0) console.log(`PROBLEM.V2$ divides evenly by ${s} -> ${probSize/s} records`);
}
analyzeFile('PROBLEM.V2$', 167);

// VENDOR
const vendSize = fs.statSync(dir + 'VENDOR.V2$').size;
for (const s of [17, 23, 29, 221, 299, 377, 391, 493, 667]) {
  if (vendSize % s === 0) console.log(`VENDOR.V2$ divides evenly by ${s} -> ${vendSize/s} records`);
}
analyzeFile('VENDOR.V2$', 377);

// USAGE
const usageSize = fs.statSync(dir + 'USAGE.V2$').size;
for (const s of [21, 39, 63, 91, 117, 273]) {
  if (usageSize % s === 0) console.log(`USAGE.V2$ divides evenly by ${s} -> ${usageSize/s} records`);
}
analyzeFile('USAGE.V2$', 63);

// QUOTE
const quoteSize = fs.statSync(dir + 'QUOTE.V2$').size;
for (const s of [20, 28, 35, 70, 140]) {
  if (quoteSize % s === 0) console.log(`QUOTE.V2$ divides evenly by ${s} -> ${quoteSize/s} records`);
}
analyzeFile('QUOTE.V2$', 140);

// QUOTAIL
const qtailSize = fs.statSync(dir + 'QUOTAIL.V2$').size;
for (const s of [45, 51, 67, 85, 153, 255, 335]) {
  if (qtailSize % s === 0) console.log(`QUOTAIL.V2$ divides evenly by ${s} -> ${qtailSize/s} records`);
}
analyzeFile('QUOTAIL.V2$', 255);
