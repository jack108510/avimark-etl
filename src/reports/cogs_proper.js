/**
 * cogs_proper.js
 * 
 * Build the treat→item join from TREAT.V2$ (512 bytes/rec)
 * then calculate COGS for February 2026 using:
 *   units_sold (from Supabase services) × unit_cost (from ITEM + PO)
 */

import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = 'C:\\AVImark';
const DELPHI = new Date(1899, 11, 30).getTime();

function pascal(b, off, max = 40) {
  const len = b[off];
  if (!len || len > max) return '';
  const s = b.toString('ascii', off + 1, off + 1 + len);
  return /^[\x20-\x7E]+$/.test(s) ? s.trim() : '';
}

// ── Load items (code, name, uom, pack_size) ──────────────────────────────────
const itemBuf = fs.readFileSync(dataDir + '\\ITEM.V2$');
const ITEM_REC = 549;
const itemByRec = {};
const itemByCode = {};
for (let i = 0; i < Math.floor(itemBuf.length / ITEM_REC); i++) {
  const b = itemBuf.subarray(i * ITEM_REC, (i + 1) * ITEM_REC);
  const code = pascal(b, 40, 10);
  if (!code) continue;
  const nl = b[51] || 0;
  const name = nl > 0 ? b.toString('ascii', 52, 52 + nl).replace(/[^\x20-\x7E]/g, '').trim() : '';
  const uom = pascal(b, 123, 20) || null;
  const pack = b.readInt16LE(154) || 1;
  itemByRec[i] = { code, name, uom, pack };
  itemByCode[code] = { rec: i, name, uom, pack };
}
console.log(`Items loaded: ${Object.keys(itemByCode).length}`);

// ── Load PO: item code → most recent unit cost ─────────────────────────────
const poBuf = fs.readFileSync(dataDir + '\\PO.V2$');
const latestPO = {};
let curDate = null;
for (let i = 0; i < Math.floor(poBuf.length / 64); i++) {
  const b = poBuf.subarray(i * 64, (i + 1) * 64);
  const v = b.readDoubleLE(21);
  const flags = b[29];
  let date = null;
  if (v > 35000 && v < 47000) try { date = new Date(DELPHI + v * 86400000).toISOString().split('T')[0]; } catch (e) {}
  if (date && flags !== 62 && flags !== 121) { curDate = date; continue; }
  const qs = b.toString('ascii', 0, 12).replace(/[^\x20-\x7E]/g, '').trim();
  const qty = parseInt(qs) || 0;
  const cl = Math.min(b[12] || 0, 14);
  const code = cl > 0 ? b.toString('ascii', 13, 13 + cl).replace(/[^\x20-\x7E]/g, '').trim() : '';
  const raw = b.readInt32LE(32);
  const cost = raw > 0 ? Math.round(raw / 100) / 100 : 0;
  if (code && qty > 0 && qty <= 5000 && cost > 0 && cost <= 3000 && curDate) {
    if (!latestPO[code] || curDate > latestPO[code].date) {
      latestPO[code] = { date: curDate, qty, cost };
    }
  }
}

// Build item code → unit cost using pack_size
const unitCostByItemCode = {};
for (const [code, po] of Object.entries(latestPO)) {
  const item = itemByCode[code];
  if (!item) continue;
  unitCostByItemCode[code] = po.cost / item.pack;
}
console.log(`Items with PO unit cost: ${Object.keys(unitCostByItemCode).length}`);

// ── Parse TREAT.V2$: service code → primary item code ─────────────────────
const treatBuf = fs.readFileSync(dataDir + '\\TREAT.V2$');
const TREAT_REC = 512;
const treatCount = Math.floor(treatBuf.length / TREAT_REC);

// Primary item offset = @184 (most common single-item pointer)
// Additional items at @128, @140, @224, @296 (multi-item treatments)
const ITEM_PTR_OFFSETS = [184, 128, 140, 224, 296, 232, 240, 248, 256, 264, 272, 280, 288];

const svcToItems = {}; // svcCode → [{itemCode, itemName, offset}]
let treatsParsed = 0;

for (let i = 0; i < treatCount; i++) {
  const b = treatBuf.subarray(i * TREAT_REC, (i + 1) * TREAT_REC);
  const v = b.readDoubleLE(21);
  if (v < 40000 || v > 47000) continue;
  const codeLen = b[40];
  if (!codeLen || codeLen > 12) continue;
  const svcCode = b.toString('ascii', 41, 41 + codeLen).replace(/[^\x20-\x7E]/g, '').trim();
  if (!svcCode) continue;
  treatsParsed++;

  for (const off of ITEM_PTR_OFFSETS) {
    const itemRec = b.readInt32LE(off);
    if (itemRec > 0 && itemRec < 5100 && itemByRec[itemRec]) {
      const item = itemByRec[itemRec];
      if (!svcToItems[svcCode]) svcToItems[svcCode] = [];
      // Avoid duplicates
      if (!svcToItems[svcCode].find(x => x.itemCode === item.code)) {
        svcToItems[svcCode].push({ itemCode: item.code, itemName: item.name, offset: off });
      }
    }
  }
}

