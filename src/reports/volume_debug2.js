import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// @40 in VISIT isn't a range start — it's probably just one SERVICE record pointer,
// or it's something else entirely. Let's look at SERVICE.V2$ differently.
//
// SERVICE @4 was often animal_id (< 27K). SERVICE records might THEMSELVES point
// back to their parent VISIT or ANIMAL + have enough info to derive dates.
//
// Alternative approach: SERVICE.V2$ @21 gave us dates (2019-02-03 for most early records,
// then real recent dates for late records). That looked wrong for early records 
// (same date for all), but maybe it's actually a "last price set" date, not a service date.
//
// Let's check: does SERVICE.V2$ have a VISIT pointer? 
// If we can find which VISIT each SERVICE belongs to, we get dates.

console.log('=== SERVICE.V2$ structure deep dive ===\n');

const sFd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const sStat = fs.statSync(dataDir + '\\SERVICE.V2$');
const sTotal = Math.floor(sStat.size / 256);

// Check various int32 fields in SERVICE for potential VISIT pointers
// VISIT has 46182 records. If SERVICE has a visit_id field, values should be < 46182.
// Also check for ANIMAL pointers (< ~27000)

const positions = [0, 100, 1000, 10000, 100000, 300000, 500000, 600000, sTotal - 10, sTotal - 1];

for (const pos of positions) {
  const buf = Buffer.alloc(256);
  fs.readSync(sFd, buf, 0, 256, pos * 256);
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Print all int32 values at key offsets
  const fields = {};
  for (let off = 0; off < 44; off += 4) {
    fields[off] = buf.readInt32LE(off);
  }
  // Also 160-200
  for (let off = 120; off < 180; off += 4) {
    fields[off] = buf.readInt32LE(off);
  }
  
  // Check for small values (potential foreign keys)
  const fks = [];
  for (const [off, val] of Object.entries(fields)) {
    if (val > 0 && val < 50000) fks.push(`@${off}=${val}`);
  }
  
  console.log(`Rec ${pos} (${code}):`);
  console.log(`  @0=${fields[0]} @4=${fields[4]} @8=${fields[8]} @12=${fields[12]} @16=${fields[16]}`);
  console.log(`  @28=${fields[28]} @32=${fields[32]} @36=${fields[36]} @40=${fields[40]} @44=${buf.readInt32LE(44)}`);
  console.log(`  Small values: ${fks.join(', ')}`);
}
fs.closeSync(sFd);

// Now let's try a DIFFERENT approach: check ANIMAL records for visit history
// Or better: check if VISIT @4 is animal_id and @40 is NOT a service pointer
console.log('\n\n=== VISIT.V2$ field analysis ===\n');
const vFd = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const vStat = fs.statSync(dataDir + '\\VISIT.V2$');
const vTotal = Math.floor(vStat.size / 256);

for (const pos of [0, 1, 100, 1000, vTotal - 5, vTotal - 1]) {
  const buf = Buffer.alloc(256);
  fs.readSync(vFd, buf, 0, 256, pos * 256);
  
  const dateVal = buf.readDoubleLE(21);
  let date = null;
  if (dateVal > 35000 && dateVal < 47000) {
    date = new Date(DELPHI_EPOCH + dateVal * 86400000).toISOString().split('T')[0];
  }
  
  // All int32 fields
  const fields = {};
  for (let off = 0; off < 80; off += 4) {
    fields[off] = buf.readInt32LE(off);
  }
  
  // Pascal strings
  const strings = [];
  for (let off = 30; off < 80; off++) {
    const len = buf[off];
    if (len > 1 && len < 15) {
      const s = buf.toString('ascii', off+1, off+1+len).replace(/[\x00-\x1F\x7F-\xFF]/g, '');
      if (/^[A-Z0-9]{2,}$/.test(s)) strings.push(`@${off}[${len}]="${s}"`);
    }
  }
  
  let ascii = '';
  for (let i = 0; i < 80; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  console.log(`Visit ${pos}: date=${date}`);
  console.log(`  @0=${fields[0]} @4=${fields[4]} @8=${fields[8]} @12=${fields[12]} @16=${fields[16]}`);
  console.log(`  @29=${buf.readUInt8(29)} @30=${buf.readUInt8(30)} @32=${fields[32]} @36=${fields[36]} @40=${fields[40]}`);
  console.log(`  Strings: ${strings.join(', ')}`);
  console.log(`  ASCII[0-80]: ${ascii}`);
}
fs.closeSync(vFd);

// Key question: what's the REAL link between SERVICE and VISIT?
// Maybe SERVICE records link to ANIMAL, and VISIT links to ANIMAL too.
// Then we join on animal_id and use sequential order.
console.log('\n\n=== SERVICE @4 as animal_id — frequency analysis ===');
const sFd2 = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');

// Sample last 1000 records, check @4
const animalIds = {};
let validAnimal = 0;
let invalidAnimal = 0;

for (let r = sTotal - 10000; r < sTotal; r++) {
  const buf = Buffer.alloc(8);
  fs.readSync(sFd2, buf, 0, 8, r * 256);
  const val = buf.readInt32LE(4);
  if (val > 0 && val < 30000) {
    validAnimal++;
    animalIds[val] = (animalIds[val] || 0) + 1;
  } else {
    invalidAnimal++;
  }
}
fs.closeSync(sFd2);

console.log(`Last 10K records: valid animal IDs (<30K): ${validAnimal}, invalid: ${invalidAnimal}`);
console.log(`Unique animals: ${Object.keys(animalIds).length}`);

// If most are invalid, @4 isn't animal_id for all records
// Check VISIT @4 for animal_id too
console.log('\n=== VISIT @4 as animal_id ===');
const vFd2 = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
let vValidAnimal = 0;
let vInvalidAnimal = 0;
for (let r = vTotal - 1000; r < vTotal; r++) {
  const buf = Buffer.alloc(8);
  fs.readSync(vFd2, buf, 0, 8, r * 256);
  const val = buf.readInt32LE(4);
  if (val > 0 && val < 30000) vValidAnimal++;
  else vInvalidAnimal++;
}
fs.closeSync(vFd2);
console.log(`Last 1K visits: valid animal IDs: ${vValidAnimal}, invalid: ${vInvalidAnimal}`);
