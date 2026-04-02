import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. How many price_change records are in Supabase?
const { count: dbCount } = await sb
  .from('audit_log')
  .select('*', { count: 'exact', head: true })
  .eq('category', 'price_change');
console.log('Price change records in Supabase:', dbCount);

// 2. Scan AUDIT.V2$ raw for ALL AUD01 price change patterns
const stat = fs.statSync('C:\\AVImark\\AUDIT.V2$');
console.log('AUDIT.V2$ size:', (stat.size / 1024 / 1024).toFixed(1), 'MB');

const fd = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
const chunkSize = 500000;
let offset = 0;

let aud01Count = 0;
const priceChanges = {}; // code → [{date, oldVal, newVal}]
const unparsedDates = new Set();

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900 + y : 2000 + y; return new Date(y, +m[1] - 1, +m[2]); }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

while (offset < stat.size) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  // AUD01 pattern: AUD01|...date,OldAmt:XX,NewAmt:XX,Code:XXX
  const regex = /AUD01\|{1,6}>?([\d\/-]+),OldAmt:([\-\d.]+),NewAmt:([\-\d.]+),Code:([A-Za-z0-9$ ]+?)(?:\||,)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    aud01Count++;
    const dateStr = match[1];
    const oldAmt = parseFloat(match[2]) || 0;
    const newAmt = parseFloat(match[3]) || 0;
    const code = match[4].trim();

    const d = parseDate(dateStr);
    if (!d) {
      unparsedDates.add(dateStr);
      continue;
    }

    if (!priceChanges[code]) priceChanges[code] = [];
    priceChanges[code].push({ date: d, dateStr, oldAmt, newAmt });
  }

  offset += chunkSize - 500; // bigger overlap for safety
}
fs.closeSync(fd);

console.log('\nTotal AUD01 price changes found in raw file:', aud01Count);
console.log('Unique codes with price changes:', Object.keys(priceChanges).length);
console.log('Unparsed date formats:', [...unparsedDates].slice(0, 20));

// Find last change date per code
const lastChanges = {};
for (const [code, changes] of Object.entries(priceChanges)) {
  changes.sort((a, b) => b.date - a.date);
  lastChanges[code] = changes[0];
}

// Cross-check with Supabase
const { data: dbAudit } = await sb
  .from('audit_log')
  .select('item_code, date_text')
  .eq('category', 'price_change');

const dbLastChange = {};
for (const a of dbAudit || []) {
  if (!a.item_code) continue;
  const d = parseDate(a.date_text);
  if (!d) continue;
  if (!dbLastChange[a.item_code] || d > dbLastChange[a.item_code].date) {
    dbLastChange[a.item_code] = { date: d, dateStr: a.date_text };
  }
}

// Compare: check key codes from our report
const reportCodes = ['2VW', 'V3', 'GERI', '104', 'SQ', 'CYTOLOGY', '100', 'ANEX', 'HC', 'HEF', 'BLO', 'VACCFELC', 'FLU', '3VW', 'FL'];
console.log('\n=== Key code comparison: Raw File vs Supabase ===');
console.log('Code'.padEnd(14) + 'Raw Last Change'.padEnd(20) + 'DB Last Change'.padEnd(20) + 'Match?');
console.log('-'.repeat(70));

for (const code of reportCodes) {
  const raw = lastChanges[code];
  const db = dbLastChange[code];
  const rawDate = raw ? raw.date.toISOString().split('T')[0] : 'NOT FOUND';
  const dbDate = db ? db.date.toISOString().split('T')[0] : 'NOT FOUND';
  const match = rawDate === dbDate ? '✅' : '❌';
  console.log(code.padEnd(14) + rawDate.padEnd(20) + dbDate.padEnd(20) + match);
}

// Also check: are there PRICE.V2$ records that might have embedded dates?
console.log('\n=== Checking PRICE.V2$ for date fields ===');
const pstat = fs.statSync('C:\\AVImark\\PRICE.V2$');
console.log('PRICE.V2$ size:', pstat.size, 'bytes, record size: 108');
const totalPriceRecs = Math.floor(pstat.size / 108);
console.log('Total price records:', totalPriceRecs);

const pfd = fs.openSync('C:\\AVImark\\PRICE.V2$', 'r');
// Check last 5 records for date-like doubles
for (let r = totalPriceRecs - 5; r < totalPriceRecs; r++) {
  const buf = Buffer.alloc(108);
  fs.readSync(pfd, buf, 0, 108, r * 108);
  
  const dates = [];
  for (let off = 0; off + 8 <= 108; off += 4) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
        dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
      }
    } catch(e) {}
  }
  
  let ascii = '';
  for (let i = 0; i < 108; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  console.log(`Rec ${r}: ${ascii.substring(0, 80)}`);
  if (dates.length) console.log(`  DATES: ${dates.join(', ')}`);
}
fs.closeSync(pfd);

// Check if there's a separate PRICEHIST or similar file
const v2files = fs.readdirSync('C:\\AVImark').filter(f => f.endsWith('.V2$') && /price|hist|fee|rate/i.test(f));
console.log('\nPrice/rate related V2$ files:', v2files);
