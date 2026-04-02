import fs from 'fs';

const dataDir = 'C:\\AVImark';
const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
const totalRecs = Math.floor(stat.size / 256);

// SERVICE.V2$ is chronological. Data spans 2012-12-18 to 2026-03-13 (13.24 years).
// Last year ≈ last totalRecs/13.24 records.
const yearsSpan = 13.24;
const recsPerYear = Math.round(totalRecs / yearsSpan);
const lastYearStart = totalRecs - recsPerYear;

console.log(`Total records: ${totalRecs}`);
console.log(`Records per year (estimated): ${recsPerYear}`);
console.log(`Last-year records: ${lastYearStart} to ${totalRecs - 1}`);

const counts = {};
const revenue = {};

const bytesToRead = (totalRecs - lastYearStart) * 256;
const buf = Buffer.alloc(bytesToRead);
fs.readSync(fd, buf, 0, bytesToRead, lastYearStart * 256);

for (let i = 0; i < totalRecs - lastYearStart; i++) {
  const rec = buf.subarray(i * 256, (i + 1) * 256);
  const codeLen = Math.min(rec[103] || 0, 12);
  if (codeLen === 0) continue;
  const code = rec.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
  if (!code) continue;

  const amountCents = rec.readInt32LE(112);
  const amount = amountCents / 100;

  counts[code] = (counts[code] || 0) + 1;
  revenue[code] = (revenue[code] || 0) + amount;
}
fs.closeSync(fd);

const uniqueCodes = Object.keys(counts).length;
const totalCharges = Object.values(counts).reduce((s, v) => s + v, 0);
console.log(`\nLast year: ${totalCharges} charges, ${uniqueCodes} unique codes`);

// Save
const output = {
  counts,
  revenue,
  period: 'last_year_estimated',
  method: 'SERVICE.V2$ chronological position-based (last 1/13.24 of records)',
  startRecord: lastYearStart,
  endRecord: totalRecs - 1,
  estimatedDateRange: '~2025-03 to ~2026-03',
};

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/service_last_year.json', JSON.stringify(output, null, 2));

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('\nTop 30 by volume (last year):');
for (const [code, count] of sorted.slice(0, 30)) {
  const rev = revenue[code] || 0;
  console.log(`  ${code.padEnd(14)} ${count.toString().padStart(5)}  $${rev.toFixed(2).padStart(12)}`);
}

console.log('\n✅ Saved to reports/service_last_year.json');
