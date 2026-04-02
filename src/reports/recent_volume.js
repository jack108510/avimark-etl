import fs from 'fs';

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

const fd = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
const fileSize = fs.statSync('C:\\AVImark\\AUDIT.V2$').size;
const chunkSize = 200000;
let offset = 0;

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

const recentCounts = {};
const recentRevenue = {};
let totalRecent = 0;
let totalAll = 0;

while (offset < fileSize) {
  const readSize = Math.min(chunkSize, fileSize - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  const regex = /AUD02\|{1,6}[>]?([\d\/-]+),Amount:([\-\d.]+),Code:([A-Za-z0-9$]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    totalAll++;
    const d = parseDate(match[1]);
    if (!d) continue;
    if (d >= oneYearAgo && d <= now) {
      const code = match[3];
      const amt = parseFloat(match[2]) || 0;
      recentCounts[code] = (recentCounts[code] || 0) + 1;
      recentRevenue[code] = (recentRevenue[code] || 0) + amt;
      totalRecent++;
    }
  }
  offset += chunkSize - 200;
}
fs.closeSync(fd);

console.log('Total AUD02 charges all time: ' + totalAll);
console.log('Charges in last 365 days: ' + totalRecent);
console.log('Unique codes in last year: ' + Object.keys(recentCounts).length);

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/recent_volumes.json', JSON.stringify({ recentCounts, recentRevenue, period: '365d', cutoff: oneYearAgo.toISOString() }));

const sorted = Object.entries(recentCounts).sort((a,b) => b[1] - a[1]);
console.log('\nTop 20 services LAST 365 DAYS:');
for (const [code, count] of sorted.slice(0, 20)) {
  const rev = recentRevenue[code] || 0;
  console.log('  ' + code.padEnd(12) + count.toString().padStart(5) + '  $' + rev.toFixed(2).padStart(10));
}
