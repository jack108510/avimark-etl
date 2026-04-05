/**
 * cogs_daily.js
 * COGS for a specific day using USAGE.V2$ (actual inventory consumed)
 * cross-referenced with item unit costs from PO.
 */

import fs from 'fs';
import 'dotenv/config';

const dataDir = 'C:\\AVImark';
const DELPHI = new Date(1899, 11, 30).getTime();
const TARGET_DATE = '2026-01-07';

function readFile(name) {
  const fd = fs.openSync(`${dataDir}\\${name}`, 'r');
  const stat = fs.fstatSync(fd);
  const buf = Buffer.alloc(stat.size);
  fs.readSync(fd, buf, 0, stat.size, 0);
  fs.closeSync(fd);
  return buf;
}

function delphiToDate(v) {
  if (v < 35000 || v > 47000) return null;
  try { return new Date(DELPHI + v * 86400000).toISOString().split('T')[0]; }
  catch (e) { return null; }
}

// ── Items: code, name, uom, pack_size ────────────────────────────────────────
const itemBuf = readFile('ITEM.V2$');
const ITEM_REC = 549;
const itemByRec = {};
const itemByCode = {};
for (let i = 0; i < Math.floor(itemBuf.length / ITEM_REC); i++) {
  const b = itemBuf.subarray(i * ITEM_REC, (i + 1) * ITEM_REC);
  const len = b[40]; if (!len || len > 10) continue;
  const code = b.toString('ascii', 41, 41 + len).replace(/[^\x20-\x7E]/g, '').trim();
  if (!code) continue;
  const nl = b[51] || 0;
  const name = nl > 0 ? b.toString('ascii', 52, 52 + nl).replace(/[^\x20-\x7E]/g, '').trim() : '';
  const uom = (() => {
    const ul = b[123]; if (!ul || ul > 20) return null;
    const s = b.toString('ascii', 124, 124 + ul);
    return /^[\x20-\x7E]+$/.test(s) ? s.trim() : null;
  })();
  const pack = b.readInt16LE(154) || 1;
  itemByRec[i] = { code, name, uom, pack };
  itemByCode[code] = { rec: i, name, uom, pack };
}

// ── PO: item code → most recent unit cost ────────────────────────────────────
const poBuf = readFile('PO.V2$');
const latestPO = {};
let curDate = null;
for (let i = 0; i < Math.floor(poBuf.length / 64); i++) {
  const b = poBuf.subarray(i * 64, (i + 1) * 64);
  const v = b.readDoubleLE(21);
  const flags = b[29];
  let date = null;
  if (v > 35000 && v < 47000) date = delphiToDate(v);
  if (date && flags !== 62 && flags !== 121) { curDate = date; continue; }
  const cl = Math.min(b[12] || 0, 14);
  const code = cl > 0 ? b.toString('ascii', 13, 13 + cl).replace(/[^\x20-\x7E]/g, '').trim() : '';
  const raw = b.readInt32LE(32);
  const cost = raw > 0 ? Math.round(raw / 100) / 100 : 0;
  const qs = b.toString('ascii', 0, 12).replace(/[^\x20-\x7E]/g, '').trim();
  const qty = parseInt(qs) || 0;
  if (code && qty > 0 && qty <= 5000 && cost > 0 && cost <= 3000 && curDate) {
    if (!latestPO[code] || curDate > latestPO[code].date) {
      latestPO[code] = { date: curDate, cost };
    }
  }
}

// Build unit cost map
const unitCost = {};
for (const [code, po] of Object.entries(latestPO)) {
  const item = itemByCode[code];
  if (!item) continue;
  unitCost[code] = po.cost / item.pack;
}

// ── USAGE.V2$: decode all records, find TARGET_DATE ──────────────────────────
// recSize=117, structure from earlier analysis:
// @21 = TDateTime (date)
// @66 = Pascal string (item code, len byte + chars)
// Need to find the qty field - scan for it

const usageBuf = readFile('USAGE.V2$');
const USAGE_REC = 117;
const usageCount = Math.floor(usageBuf.length / USAGE_REC);

