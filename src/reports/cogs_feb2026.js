/**
 * cogs_feb2026.js
 * 
 * Attempt COGS for February 2026 using available data sources:
 * 
 * Method 1: PO purchases in Feb 2026 (what was ordered/received)
 *   - Approximation: assumes inventory levels stable
 *   - COGS ≈ cost of goods purchased in period
 * 
 * Method 2: USAGE.V2$ consumption data for Feb 2026
 *   - More accurate: actual inventory consumed
 *   - Requires USAGE to have dates + item codes
 * 
 * Method 3: Service quantity × unit cost (best but needs TREAT→ITEM join)
 *   - Not yet available
 */

import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

const FEB_START = '2026-02-01';
const FEB_END   = '2026-02-28';

function readFile(name) {
  const fd = fs.openSync(`${dataDir}\\${name}`, 'r');
  const stat = fs.fstatSync(fd);
  const buf = Buffer.alloc(stat.size);
  fs.readSync(fd, buf, 0, stat.size, 0);
  fs.closeSync(fd);
  return buf;
}

function extractPascal(buf, offset, maxLen = 40) {
  if (offset >= buf.length) return '';
  const len = buf[offset];
  if (len === 0 || len > maxLen || offset + 1 + len > buf.length) return '';
  const s = buf.toString('ascii', offset + 1, offset + 1 + len);
  return /^[\x20-\x7E]+$/.test(s) ? s.trim() : '';
}

function delphiToDate(v) {
  if (v < 35000 || v > 47000) return null;
  try {
    return new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0];
  } catch(e) { return null; }
}

// ============================================================
// Load items: code → { name, uom, pack_size }
// ============================================================
const itemBuf = readFile('ITEM.V2$');
const ITEM_REC = 549;
const items = {};
for (let i = 0; i < Math.floor(itemBuf.length / ITEM_REC); i++) {
  const b = itemBuf.subarray(i * ITEM_REC, (i+1) * ITEM_REC);
  const code = extractPascal(b, 40, 10);
  if (!code) continue;
  const nameLen = b[51] || 0;
  const name = nameLen > 0 ? b.toString('ascii', 52, 52+nameLen).replace(/[^\x20-\x7E]/g, '').trim() : '';
  if (!name) continue;
  const uom = extractPascal(b, 123, 20) || null;
  const pack_size = b.readInt16LE(154) || 1;
  items[code] = { code, name, uom, pack_size };
}
console.log(`Loaded ${Object.keys(items).length} inventory items\n`);

// ============================================================
// METHOD 1: PO purchases in February 2026
// ============================================================
console.log('=== METHOD 1: PO Purchases in February 2026 ===\n');

const poBuf = readFile('PO.V2$');
const PO_REC = 64;
const poCount = Math.floor(poBuf.length / PO_REC);

let currentDate = null;
let currentVendor = null;
const febPO = []; // all line items in Feb 2026

for (let i = 0; i < poCount; i++) {
  const b = poBuf.subarray(i * PO_REC, (i+1) * PO_REC);
  const flags29 = b[29];
  const v = b.readDoubleLE(21);
  const date = delphiToDate(v);

  if (date && flags29 !== 62 && flags29 !== 121) {
    currentDate = date;
    const vlen = Math.min(b[56] || 0, 8);
    currentVendor = vlen > 0 ? b.toString('ascii', 57, 57+vlen).replace(/[^\x20-\x7E]/g, '').trim() : '';
  } else {
    if (currentDate && currentDate >= FEB_START && currentDate <= FEB_END) {
      const qtyStr = b.toString('ascii', 0, 12).replace(/[^\x20-\x7E]/g, '').trim();
      const qty = parseInt(qtyStr) || 0;
      const codeLen = Math.min(b[13] || 0, 14);
      const code = codeLen > 0 ? b.toString('ascii', 14, 14+codeLen).replace(/[^\x20-\x7E]/g, '').trim() : '';
      const rawCost = b.readInt32LE(32);
      const cost = rawCost > 0 ? Math.round(rawCost / 100) / 100 : 0;
      if (code && qty > 0 && cost > 0) {
        const item = items[code] || { name: '?', uom: null, pack_size: 1 };
        const totalCost = cost * qty;
        febPO.push({ date: currentDate, code, name: item.name, uom: item.uom, pack_size: item.pack_size, qty, unit_cost: cost, total_cost: totalCost, vendor: currentVendor });
      }
    }
  }
}

// Group by vendor
const byVendor = {};
let totalPOCost = 0;
for (const row of febPO) {
  if (!byVendor[row.vendor]) byVendor[row.vendor] = { vendor: row.vendor, lines: 0, total: 0 };
  byVendor[row.vendor].lines++;
  byVendor[row.vendor].total += row.total_cost;
  totalPOCost += row.total_cost;
}

console.log(`Feb 2026 PO line items: ${febPO.length}`);
console.log(`\nBy vendor:`);
Object.values(byVendor)
  .sort((a,b) => b.total - a.total)
  .forEach(v => console.log(`  ${v.vendor.padEnd(12)} ${v.lines} lines   $${v.total.toFixed(2).padStart(10)}`));
console.log(`\n  TOTAL PO SPEND Feb 2026: $${totalPOCost.toFixed(2)}`);

