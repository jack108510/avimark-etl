#!/usr/bin/env node
/**
 * Reads SERVICE.V2$ to map record_num → treatment code,
 * then re-keys service_volumes.json by code instead of record ID.
 */
import fs from 'fs';
import { ServiceParser } from '../parsers/services.js';

const parser = new ServiceParser('C:\\AVImark');
const records = parser.parse();

// Build record_num → code map
const idToCode = {};
for (const rec of records) {
  if (rec && rec.record_num != null && rec.code) {
    idToCode[String(rec.record_num)] = rec.code;
  }
}
console.log(`Parsed ${records.length} service records, ${Object.keys(idToCode).length} with codes`);

// Load existing volumes (keyed by numeric ID)
const raw = JSON.parse(fs.readFileSync('reports/service_volumes.json', 'utf8'));

// Re-key by treatment code, summing where multiple records share same code
function rekeyAndSum(obj) {
  const out = {};
  for (const [id, val] of Object.entries(obj)) {
    const code = idToCode[id];
    if (!code) continue;
    out[code] = (out[code] || 0) + val;
  }
  return out;
}

const fixed = {
  counts: rekeyAndSum(raw.counts),
  revenue: rekeyAndSum(raw.revenue),
  annualCounts: rekeyAndSum(raw.annualCounts),
  annualRevenue: rekeyAndSum(raw.annualRevenue),
  dataYears: raw.dataYears,
};

console.log(`Mapped ${Object.keys(raw.counts).length} numeric IDs → ${Object.keys(fixed.counts).length} unique treatment codes`);

// Show top 20 by volume
const sorted = Object.entries(fixed.annualCounts).sort((a, b) => b[1] - a[1]);
console.log('\nTop 20 by annual volume:');
for (const [code, count] of sorted.slice(0, 20)) {
  const rev = fixed.annualRevenue[code] || 0;
  console.log(`  ${code.padEnd(12)} ${count.toString().padStart(6)}/yr  $${rev.toFixed(2).padStart(12)}/yr`);
}

fs.writeFileSync('reports/service_volumes.json', JSON.stringify(fixed, null, 2));
console.log('\n✅ service_volumes.json re-keyed by treatment code');
