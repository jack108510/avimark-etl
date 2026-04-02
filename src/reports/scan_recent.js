import fs from 'fs';

const stat = fs.statSync('C:\\AVImark\\AUDIT.V2$');
console.log('AUDIT.V2$ size:', (stat.size/1024/1024).toFixed(1), 'MB');

const fd = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
const chunkSize = 500000;
let offset = 0;
const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const codeCounts = {};
const codeRevenue = {};
let totalRecent = 0;
let totalAud02 = 0;

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

while (offset < stat.size) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  const regex = /AUD02\|{1,6}>?([\d\/-]+),Amount:([\-\d.]+),Code:([A-Za-z0-9$]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    totalAud02++;
    const d = parseDate(match[1]);
    if (!d) continue;
    if (d >= oneYearAgo && d <= now) {
      const code = match[3];
      const amt = parseFloat(match[2]) || 0;
      codeCounts[code] = (codeCounts[code] || 0) + 1;
      codeRevenue[code] = (codeRevenue[code] || 0) + amt;
      totalRecent++;
    }
  }
  offset += chunkSize - 200;
}
fs.closeSync(fd);

console.log('Total AUD02 charges parsed:', totalAud02);
console.log('Recent (365d) charges:', totalRecent);
console.log('Unique recent codes:', Object.keys(codeCounts).length);

const sorted = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
console.log('\nAll recent codes:');
for (const [code, count] of sorted) {
  console.log(`  ${code.padEnd(14)} ${count.toString().padStart(5)}  $${(codeRevenue[code]||0).toFixed(2).padStart(10)}`);
}

// Also check date range of ALL charges
let earliest = null, latest = null;
offset = 0;
const fd2 = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
while (offset < stat.size) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd2, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');
  const regex2 = /AUD02\|{1,6}>?([\d\/-]+),/g;
  let m2;
  while ((m2 = regex2.exec(text)) !== null) {
    const d = parseDate(m2[1]);
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }
  offset += chunkSize - 200;
}
fs.closeSync(fd2);

console.log('\nDate range of all AUD02 charges:');
console.log('Earliest:', earliest?.toISOString().split('T')[0]);
console.log('Latest:', latest?.toISOString().split('T')[0]);
