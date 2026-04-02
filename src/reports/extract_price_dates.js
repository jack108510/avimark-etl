import fs from 'fs';

const dataDir = 'C:\\AVImark';
const fd = fs.openSync(dataDir + '\\PRICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\PRICE.V2$');
const recSize = 108;
const totalRecs = Math.floor(stat.size / recSize);
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

console.log(`PRICE.V2$ — ${totalRecs} records\n`);

// Read the price from our existing parser structure
// We know: code at @42 (Pascal-style), price as Delphi currency at @64
// Date at @21 (Delphi TDateTime double, unaligned)

// But we also need to match to treatment codes from TREAT.V2$
// Actually PRICE.V2$ code IS the treatment code.

const priceDates = {}; // code → { date, price }
let parsed = 0;
let skipped = 0;

// Read in chunks for speed
const CHUNK = 10000;
for (let start = 0; start < totalRecs; start += CHUNK) {
  const count = Math.min(CHUNK, totalRecs - start);
  const buf = Buffer.alloc(count * recSize);
  fs.readSync(fd, buf, 0, count * recSize, start * recSize);
  
  for (let i = 0; i < count; i++) {
    const rec = buf.subarray(i * recSize, (i + 1) * recSize);
    
    // Code (Pascal-style at @42)
    const codeLen = Math.min(rec[42] || 0, 14);
    if (codeLen === 0) { skipped++; continue; }
    const code = rec.toString('ascii', 43, 43 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
    if (!code) { skipped++; continue; }
    
    // Date (Delphi TDateTime double at @21, unaligned)
    let dateVal;
    try {
      dateVal = rec.readDoubleLE(21);
    } catch(e) { continue; }
    
    let date = null;
    if (dateVal > 30000 && dateVal < 50000) {
      date = new Date(DELPHI_EPOCH + dateVal * 86400000);
    }
    
    // Price (Delphi currency int64 at @64)
    let price = 0;
    try {
      const lo = rec.readUInt32LE(64);
      const hi = rec.readInt32LE(68);
      price = (hi * 0x100000000 + lo) / 10000;
    } catch(e) {}
    
    // Keep the MOST RECENT date per code (there might be multiple price records per code)
    if (!priceDates[code] || (date && (!priceDates[code].date || date > priceDates[code].date))) {
      priceDates[code] = { 
        date, 
        dateStr: date ? date.toISOString().split('T')[0] : null,
        price,
        recordNum: start + i,
      };
    }
    parsed++;
  }
}
fs.closeSync(fd);

console.log(`Parsed: ${parsed}, Skipped: ${skipped}`);
console.log(`Unique codes: ${Object.keys(priceDates).length}\n`);

// Show date distribution
const yearCounts = {};
for (const info of Object.values(priceDates)) {
  if (info.date) {
    const y = info.date.getFullYear();
    yearCounts[y] = (yearCounts[y] || 0) + 1;
  }
}
console.log('Last-modified year distribution:');
for (const [y, c] of Object.entries(yearCounts).sort()) {
  console.log(`  ${y}: ${c} codes`);
}

// Key report codes
const reportCodes = ['2VW', 'V3', 'GERI', '104', 'SQ', 'CYTOLOGY', '100', 'ANEX', 'HC', 'HEF', 'BLO', 'VACCFELC', 'FLU', '3VW', 'FL', 'PARVO', 'BLOOD', 'OXY', 'IV'];
console.log('\nKey report codes — last modified:');
for (const code of reportCodes) {
  const info = priceDates[code];
  if (info) {
    console.log(`  ${code.padEnd(14)} ${info.dateStr || 'no date'}  $${info.price.toFixed(2)}`);
  } else {
    console.log(`  ${code.padEnd(14)} NOT IN PRICE.V2$`);
  }
}

// Save
const output = {};
for (const [code, info] of Object.entries(priceDates)) {
  output[code] = {
    lastModified: info.dateStr,
    price: info.price,
  };
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/price_dates.json', JSON.stringify(output, null, 2));
console.log('\n✅ Saved to reports/price_dates.json');

// Show codes that haven't been updated since 2020
const staleCount = Object.values(priceDates).filter(p => p.date && p.date < new Date(2020, 0, 1)).length;
const recentCount = Object.values(priceDates).filter(p => p.date && p.date >= new Date(2025, 0, 1)).length;
console.log(`\nCodes last modified before 2020: ${staleCount}`);
console.log(`Codes last modified 2025+: ${recentCount}`);
