/**
 * po_unit_cost_check.js
 * Verify: does po_cost / pack_size = sensible unit cost?
 * Cross-check against what the clinic actually charges per unit.
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

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

// Load items with UOM + pack_size
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

// Load PO line items — most recent order per item
const poBuf = readFile('PO.V2$');
const PO_REC = 64;
const poCount = Math.floor(poBuf.length / PO_REC);
const latestPO = {}; // code → most recent {date, qty, cost, vendor}
let currentDate = null;
let currentVendor = null;

for (let i = 0; i < poCount; i++) {
  const b = poBuf.subarray(i * PO_REC, (i+1) * PO_REC);
  const flags29 = b[29];
  const v = b.readDoubleLE(21);
  let date = null;
  if (v > 35000 && v < 47000) {
    try { date = new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0]; } catch(e) {}
  }
  if (date && flags29 !== 62 && flags29 !== 121) {
    currentDate = date;
    const vlen = Math.min(b[56] || 0, 8);
    currentVendor = vlen > 0 ? b.toString('ascii', 57, 57+vlen).replace(/[^\x20-\x7E]/g, '').trim() : '';
  } else {
    const qtyStr = b.toString('ascii', 0, 12).replace(/[^\x20-\x7E]/g, '').trim();
    const qty = parseInt(qtyStr) || 0;
    const codeLen = Math.min(b[13] || 0, 14);
    const code = codeLen > 0 ? b.toString('ascii', 14, 14+codeLen).replace(/[^\x20-\x7E]/g, '').trim() : '';
    const rawCost = b.readInt32LE(32);
    const cost = rawCost > 0 ? Math.round(rawCost / 100) / 100 : 0;
    if (code && qty > 0 && cost > 0 && currentDate) {
      // Keep most recent
      if (!latestPO[code] || currentDate > latestPO[code].date) {
        latestPO[code] = { date: currentDate, qty, cost, vendor: currentVendor };
      }
    }
  }
}

// Pull billing prices from Supabase (most common charge = list price)
console.log('Loading billing prices from Supabase...');
let billingPrices = {};
let page = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await supabase
    .from('pricing_dashboard')
    .select('treatment_code, current_price, description')
    .range(page * PAGE, (page + 1) * PAGE - 1);
  if (error || !data || data.length === 0) break;
  data.forEach(r => { billingPrices[r.treatment_code] = r; });
  if (data.length < PAGE) break;
  page++;
}
console.log(`Loaded ${Object.keys(billingPrices).length} billing prices\n`);

// Build comparison table
console.log('=== PO Cost / Pack Size = Unit Cost vs Billed Price ===\n');
console.log(
  'Code'.padEnd(13) +
  'Name'.padEnd(42) +
  'UOM'.padEnd(8) +
  'Pack'.padEnd(6) +
  'PO Cost'.padEnd(10) +
  'Unit Cost'.padEnd(11) +
  'Billed'.padEnd(10) +
  'Margin%'
);
console.log('-'.repeat(110));

const results = [];

for (const [code, item] of Object.entries(items)) {
  const po = latestPO[code];
  const billing = billingPrices[code];
  if (!po || !billing || !billing.current_price) continue;

  const packSize = item.pack_size || 1;
  const unitCost = po.cost / packSize;
  const billedPrice = billing.current_price;
  const margin = billedPrice > 0 ? ((billedPrice - unitCost) / billedPrice * 100) : null;

  results.push({
    code, name: item.name, uom: item.uom, packSize,
    poCost: po.cost, unitCost, billedPrice, margin,
    poDate: po.date, vendor: po.vendor
  });
}

// Sort by revenue impact (billedPrice * volume would be better but use price for now)
results.sort((a, b) => Math.abs(b.billedPrice) - Math.abs(a.billedPrice));

// Show top 50 by billed price
let sane = 0, insane = 0;
for (const r of results.slice(0, 50)) {
  const marginStr = r.margin !== null ? r.margin.toFixed(1) + '%' : 'N/A';
  const flag = r.margin !== null && (r.margin < 0 || r.margin > 98) ? ' ⚠️' : '';
  if (r.margin !== null && r.margin >= 0 && r.margin <= 98) sane++;
  else insane++;
  console.log(
    r.code.padEnd(13) +
    r.name.substring(0,41).padEnd(42) +
    (r.uom||'?').padEnd(8) +
    String(r.packSize).padEnd(6) +
    ('$'+r.poCost.toFixed(2)).padEnd(10) +
    ('$'+r.unitCost.toFixed(4)).padEnd(11) +
    ('$'+r.billedPrice.toFixed(2)).padEnd(10) +
    marginStr + flag
  );
}

console.log(`\n--- Sanity check on ALL ${results.length} matched items ---`);
let allSane = 0, allInsane = 0, negative = 0, over98 = 0;
for (const r of results) {
  if (r.margin === null) continue;
  if (r.margin < 0) { negative++; allInsane++; }
  else if (r.margin > 98) { over98++; allInsane++; }
  else allSane++;
}
console.log(`  Sane margins (0-98%): ${allSane} items`);
console.log(`  Negative margin (selling below cost): ${negative} items`);
console.log(`  Suspiciously high (>98%): ${over98} items`);
console.log(`  Total: ${results.length} items with both PO and billing data`);

// Show the negative margin ones — might reveal remaining issues
if (negative > 0) {
  console.log('\nNegative margin items (possible pack_size still wrong):');
  results.filter(r => r.margin < 0).slice(0, 20).forEach(r => {
    console.log(`  ${r.code.padEnd(13)} ${r.name.substring(0,40).padEnd(41)} pack=${r.packSize} po=$${r.poCost.toFixed(2)} unit=$${r.unitCost.toFixed(4)} billed=$${r.billedPrice.toFixed(2)} margin=${r.margin.toFixed(1)}%`);
  });
}

if (over98 > 0) {
  console.log('\n>98% margin items (pack_size might be too large, or very low-cost bulk items):');
  results.filter(r => r.margin > 98).slice(0, 20).forEach(r => {
    console.log(`  ${r.code.padEnd(13)} ${r.name.substring(0,40).padEnd(41)} pack=${r.packSize} po=$${r.poCost.toFixed(2)} unit=$${r.unitCost.toFixed(4)} billed=$${r.billedPrice.toFixed(2)} margin=${r.margin.toFixed(1)}%`);
  });
}
