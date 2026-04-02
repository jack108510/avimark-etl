import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// Step 1: Read all SERVICE records into memory — just code per record_num
console.log('Loading SERVICE.V2$ codes...');
const sFd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
const sStat = fs.statSync(dataDir + '\\SERVICE.V2$');
const sTotal = Math.floor(sStat.size / 256);

// We can't load 152MB into one buffer, so read in chunks
// Store code for each record num
const serviceCodes = new Array(sTotal);
const serviceAmounts = new Float64Array(sTotal);
const CHUNK = 50000;

for (let start = 0; start < sTotal; start += CHUNK) {
  const count = Math.min(CHUNK, sTotal - start);
  const buf = Buffer.alloc(count * 256);
  fs.readSync(sFd, buf, 0, count * 256, start * 256);
  
  for (let i = 0; i < count; i++) {
    const rec = buf.subarray(i * 256, (i + 1) * 256);
    const codeLen = Math.min(rec[103] || 0, 12);
    if (codeLen > 0) {
      serviceCodes[start + i] = rec.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() || null;
      serviceAmounts[start + i] = rec.readInt32LE(112) / 100;
    }
  }
}
fs.closeSync(sFd);
console.log(`Loaded ${sTotal} service records`);

// Step 2: Read all VISIT records — get date + service pointer range
console.log('Loading VISIT.V2$ dates...');
const vFd = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const vStat = fs.statSync(dataDir + '\\VISIT.V2$');
const vTotal = Math.floor(vStat.size / 256);

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

// Each visit has @40 = pointer to first SERVICE record.
// The services for this visit go from @40 to the next visit's @40 - 1.
// Read all visits first, collect date + servicePtr pairs.
const visits = []; // [{date, serviceStart}]

const vBuf = Buffer.alloc(vTotal * 256);
fs.readSync(vFd, vBuf, 0, vTotal * 256, 0);
fs.closeSync(vFd);

for (let i = 0; i < vTotal; i++) {
  const rec = vBuf.subarray(i * 256, (i + 1) * 256);
  
  let dateVal;
  try {
    dateVal = rec.readDoubleLE(21);
  } catch(e) { continue; }
  
  let date = null;
  if (dateVal > 35000 && dateVal < 47000) {
    date = new Date(DELPHI_EPOCH + dateVal * 86400000);
  }
  
  const serviceStart = rec.readInt32LE(40);
  visits.push({ date, serviceStart });
}

console.log(`Loaded ${visits.length} visits`);
console.log(`Date range: ${visits[0]?.date?.toISOString().split('T')[0]} to ${visits[visits.length-1]?.date?.toISOString().split('T')[0]}`);

// Sort by serviceStart to determine ranges
visits.sort((a, b) => a.serviceStart - b.serviceStart);

// Step 3: For each visit, assign its date to all SERVICE records from serviceStart
// to the next visit's serviceStart - 1
const codeCounts = {};
const codeRevenue = {};
let recentVisits = 0;
let recentServices = 0;

for (let i = 0; i < visits.length; i++) {
  const visit = visits[i];
  if (!visit.date) continue;
  
  // Only count last 365 days
  if (visit.date < oneYearAgo || visit.date > now) continue;
  
  recentVisits++;
  
  const start = visit.serviceStart;
  const end = (i + 1 < visits.length) ? visits[i + 1].serviceStart : sTotal;
  
  if (start < 0 || start >= sTotal) continue;
  const actualEnd = Math.min(end, sTotal);
  
  for (let s = start; s < actualEnd; s++) {
    const code = serviceCodes[s];
    if (!code) continue;
    recentServices++;
    codeCounts[code] = (codeCounts[code] || 0) + 1;
    codeRevenue[code] = (codeRevenue[code] || 0) + (serviceAmounts[s] || 0);
  }
}

console.log(`\nLast 365 days: ${recentVisits} visits, ${recentServices} service line items`);
console.log(`Unique codes: ${Object.keys(codeCounts).length}`);

const sorted = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
console.log('\nTop 30 by volume (last 365 days):');
for (const [code, count] of sorted.slice(0, 30)) {
  const rev = codeRevenue[code] || 0;
  console.log(`  ${code.padEnd(14)} ${count.toString().padStart(5)}  $${rev.toFixed(2).padStart(12)}`);
}

// Save
const output = {
  counts: codeCounts,
  revenue: codeRevenue,
  period: 'last_365_days',
  method: 'VISIT.V2$ date @21 → SERVICE.V2$ code lookup via @40 pointer',
  recentVisits,
  recentServices,
  cutoffDate: oneYearAgo.toISOString().split('T')[0],
  generatedDate: now.toISOString().split('T')[0],
};

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/real_volumes.json', JSON.stringify(output, null, 2));
console.log('\n✅ Saved to reports/real_volumes.json');