// First: find the qty field by looking at records where we know the item
// and cross-referencing with billing quantities
// From earlier: @44=2, @46=varies, @48=varies...
// Let's decode all fields for TARGET_DATE records

const targetRecs = [];
for (let i = 0; i < usageCount; i++) {
  const b = usageBuf.subarray(i * USAGE_REC, (i + 1) * USAGE_REC);
  const v = b.readDoubleLE(21);
  const date = delphiToDate(v);
  if (date !== TARGET_DATE) continue;

  // Item code at @66 (Pascal)
  let itemCode = null;
  for (let off = 62; off < 76; off++) {
    const sl = b[off];
    if (sl >= 2 && sl <= 12 && off + 1 + sl < USAGE_REC) {
      const s = b.toString('ascii', off + 1, off + 1 + sl).replace(/[^\x20-\x7E]/g, '');
      if (s && itemByCode[s]) { itemCode = s; break; }
    }
  }

  // All non-zero int16/int32 values for qty candidates
  const fields = {};
  for (let off = 40; off < 90; off += 4) {
    const v32 = b.readInt32LE(off);
    if (v32 > 0 && v32 < 100000) fields[off] = v32;
  }
  for (let off = 40; off < 90; off += 2) {
    const v16 = b.readInt16LE(off);
    if (v16 > 0 && v16 < 10000 && !fields[off]) fields[off] = v16;
  }

  targetRecs.push({ rec: i, date, itemCode, fields });
}

console.log(`USAGE records for ${TARGET_DATE}: ${targetRecs.length}`);
console.log('');

// Print all records to find the qty field
console.log('Sample records (looking for qty field):');
targetRecs.slice(0, 20).forEach(r => {
  const item = r.itemCode ? itemByCode[r.itemCode] : null;
  const fieldStr = Object.entries(r.fields).map(([k, v]) => `@${k}=${v}`).join(' ');
  console.log(`  ${r.itemCode || '?'.padEnd(10)}  ${(item?.name || '(no match)').substring(0, 30).padEnd(31)}  ${fieldStr}`);
});

// ── Qty field analysis ───────────────────────────────────────────────────────
// Look at the raw hex for first 5 target records to find qty
console.log('\nRaw hex for first 5 target records:');
const targetFirst5 = targetRecs.filter(r => r.itemCode).slice(0, 5);
targetFirst5.forEach(r => {
  const b = usageBuf.subarray(r.rec * USAGE_REC, (r.rec + 1) * USAGE_REC);
  const item = itemByCode[r.itemCode];
  console.log(`\n  ${r.itemCode} "${item?.name}"`);
  for (let j = 40; j < 90; j += 16) {
    const chunk = b.subarray(j, Math.min(j + 16, USAGE_REC));
    const hex = Array.from(chunk).map(x => x.toString(16).padStart(2, '0')).join(' ');
    const asc = Array.from(chunk).map(x => (x >= 32 && x <= 126) ? String.fromCharCode(x) : '.').join('');
    console.log(`    @${j}: ${hex.padEnd(47)}  ${asc}`);
  }
});

// ── Try known quantity offsets from USAGE structure ──────────────────────────
// Cross-check: compare usage qty with billing qty for same item+date from Supabase
// The field @44 is consistently "2" (looks like a type/status byte)
// @46 and @48 vary. Let's look at int32 at @40 and @44

console.log('\n\nQty candidates across all target records:');
const qtyOffsets = [40, 44, 48, 52, 56, 60];
const offsetSums = {};
qtyOffsets.forEach(o => { offsetSums[o] = 0; });

targetRecs.filter(r => r.itemCode).forEach(r => {
  const b = usageBuf.subarray(r.rec * USAGE_REC, (r.rec + 1) * USAGE_REC);
  qtyOffsets.forEach(o => {
    const v = b.readInt32LE(o);
    if (v > 0 && v < 10000) offsetSums[o] += v;
  });
});

qtyOffsets.forEach(o => {
  console.log(`  @${o} sum = ${offsetSums[o]}`);
});

