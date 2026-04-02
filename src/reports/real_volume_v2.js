import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

const sFd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const sStat = fs.statSync(dataDir + '\\SERVICE.V2$');
const sTotal = Math.floor(sStat.size / 256);

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

console.log(`SERVICE.V2$ — ${sTotal} records`);
console.log(`Date range: ${oneYearAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}\n`);

// Start scanning from ~rec 470K (around 2021) to be safe
const SCAN_START = 460000;
const CHUNK = 50000;

const codeCounts = {};
const codeRevenue = {};
let totalInRange = 0;
let totalScanned = 0;
let outOfRange = 0;
let noDate = 0;

for (let start = SCAN_START; start < sTotal; start += CHUNK) {
  const count = Math.min(CHUNK, sTotal - start);
  const buf = Buffer.alloc(count * 256);
  fs.readSync(sFd, buf, 0, count * 256, start * 256);
  
  for (let i = 0; i < count; i++) {
    totalScanned++;
    const rec = buf.subarray(i * 256, (i + 1) * 256);
    
    // Date at @21
    const dateVal = rec.readDoubleLE(21);
    if (!(dateVal > 35000 && dateVal < 47000)) { noDate++; continue; }
    
    const date = new Date(DELPHI_EPOCH + dateVal * 86400000);
    if (date < oneYearAgo || date > now) { outOfRange++; continue; }
    
    // Code
    const codeLen = Math.min(rec[103] || 0, 12);
    if (codeLen === 0) continue;
    const code = rec.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
    if (!code) continue;
    
    // Amount
    const amount = rec.readInt32LE(112) / 100;
    
    totalInRange++;
    codeCounts[code] = (codeCounts[code] || 0) + 1;
    codeRevenue[code] = (codeRevenue[code] || 0) + amount;
  }
}
fs.closeSync(sFd);

console.log(`Scanned: ${totalScanned}`);
console.log(`In date range: ${totalInRange}`);
console.log(`Out of range: ${outOfRange}`);
console.log(`No valid date: ${noDate}`);
console.log(`Unique codes: ${Object.keys(codeCounts).length}`);

// Revenue check
let totalRev = 0;
for (const rev of Object.values(codeRevenue)) totalRev += rev;
console.log(`Total charged amount (365d): $${totalRev.toFixed(2)}`);
console.log(`Monthly: $${(totalRev/12).toFixed(2)}`);

const sorted = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
console.log('\nTop 30 by volume (last 365d, from SERVICE @21 dates):');
for (const [code, count] of sorted.slice(0, 30)) {
  const rev = codeRevenue[code] || 0;
  console.log(`  ${code.padEnd(14)} ${count.toString().padStart(5)}  $${rev.toFixed(2).padStart(12)}`);
}

// Save
const output = {
  counts: codeCounts,
  revenue: codeRevenue,
  period: 'last_365_days',
  method: 'SERVICE.V2$ @21 TDateTime direct read (records 460K+)',
  totalInRange,
  totalScanned,
  outOfRange,
  cutoffDate: oneYearAgo.toISOString().split('T')[0],
  generatedDate: now.toISOString().split('T')[0],
};

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/real_volumes_v2.json', JSON.stringify(output, null, 2));
console.log('\n✅ Saved to reports/real_volumes_v2.json');
