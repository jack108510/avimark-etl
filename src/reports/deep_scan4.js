import fs from 'fs';

// SERVICE.V2$ bytes 20-27 seem to contain a Delphi TDateTime but in a non-standard format.
// Let's look at the raw bytes more carefully.
// Bytes 20-27 from recent records:
//   Rec 625640: 0091a67b3ad381e6
//   Rec 625730: 00942f19dddb81e6
//   Rec 625735: 0026000000f48be6
// And from old records:
//   Rec 100:    0a39663cbb753de5
//   Rec 1000:   1b6c1a3dbb753de5
//   Rec 10000:  f4473d44bb753de5
// The high bytes (e5, e6) increase with record position. e5→e6 maps to old→new.
// Let's try reading this as a Delphi currency (int64/10000) — probably not a date.
// Or as a raw int64.

// Actually let's try: the @20-27 as int64 and see if dividing by something gives us dates.
// Or the bytes 0-7 might be dates in some encoding.

// Better approach: SERVICE records are chronological. Let's verify by checking
// AUDIT charge dates against SERVICE record positions.
// We know AUD02 has Code:XXX — find same code in SERVICE at known record_num.

const dataDir = 'C:\\AVImark';

// Read all SERVICE records and count by code, tracking first/last record_num
const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
const totalRecs = Math.floor(stat.size / 256);

// Read chunks of SERVICE to get code distribution by position
const chunkSize = 10000;
const yearlyBuckets = {}; // bucket (position range) → code → count

// Divide into ~13 buckets (~1 year each)
const recsPerBucket = Math.ceil(totalRecs / 13);

console.log(`Total: ${totalRecs} records, ${recsPerBucket} per bucket\n`);

for (let bucket = 0; bucket < 13; bucket++) {
  const start = bucket * recsPerBucket;
  const end = Math.min(start + recsPerBucket, totalRecs);
  const counts = {};
  
  // Read all records in this bucket
  const bytesToRead = (end - start) * 256;
  const buf = Buffer.alloc(bytesToRead);
  fs.readSync(fd, buf, 0, bytesToRead, start * 256);
  
  for (let i = 0; i < end - start; i++) {
    const rec = buf.subarray(i * 256, (i + 1) * 256);
    const codeLen = Math.min(rec[103] || 0, 12);
    if (codeLen === 0) continue;
    const code = rec.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
    if (!code) continue;
    counts[code] = (counts[code] || 0) + 1;
  }
  
  yearlyBuckets[bucket] = counts;
  const totalInBucket = Object.values(counts).reduce((s, v) => s + v, 0);
  const uniqueCodes = Object.keys(counts).length;
  console.log(`Bucket ${bucket} (recs ${start}-${end-1}): ${totalInBucket} valid, ${uniqueCodes} unique codes`);
}
fs.closeSync(fd);

// Now compare last bucket (most recent year) with all others
const lastBucket = yearlyBuckets[12];
const secondToLast = yearlyBuckets[11];

console.log('\n=== Last bucket (most recent ~year) top 20 codes ===');
const sorted = Object.entries(lastBucket || {}).sort((a, b) => b[1] - a[1]);
for (const [code, count] of sorted.slice(0, 20)) {
  console.log(`  ${code.padEnd(14)} ${count}`);
}

console.log('\n=== Second-to-last bucket top 20 ===');
const sorted2 = Object.entries(secondToLast || {}).sort((a, b) => b[1] - a[1]);
for (const [code, count] of sorted2.slice(0, 20)) {
  console.log(`  ${code.padEnd(14)} ${count}`);
}

// Show the approximate date range per bucket by cross-referencing with AUDIT
// AUDIT covers 2012-12-18 to 2026-03-13 = 13.24 years
// If SERVICE is roughly chronological, bucket 0 ≈ 2012, bucket 12 ≈ 2026
console.log('\n=== Estimated date ranges (assuming chronological) ===');
const startDate = new Date(2012, 11, 18); // 2012-12-18
const endDate = new Date(2026, 2, 13);   // 2026-03-13
const msRange = endDate.getTime() - startDate.getTime();

for (let b = 0; b < 13; b++) {
  const bStart = new Date(startDate.getTime() + (b / 13) * msRange);
  const bEnd = new Date(startDate.getTime() + ((b + 1) / 13) * msRange);
  console.log(`  Bucket ${b}: ~${bStart.toISOString().split('T')[0]} to ~${bEnd.toISOString().split('T')[0]}`);
}
