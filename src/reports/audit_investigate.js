import fs from 'fs';

const dataDir = 'C:\\AVImark';

// 1. Check AUDIT.V2$ file details
const stat = fs.statSync(dataDir + '\\AUDIT.V2$');
console.log('AUDIT.V2$ size:', stat.size, 'bytes', `(${(stat.size/1024/1024).toFixed(1)} MB)`);
console.log('Last modified:', stat.mtime.toISOString());
console.log('Created:', stat.birthtime.toISOString());

// 2. Are there other audit files? Rotated, archived, numbered?
const allFiles = fs.readdirSync(dataDir);
const auditFiles = allFiles.filter(f => /audit/i.test(f));
console.log('\nAll audit-related files in C:\\AVImark:');
for (const f of auditFiles) {
  const s = fs.statSync(dataDir + '\\' + f);
  console.log(`  ${f.padEnd(25)} ${(s.size/1024/1024).toFixed(2)} MB  modified: ${s.mtime.toISOString().split('T')[0]}`);
}

// 3. Check for LOG files
const logFiles = allFiles.filter(f => /^log/i.test(f) || /\.log$/i.test(f));
console.log('\nLog files:');
for (const f of logFiles) {
  const s = fs.statSync(dataDir + '\\' + f);
  console.log(`  ${f.padEnd(25)} ${(s.size/1024/1024).toFixed(2)} MB  modified: ${s.mtime.toISOString().split('T')[0]}`);
}

// 4. Scan for date range — check first and last AUD entries
const fd = fs.openSync(dataDir + '\\AUDIT.V2$', 'r');

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

// Scan entire file for all dates
const chunkSize = 500000;
let offset = 0;
const dateCounts = {}; // year-month → count
let totalEntries = 0;

while (offset < stat.size) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  // Match all date patterns
  const regex = /(?:AUD0[12])\|{1,6}>?([\d\/-]+)[,|]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    totalEntries++;
    const d = parseDate(match[1]);
    if (d) {
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      dateCounts[key] = (dateCounts[key] || 0) + 1;
    }
  }
  offset += chunkSize - 500;
}
fs.closeSync(fd);

console.log('\nTotal audit entries with dates:', totalEntries);
console.log('\nMonthly distribution:');
const months = Object.keys(dateCounts).sort();
for (const m of months) {
  const bar = '█'.repeat(Math.min(50, Math.round(dateCounts[m] / 20)));
  console.log(`  ${m}  ${dateCounts[m].toString().padStart(5)}  ${bar}`);
}

// 5. Check last 2KB of the file — does it look truncated?
console.log('\n=== Last 500 bytes of AUDIT.V2$ (ASCII) ===');
const tailBuf = Buffer.alloc(500);
fs.readSync(fs.openSync(dataDir + '\\AUDIT.V2$', 'r'), tailBuf, 0, 500, stat.size - 500);
let ascii = '';
for (let i = 0; i < 500; i++) {
  const b = tailBuf[i];
  ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
}
console.log(ascii);

// 6. Check AVImark settings for audit config
const iniFiles = allFiles.filter(f => /\.ini$/i.test(f));
console.log('\n\nINI files:', iniFiles);
for (const ini of iniFiles.slice(0, 5)) {
  const content = fs.readFileSync(dataDir + '\\' + ini, 'utf8');
  const auditLines = content.split('\n').filter(l => /audit/i.test(l));
  if (auditLines.length) {
    console.log(`\n${ini} audit settings:`);
    for (const l of auditLines) console.log(`  ${l.trim()}`);
  }
}

// 7. Check if there's an AUDIT2, AUDITLOG, or separate newer file
const possibleNewAudit = allFiles.filter(f => /audit.*\d|audit.*new|audit.*bak|\.aud/i.test(f));
console.log('\nPossible alternate audit files:', possibleNewAudit);
