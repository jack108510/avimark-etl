import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// Key findings:
// - SERVICE @4 = animal_id (recent records, ~85% valid)
// - VISIT @4 = animal_id (~93% valid)
// - VISIT @40 = some pointer into SERVICE (but NOT a range — 45K dupes)
// - VISIT @45 = doctor initials (Pascal string)
// - SERVICE records are chronological
// - SERVICE @21 = date (TDateTime double) — but early records all show 2019-02-03
//
// Wait — SERVICE @21 DID give dates that were chronological for recent records!
// Rec 500000: 2022-08-23, Rec 600000: 2025-09-02, Rec 625739: 2026-03-13
// But early records all showed 2019-02-03.
//
// Theory: the date at @21 might be a "last modified" timestamp for the record,
// and records before a DB migration/conversion all got stamped with the same date.
// For RECENT records, this IS the real service date.
//
// Better approach: just use SERVICE @4 (animal_id) to join with VISIT @4 (animal_id),
// AND use SERVICE's sequential position to establish chronological order.
// 
// Actually, simplest correct approach:
// SERVICE records are chronological (proven). 
// SERVICE @4 = animal_id (proven for recent records).
// SERVICE @21 = date (TDateTime) — but only reliable for records after ~rec 400000.
//
// Let's check: from what record number does @21 start giving real (varying) dates?

console.log('=== Finding where SERVICE @21 dates become reliable ===\n');

const sFd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const sStat = fs.statSync(dataDir + '\\SERVICE.V2$');
const sTotal = Math.floor(sStat.size / 256);

// Sample every 10000 records
for (let r = 0; r < sTotal; r += 10000) {
  const buf = Buffer.alloc(256);
  fs.readSync(sFd, buf, 0, 256, r * 256);
  
  const dateVal = buf.readDoubleLE(21);
  let date = null;
  if (dateVal > 35000 && dateVal < 47000) {
    date = new Date(DELPHI_EPOCH + dateVal * 86400000).toISOString().split('T')[0];
  }
  
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  console.log(`Rec ${r.toString().padStart(6)}: date=${date || 'none'} code=${code}`);
}

// Binary search: find the transition point
console.log('\n=== Finding transition from 2019-02-03 to real dates ===');
let lo = 0, hi = sTotal - 1;
const FIXED_DATE = 43499; // 2019-02-03 as Delphi TDateTime (approx)

while (hi - lo > 100) {
  const mid = Math.floor((lo + hi) / 2);
  const buf = Buffer.alloc(256);
  fs.readSync(sFd, buf, 0, 256, mid * 256);
  const dateVal = buf.readDoubleLE(21);
  
  if (dateVal > 35000 && dateVal < 47000 && Math.abs(dateVal - FIXED_DATE) < 1) {
    lo = mid; // still in the "fixed date" zone
  } else {
    hi = mid;
  }
}

console.log(`Transition around record ${lo}-${hi}`);

// Show records around transition
for (let r = lo - 5; r <= hi + 5; r++) {
  const buf = Buffer.alloc(256);
  fs.readSync(sFd, buf, 0, 256, r * 256);
  const dateVal = buf.readDoubleLE(21);
  let date = null;
  if (dateVal > 35000 && dateVal < 47000) {
    date = new Date(DELPHI_EPOCH + dateVal * 86400000).toISOString().split('T')[0];
  }
  const codeLen = Math.min(buf[103] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  console.log(`  Rec ${r}: date=${date} code=${code} raw=${dateVal?.toFixed(4)}`);
}

fs.closeSync(sFd);

// So for records AFTER the transition, we have real dates directly in SERVICE.V2$.
// For records before, we need to use the positional/chronological approach.
// But the question is: how many of the LAST YEAR's records have real dates?

console.log('\n=== Checking if last year of records all have real dates ===');
const sFd2 = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');

// If transition is around rec 400K-500K, and last year starts ~rec 578K, we're good
const lastYearStart = sTotal - Math.round(sTotal / 13.24);
console.log(`Estimated last year start: rec ${lastYearStart}`);

// Sample 20 records from last year
let allHaveDates = true;
for (let r = lastYearStart; r < sTotal; r += 2000) {
  const buf = Buffer.alloc(256);
  fs.readSync(sFd2, buf, 0, 256, r * 256);
  const dateVal = buf.readDoubleLE(21);
  if (dateVal > 35000 && dateVal < 47000) {
    const date = new Date(DELPHI_EPOCH + dateVal * 86400000);
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (date < oneYearAgo || date > now) {
      console.log(`  Rec ${r}: ${date.toISOString().split('T')[0]} — OUT OF RANGE`);
    }
  } else {
    console.log(`  Rec ${r}: no valid date (val=${dateVal})`);
    allHaveDates = false;
  }
}
fs.closeSync(sFd2);

if (allHaveDates) {
  console.log('All sampled records in last year have valid dates — can use SERVICE @21 directly!');
}
