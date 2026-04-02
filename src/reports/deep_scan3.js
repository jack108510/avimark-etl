import fs from 'fs';

const dataDir = 'C:\\AVImark';
const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
const totalRecs = Math.floor(stat.size / 256);

// Approach 1: SERVICE records are sequential/chronological.
// Cross-reference with AUDIT AUD02 charges to find the boundary.
// AUDIT has dates + codes. We can find the same code in SERVICE.

// Approach 2: Check if there are date TEXT strings embedded anywhere in SERVICE records
// Look at bytes 120-256 for date patterns

console.log('=== Scanning SERVICE.V2$ for date strings ===\n');

const positions = [0, 100, 1000, 50000, 200000, 400000, 600000, totalRecs - 5];
for (const pos of positions) {
  const buf = Buffer.alloc(256);
  fs.readSync(fd, buf, 0, 256, pos * 256);
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Full ASCII dump
  let ascii = '';
  for (let i = 0; i < 256; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  // Check for date-like text patterns
  const datePatterns = ascii.match(/\d{2}[\/-]\d{2}[\/-]\d{2,4}/g);
  
  console.log(`Rec ${pos} (code=${code}):`);
  console.log(`  ${ascii.substring(0, 80)}`);
  console.log(`  ${ascii.substring(80, 160)}`);
  console.log(`  ${ascii.substring(160, 240)}`);
  if (datePatterns) console.log(`  DATE STRINGS: ${datePatterns.join(', ')}`);
  
  // Also show raw int32s at offsets 120-160 (after code/name area)
  const ints = [];
  for (let off = 120; off + 4 <= 256; off += 4) {
    const v = buf.readInt32LE(off);
    if (v !== 0) ints.push(`@${off}=${v}`);
  }
  console.log(`  Non-zero int32s @120+: ${ints.join(', ')}`);
  console.log('');
}
fs.closeSync(fd);

// Approach 3: Check if records in SERVICE have an animal_id that we can date via VISIT
// VISIT.V2$ @40 had values like 289604, 299332 — possibly SERVICE record indices
// Or SERVICE might link back to VISIT

console.log('\n=== Checking SERVICE→ANIMAL link ===\n');
const fd2 = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');

// Check if @4 (int32) is an animal record index
// Animals have ~26K records — if @4 is consistently < 27000, it's likely animal_id
const animalIdCounts = { lt27k: 0, gt27k: 0 };
const sampleSize = 1000;
for (let i = totalRecs - sampleSize; i < totalRecs; i++) {
  const buf = Buffer.alloc(8);
  fs.readSync(fd2, buf, 0, 8, i * 256);
  const val4 = buf.readInt32LE(4);
  if (val4 > 0 && val4 < 27000) animalIdCounts.lt27k++;
  else animalIdCounts.gt27k++;
}
console.log(`@4 in last ${sampleSize} records: <27K=${animalIdCounts.lt27k}, >=27K=${animalIdCounts.gt27k}`);
fs.closeSync(fd2);

// If SERVICE is chronological, estimate record ranges
console.log('\n=== Estimating chronological ranges ===');
console.log(`Total records: ${totalRecs}`);
console.log(`AUDIT date range: 2012-12-18 to 2026-03-13 (${((new Date(2026,2,13) - new Date(2012,11,18)) / 86400000 / 365.25).toFixed(1)} years)`);
const years = 13.24;
const recsPerYear = Math.round(totalRecs / years);
console.log(`Estimated records/year: ${recsPerYear}`);
console.log(`Last year start (approx): record ${totalRecs - recsPerYear}`);