// Top items by cost
console.log('\nTop 20 items by purchase cost (Feb 2026):');
console.log('Code'.padEnd(14) + 'Name'.padEnd(42) + 'UOM'.padEnd(8) + 'Pack'.padEnd(6) + 'Qty'.padEnd(5) + 'Unit$'.padEnd(10) + 'Total$');
console.log('-'.repeat(100));
febPO.sort((a,b) => b.total_cost - a.total_cost)
  .slice(0, 20)
  .forEach(r => {
    console.log(
      r.code.padEnd(14) +
      r.name.substring(0,41).padEnd(42) +
      (r.uom||'?').padEnd(8) +
      String(r.pack_size).padEnd(6) +
      String(r.qty).padEnd(5) +
      ('$'+r.unit_cost.toFixed(2)).padEnd(10) +
      '$'+r.total_cost.toFixed(2)
    );
  });

// ============================================================
// METHOD 2: USAGE.V2$ — decode dates and check Feb 2026
// ============================================================
console.log('\n\n=== METHOD 2: USAGE.V2$ — Checking for Feb 2026 data ===\n');

const usageBuf = readFile('USAGE.V2$');
const USAGE_REC = 117;
const usageCount = Math.floor(usageBuf.length / USAGE_REC);
console.log(`Total USAGE records: ${usageCount}`);

// Scan for Feb 2026 dated records
const febUsage = [];
let dateFound = 0;
let latestDate = null;
let earliestDate = null;

for (let i = 0; i < usageCount; i++) {
  const b = usageBuf.subarray(i * USAGE_REC, (i+1) * USAGE_REC);
  
  // Date at @21 (TDateTime)
  const v = b.readDoubleLE(21);
  const date = delphiToDate(v);
  if (!date) continue;
  dateFound++;
  if (!earliestDate || date < earliestDate) earliestDate = date;
  if (!latestDate || date > latestDate) latestDate = date;

  // Item code: Pascal string around @66
  let itemCode = null;
  for (let off = 62; off < 75; off++) {
    const s = extractPascal(b, off, 12);
    if (s && items[s]) { itemCode = s; break; }
  }

  // Qty fields — based on structure: @46=qty_dispensed (int32 or int16)
  // From earlier decode: @48=0x64=100 was constant, @46 varied
  // Let's read multiple candidates
  const qty44 = b.readInt16LE(44);
  const qty46 = b.readInt16LE(46);
  const qty48 = b.readInt16LE(48);
  
  if (date >= FEB_START && date <= FEB_END) {
    febUsage.push({ date, itemCode, qty44, qty46, qty48, rec: i });
  }
}

console.log(`Records with valid dates: ${dateFound}`);
console.log(`Date range: ${earliestDate} to ${latestDate}`);
console.log(`Feb 2026 records: ${febUsage.length}`);

if (febUsage.length > 0) {
  console.log('\nSample Feb 2026 USAGE records:');
  febUsage.slice(0, 20).forEach(r => {
    const item = r.itemCode ? items[r.itemCode] : null;
    console.log(`  ${r.date}  code=${r.itemCode||'?'}  ${item ? item.name.substring(0,30) : '(no match)'}  qty44=${r.qty44} qty46=${r.qty46} qty48=${r.qty48}`);
  });

  // Calculate COGS from usage
  console.log('\n--- COGS from USAGE (Feb 2026) ---');
  let usageCOGS = 0;
  const usageByItem = {};
  for (const r of febUsage) {
    if (!r.itemCode) continue;
    const item = items[r.itemCode];
    if (!item) continue;
    // Need to figure out which qty field is correct — try qty46 first
    const qty = Math.max(r.qty44, r.qty46); // take larger non-zero
    // Get latest PO unit cost
    // ... will need PO map for this
    if (!usageByItem[r.itemCode]) usageByItem[r.itemCode] = { item, qty: 0, count: 0 };
    usageByItem[r.itemCode].qty += qty;
    usageByItem[r.itemCode].count++;
  }
  console.log(`Matched usage records: ${Object.keys(usageByItem).length} items`);
}

// ============================================================
// METHOD 3: Revenue crosscheck — billing vs COGS estimate
// ============================================================
console.log('\n\n=== METHOD 3: Feb 2026 Revenue from Supabase (crosscheck) ===\n');

let revenue = 0;
let page = 0;
const PAGE = 1000;
let serviceCount = 0;
while (true) {
  const { data, error } = await supabase
    .from('services')
    .select('amount, quantity')
    .gte('service_date', FEB_START)
    .lte('service_date', FEB_END + ' 23:59:59')
    .gt('amount', 0)
    .range(page * PAGE, (page+1) * PAGE - 1);
  if (error || !data || data.length === 0) break;
  data.forEach(r => { revenue += (r.amount || 0); serviceCount++; });
  if (data.length < PAGE) break;
  page++;
}

console.log(`Feb 2026 revenue (positive charges): $${revenue.toFixed(2)}`);
console.log(`Service records counted: ${serviceCount}`);
console.log(`\nPO-based COGS estimate: $${totalPOCost.toFixed(2)}`);
if (revenue > 0) {
  const cogsPct = (totalPOCost / revenue * 100).toFixed(1);
  console.log(`COGS as % of revenue: ${cogsPct}%`);
  console.log(`Gross margin estimate: ${(100 - parseFloat(cogsPct)).toFixed(1)}%`);
}

console.log('\n--- SUMMARY ---');
console.log(`Method 1 (PO purchases):  $${totalPOCost.toFixed(2)}  [what you ordered in Feb 2026]`);
console.log(`Feb 2026 Revenue:         $${revenue.toFixed(2)}`);
console.log('\nNote: PO-based COGS is approximate.');
console.log('True COGS = opening inventory + purchases - closing inventory.');
console.log('Or we decode the TREAT→ITEM link for per-service COGS.');