// ── Best guess at qty field: try to validate against billing ─────────────────
// Group usage by item code, sum qty at each offset
const usageByItem = {};
targetRecs.filter(r => r.itemCode).forEach(r => {
  const b = usageBuf.subarray(r.rec * USAGE_REC, (r.rec + 1) * USAGE_REC);
  if (!usageByItem[r.itemCode]) usageByItem[r.itemCode] = { recs: 0, sums: {} };
  usageByItem[r.itemCode].recs++;
  qtyOffsets.forEach(o => {
    const v = b.readInt32LE(o);
    usageByItem[r.itemCode].sums[o] = (usageByItem[r.itemCode].sums[o] || 0) + v;
  });
});

console.log(`\nItems consumed on ${TARGET_DATE}: ${Object.keys(usageByItem).length}`);

// Use @48 as qty (most variable, non-constant field from earlier analysis)
// Actually let's use all offsets and pick the one that gives most sensible totals
// For now use the field with smallest non-zero values (most likely actual unit qty)

// Print COGS using each candidate qty field
for (const qtyOff of [48, 52, 56, 60]) {
  let totalCOGS = 0;
  let covered = 0;
  for (const [code, data] of Object.entries(usageByItem)) {
    const uc = unitCost[code];
    const qty = data.sums[qtyOff] || 0;
    if (uc && qty > 0 && qty < 10000) {
      totalCOGS += uc * qty;
      covered++;
    }
  }
  console.log(`  @${qtyOff} as qty: COGS=$${totalCOGS.toFixed(2)} (${covered} items)`);
}

// ── Final COGS report using best qty field ───────────────────────────────────
// Use @48 as tentative qty field
const QTY_OFFSET = 48;

console.log(`\n\n=== RETAIL/DRUG/FOOD COGS — ${TARGET_DATE} ===\n`);
console.log('Item Code'.padEnd(14) + 'Name'.padEnd(38) + 'UOM'.padEnd(8) + 'Qty'.padEnd(6) + 'Unit$'.padEnd(10) + 'COGS');
console.log('-'.repeat(90));

const cogsRows = [];
let totalCOGS = 0;
let noCost = [];

for (const [code, data] of Object.entries(usageByItem)) {
  const b = usageBuf.subarray(targetRecs.find(r => r.itemCode === code)?.rec * USAGE_REC || 0, 0 + USAGE_REC);
  const item = itemByCode[code];
  if (!item) continue;

  // Sum qty across all records for this item on this date
  let qty = 0;
  targetRecs.filter(r => r.itemCode === code).forEach(r => {
    const rb = usageBuf.subarray(r.rec * USAGE_REC, (r.rec + 1) * USAGE_REC);
    const v = rb.readInt32LE(QTY_OFFSET);
    if (v > 0 && v < 10000) qty += v;
  });

  const uc = unitCost[code];
  if (!uc || qty <= 0) {
    noCost.push({ code, name: item.name, uom: item.uom, qty });
    continue;
  }

  const cogs = uc * qty;
  totalCOGS += cogs;
  cogsRows.push({ code, name: item.name, uom: item.uom, qty, unitCost: uc, cogs });
}

cogsRows.sort((a, b) => b.cogs - a.cogs).forEach(r => {
  console.log(
    r.code.padEnd(14) +
    r.name.substring(0, 37).padEnd(38) +
    (r.uom || '?').padEnd(8) +
    String(r.qty).padEnd(6) +
    ('$' + r.unitCost.toFixed(3)).padEnd(10) +
    '$' + r.cogs.toFixed(2)
  );
});

console.log('\n' + '-'.repeat(90));
console.log(`TOTAL COGS (${TARGET_DATE}): $${totalCOGS.toFixed(2)}`);
console.log(`Items with cost: ${cogsRows.length}   Items without PO cost: ${noCost.length}`);

if (noCost.length > 0) {
  console.log('\nItems consumed but no PO unit cost (excluded):');
  noCost.slice(0, 15).forEach(r => {
    console.log(`  ${r.code.padEnd(12)} ${r.name.substring(0, 35).padEnd(36)} qty=${r.qty}`);
  });
}
