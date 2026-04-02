import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = Date.UTC(1899, 11, 30);

// Load real volumes
const volData = JSON.parse(fs.readFileSync('reports/real_volumes.json', 'utf8'));
const counts = volData.counts;
const revenue = volData.revenue;

// 1. Total "revenue" from all stale items
const priceData = JSON.parse(fs.readFileSync('reports/price_dates.json', 'utf8'));
const { data: priceList } = await sb.from('prices').select('treatment_code, price');
const priceMap = {};
for (const p of priceList) {
  if (!priceMap[p.treatment_code] || p.price > priceMap[p.treatment_code]) {
    priceMap[p.treatment_code] = p.price;
  }
}

// 2. Check: how many service line items per visit?
console.log('=== VISIT→SERVICE mapping analysis ===\n');
const vFd = fs.openSync(dataDir + '\\VISIT.V2$', 'r');
const vStat = fs.statSync(dataDir + '\\VISIT.V2$');
const vTotal = Math.floor(vStat.size / 256);

const visits = [];
for (let i = 0; i < vTotal; i++) {
  const buf = Buffer.alloc(256);
  fs.readSync(vFd, buf, 0, 256, i * 256);
  const dateVal = buf.readDoubleLE(21);
  let date = null;
  if (dateVal > 35000 && dateVal < 47000) {
    date = new Date(DELPHI_EPOCH + dateVal * 86400000);
  }
  const serviceStart = buf.readInt32LE(40);
  const animalId = buf.readInt32LE(4); // @4 might be animal
  visits.push({ idx: i, date, serviceStart, animalId });
}
fs.closeSync(vFd);

// Sort by serviceStart
visits.sort((a, b) => a.serviceStart - b.serviceStart);

// Calculate service count per visit
const serviceCounts = [];
for (let i = 0; i < visits.length; i++) {
  const start = visits[i].serviceStart;
  const end = (i + 1 < visits.length) ? visits[i + 1].serviceStart : 625740;
  serviceCounts.push(end - start);
}

// Stats
const total = serviceCounts.reduce((s, v) => s + v, 0);
const avg = total / serviceCounts.length;
const max = Math.max(...serviceCounts);
const min = Math.min(...serviceCounts);
const median = serviceCounts.sort((a, b) => a - b)[Math.floor(serviceCounts.length / 2)];

console.log(`Visits: ${visits.length}`);
console.log(`Service records: ${total} (should be ~625740)`);
console.log(`Services per visit: avg=${avg.toFixed(1)}, median=${median}, min=${min}, max=${max}`);

// How many visits have > 100 services?
const over100 = serviceCounts.filter(c => c > 100).length;
const over500 = serviceCounts.filter(c => c > 500).length;
console.log(`Visits with >100 services: ${over100}`);
console.log(`Visits with >500 services: ${over500}`);

// 3. The huge ones are suspicious — look at them
console.log('\n=== Visits with most services ===');
const indexed = visits.map((v, i) => ({ ...v, serviceCount: (i + 1 < visits.length) ? visits[i+1].serviceStart - v.serviceStart : 625740 - v.serviceStart }));
indexed.sort((a, b) => b.serviceCount - a.serviceCount);

for (const v of indexed.slice(0, 10)) {
  console.log(`  Visit ${v.idx}: date=${v.date?.toISOString().split('T')[0] || '?'}, serviceStart=${v.serviceStart}, count=${v.serviceCount}, animal=${v.animalId}`);
}

// 4. Check: are there OTHER pointers in VISIT besides @40?
// Maybe @40 isn't the only thing — maybe visits share service ranges
// Let's see if service pointers overlap
console.log('\n=== Service pointer analysis ===');
const ptrs = visits.map(v => v.serviceStart).sort((a, b) => a - b);
let overlaps = 0;
let dupes = 0;
for (let i = 1; i < ptrs.length; i++) {
  if (ptrs[i] === ptrs[i-1]) dupes++;
  if (ptrs[i] < ptrs[i-1]) overlaps++;
}
console.log(`Duplicate service pointers: ${dupes}`);
console.log(`Out-of-order pointers: ${overlaps}`);
console.log(`Pointer range: ${ptrs[0]} to ${ptrs[ptrs.length-1]}`);

// 5. Maybe @40 is just a single SERVICE record, not a range start
// Let's check: read the VISIT and its @40 service, see if consecutive services
// belong to the same animal
console.log('\n=== Testing: is @40 a range start or single pointer? ===');
const sFd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');

for (const v of indexed.slice(0, 3)) {
  const start = v.serviceStart;
  console.log(`\nVisit ${v.idx} (date=${v.date?.toISOString().split('T')[0]}, animal=${v.animalId}, services=${v.serviceCount}):`);
  
  // Read first 5 and last 5 services in the "range"
  for (let s = start; s < Math.min(start + 5, 625740); s++) {
    const buf = Buffer.alloc(256);
    fs.readSync(sFd, buf, 0, 256, s * 256);
    const codeLen = Math.min(buf[103] || 0, 12);
    const code = codeLen > 0 ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
    const animalId = buf.readInt32LE(4);
    console.log(`  SERVICE[${s}]: code=${code}, animal=${animalId}`);
  }
}
fs.closeSync(sFd);

// 6. Total clinic revenue from our volume data
console.log('\n\n=== Revenue sanity check ===');
let totalRevenue = 0;
for (const [code, vol] of Object.entries(counts)) {
  const price = priceMap[code];
  if (price && price > 0) {
    totalRevenue += price * vol;
  }
}
console.log(`Estimated gross revenue (price × volume, last 365d): $${totalRevenue.toFixed(2)}`);
console.log(`That's $${(totalRevenue/12).toFixed(2)}/month`);

// Also sum actual charged amounts from SERVICE
let totalCharged = 0;
for (const [code, rev] of Object.entries(revenue)) {
  totalCharged += rev;
}
console.log(`Actual charged amounts from SERVICE.V2$: $${totalCharged.toFixed(2)}`);