console.log(`Treatments parsed: ${treatsParsed}`);
console.log(`Service codes with item mappings: ${Object.keys(svcToItems).length}`);

// ── Feb 2026 service volumes from Supabase ─────────────────────────────────
console.log('\nLoading Feb 2026 services from Supabase...');
let page = 0;
const PAGE = 1000;
const volumes = {};
let totalRevenue = 0;

while (true) {
  const { data, error } = await sb.from('services')
    .select('code, description, amount, quantity')
    .gte('service_date', '2026-02-01')
    .lte('service_date', '2026-02-28 23:59:59')
    .gt('amount', 0)
    .range(page * PAGE, (page + 1) * PAGE - 1);
  if (!data || !data.length) break;
  data.forEach(r => {
    if (!volumes[r.code]) volumes[r.code] = { desc: r.description || '', units: 0, revenue: 0 };
    volumes[r.code].units += (r.quantity || 1);
    volumes[r.code].revenue += (r.amount || 0);
    totalRevenue += r.amount || 0;
  });
  if (data.length < PAGE) break;
  page++;
}
console.log(`Feb 2026 revenue: $${totalRevenue.toFixed(2)} across ${Object.keys(volumes).length} service codes`);

// ── Build COGS ────────────────────────────────────────────────────────────
console.log('\n=== COGS Calculation — February 2026 ===\n');

const rows = [];
let cogsCovered = 0;
let revCovered = 0;
let noMatch = [];

for (const [svcCode, vol] of Object.entries(volumes)) {
  const items = svcToItems[svcCode] || [];

  // Find the primary item (offset 184 first, then others)
  const primary = items.find(x => x.offset === 184) || items[0];

  if (!primary) {
    noMatch.push({ svcCode, desc: vol.desc, units: vol.units, revenue: vol.revenue });
    continue;
  }

  const unitCost = unitCostByItemCode[primary.itemCode];
  if (!unitCost) {
    noMatch.push({ svcCode, desc: vol.desc, units: vol.units, revenue: vol.revenue, hasItem: true, itemCode: primary.itemCode, itemName: primary.itemName });
    continue;
  }

  const cogs = unitCost * vol.units;
  const margin = vol.revenue > 0 ? ((vol.revenue - cogs) / vol.revenue * 100) : null;

  rows.push({
    svcCode, desc: vol.desc, itemCode: primary.itemCode, itemName: primary.itemName,
    uom: itemByCode[primary.itemCode]?.uom || '?',
    pack: itemByCode[primary.itemCode]?.pack || 1,
    units: vol.units, revenue: vol.revenue, unitCost, cogs, margin
  });
  cogsCovered += cogs;
  revCovered += vol.revenue;
}

// Print results
console.log('Code'.padEnd(14) + 'Item'.padEnd(30) + 'UOM'.padEnd(7) + 'Sold'.padEnd(7) +
  'Revenue'.padEnd(10) + 'Unit$'.padEnd(9) + 'COGS'.padEnd(10) + 'Margin%');
console.log('-'.repeat(100));

rows.sort((a, b) => b.revenue - a.revenue).forEach(r => {
  const flag = r.margin !== null && (r.margin < 0 || r.margin > 99) ? ' ⚠' : '';
  console.log(
    r.svcCode.padEnd(14) +
    r.itemName.substring(0, 29).padEnd(30) +
    (r.uom || '?').padEnd(7) +
    String(Math.round(r.units)).padEnd(7) +
    ('$' + r.revenue.toFixed(0)).padEnd(10) +
    ('$' + r.unitCost.toFixed(3)).padEnd(9) +
    ('$' + r.cogs.toFixed(0)).padEnd(10) +
    (r.margin !== null ? r.margin.toFixed(1) + '%' : 'N/A') + flag
  );
});

console.log('\n' + '='.repeat(100));
console.log(`COVERED: ${rows.length} service codes`);
console.log(`Revenue covered:  $${revCovered.toFixed(2)} (${(revCovered / totalRevenue * 100).toFixed(1)}% of total)`);
console.log(`COGS (covered):   $${cogsCovered.toFixed(2)}`);
console.log(`Gross margin:     ${((revCovered - cogsCovered) / revCovered * 100).toFixed(1)}%`);
console.log(`Total Feb revenue: $${totalRevenue.toFixed(2)}`);

console.log(`\nNOT COVERED: ${noMatch.length} service codes`);
const noMatchRev = noMatch.reduce((s, r) => s + r.revenue, 0);
console.log(`Revenue not covered: $${noMatchRev.toFixed(2)} (${(noMatchRev / totalRevenue * 100).toFixed(1)}%) — mostly procedures/exams`);

console.log('\nTop unmatched:');
noMatch.sort((a, b) => b.revenue - a.revenue).slice(0, 15).forEach(r => {
  const note = r.hasItem ? `(item=${r.itemCode} no PO cost)` : '(no item link)';
  console.log(`  ${r.svcCode.padEnd(14)} ${r.desc.substring(0, 35).padEnd(36)} $${r.revenue.toFixed(0).padStart(7)} ${note}`);
});
