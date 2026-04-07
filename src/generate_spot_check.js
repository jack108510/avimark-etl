#!/usr/bin/env node
import fs from 'fs';

const rows = JSON.parse(fs.readFileSync('list_prices_v4.json', 'utf8'));

const high = rows.filter(r => r.tier === 'HIGH' && !r.drifting);
const drifting = rows.filter(r => r.drifting && r.tier === 'HIGH' && r.drift_months >= 2);
const lows = rows.filter(r => r.tier === 'LOW' && r.revenue_365d > 1000);

const top15 = high.slice(0, 15);
const drift7 = drifting.slice(0, 7);
const low3 = lows.slice(0, 3);

console.log('========================================');
console.log('  25-ITEM SPOT-CHECK LIST');
console.log('  Verify each against Avimark UI');
console.log('========================================\n');

console.log('## GROUP A: 15 HIGH-CONFIDENCE STABLE (should match Avimark exactly)\n');
top15.forEach((r, i) => {
  console.log(`${String(i+1).padStart(2)}. ${r.treatment_code.padEnd(10)} $${String(r.list_price).padEnd(8)} ${r.description}`);
  console.log(`    conf ${r.confidence}% | share ${r.share_pct}% | ${r.months_held}mo since ${r.last_changed.substring(0,7)}`);
});

console.log('\n## GROUP B: 7 DRIFTING CODES (verify if NEW price is the list price now)\n');
drift7.forEach((r, i) => {
  console.log(`${i+16}. ${r.treatment_code.padEnd(10)} OLD $${r.list_price} → NEW $${r.drift_price}   ${r.description}`);
  console.log(`    What does Avimark show today? (new price held ${r.drift_months}mo)`);
});

console.log('\n## GROUP C: 3 LOW-CONFIDENCE (my guess might be wrong — tell me real price)\n');
low3.forEach((r, i) => {
  console.log(`${i+23}. ${r.treatment_code.padEnd(10)} guess $${r.list_price} (${r.share_pct}% share)   ${r.description}`);
  console.log(`    alts: $${r.alt1_price}×${r.alt1_count}, $${r.alt2_price}×${r.alt2_count}`);
});

const all = [...top15, ...drift7, ...low3];
const csv = ['#,group,code,our_price,drift_price,description,avimark_price,correct?,notes'];
all.forEach((r, i) => {
  const group = i < 15 ? 'A' : i < 22 ? 'B' : 'C';
  const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
  csv.push([i+1, group, r.treatment_code, r.list_price, r.drift_price || '', `"${desc}"`, '', '', ''].join(','));
});
fs.writeFileSync('spot_check_25.csv', csv.join('\n'));
console.log('\n✅ Saved spot_check_25.csv (fill in avimark_price column as you check)');
