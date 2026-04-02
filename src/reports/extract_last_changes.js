import fs from 'fs';

const fd = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
const stat = fs.statSync('C:\\AVImark\\AUDIT.V2$');
const chunkSize = 500000;
let offset = 0;

function parseDate(s) {
  if (!s) return null;
  // MM-DD-YY
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  // DD/MM/YYYY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  // D/MM/YY or M/DD/YY — ambiguous but try
  m = s.match(/^(\d{1,2})\/(\d{2})\/(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[2]-1, +m[1]); }
  return null;
}

const lastChange = {}; // code → { date, dateStr, old, new }
let totalAud01 = 0;
let priceChangeAud01 = 0;

while (offset < stat.size) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  // AUD01 format: "Item/Treatment: CODE, DATE, Old: XX.XX, New: YY.YY"
  const regex = /AUD01\|{1,6}\d*Item\/Treatment:\s*([A-Za-z0-9$ ]+?),\s*([\d\/-]+),\s*Old:\s*([\d.-]+),\s*New:\s*([\d.-]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    totalAud01++;
    const code = match[1].trim();
    const dateStr = match[2].trim();
    const oldVal = parseFloat(match[3]);
    const newVal = parseFloat(match[4]);
    
    // Only count as price change if new value > 0 (not a write-off to 0)
    // Actually, let's capture ALL and we'll filter later
    const d = parseDate(dateStr);
    if (!d) continue;
    
    priceChangeAud01++;
    
    if (!lastChange[code] || d > lastChange[code].date) {
      lastChange[code] = { date: d, dateStr, oldVal, newVal };
    }
  }
  
  offset += chunkSize - 500;
}
fs.closeSync(fd);

console.log('Total AUD01 Item/Treatment entries:', totalAud01);
console.log('With parseable dates:', priceChangeAud01);
console.log('Unique codes:', Object.keys(lastChange).length);

// Sort by most recent change
const sorted = Object.entries(lastChange)
  .sort((a, b) => b[1].date - a[1].date);

console.log('\n=== Most recently changed (top 30) ===');
for (const [code, info] of sorted.slice(0, 30)) {
  console.log(`  ${code.padEnd(14)} ${info.date.toISOString().split('T')[0]}  Old: ${info.oldVal}  New: ${info.newVal}`);
}

console.log('\n=== Oldest changes (bottom 20) ===');
for (const [code, info] of sorted.slice(-20)) {
  console.log(`  ${code.padEnd(14)} ${info.date.toISOString().split('T')[0]}  Old: ${info.oldVal}  New: ${info.newVal}`);
}

// Key report codes
const reportCodes = ['2VW', 'V3', 'GERI', '104', 'SQ', 'CYTOLOGY', '100', 'ANEX', 'HC', 'HEF', 'BLO', 'VACCFELC', 'FLU', '3VW', 'FL'];
console.log('\n=== Key report codes ===');
for (const code of reportCodes) {
  const info = lastChange[code];
  if (info) {
    console.log(`  ${code.padEnd(14)} ${info.date.toISOString().split('T')[0]}  Old: ${info.oldVal}  New: ${info.newVal}`);
  } else {
    console.log(`  ${code.padEnd(14)} NO AUDIT RECORD`);
  }
}

// Save the last change dates
const output = {};
for (const [code, info] of Object.entries(lastChange)) {
  output[code] = {
    lastChangeDate: info.date.toISOString().split('T')[0],
    oldVal: info.oldVal,
    newVal: info.newVal,
  };
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/last_price_changes.json', JSON.stringify(output, null, 2));
console.log('\n✅ Saved to reports/last_price_changes.json');
