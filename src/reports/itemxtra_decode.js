/**
 * itemxtra_decode.js
 * 
 * Goal: Find pack size / units-per-package for inventory items.
 * 
 * Strategy:
 * 1. Decode ITEM.V2$ fully (code, name, UOM @123)
 * 2. Try ITEMXTRA.V2$ — variable-length records or encrypted? Try to find structure.
 * 3. Try DRUG.V2$ — drug-specific packaging data
 * 4. Cross-reference PO line items: for items sold by TAB, find PO qty vs charge qty
 *    — if we charged 100 tabs and PO qty=1 (bottle), implied pack=100
 */

import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

function readFile(name) {
  try {
    return fs.readFileSync(`${dataDir}\\${name}`);
  } catch(e) {
    return null;
  }
}

function extractPascalString(buf, offset, maxLen = 40) {
  if (offset >= buf.length) return '';
  const len = buf[offset];
  if (len === 0 || len > maxLen || offset + 1 + len > buf.length) return '';
  const s = buf.toString('ascii', offset + 1, offset + 1 + len);
  if (!/^[\x20-\x7E]+$/.test(s)) return '';
  return s.trim();
}

// ============================================================
// 1. ITEM.V2$ — decode all items with UOM
// ============================================================
console.log('=== ITEM.V2$ — All items with UOM ===\n');

const itemBuf = readFile('ITEM.V2$');
const ITEM_REC = 549;
const itemCount = Math.floor(itemBuf.length / ITEM_REC);

const items = {};
let uomMissing = 0;
let uomPresent = 0;

for (let i = 0; i < itemCount; i++) {
  const b = itemBuf.subarray(i * ITEM_REC, (i + 1) * ITEM_REC);
  
  const code = extractPascalString(b, 40, 10);
  if (!code) continue;
  
  const nameLen = b[51] || 0;
  const name = nameLen > 0 && nameLen < 80
    ? b.toString('ascii', 52, 52 + nameLen).replace(/[^\x20-\x7E]/g, '').trim()
    : '';
  if (!name) continue;
  
  // UOM at @123 (Pascal string)
  const uom = extractPascalString(b, 123, 20);
  
  // Check for numeric fields that might be pack size
  // @96 int16, @150 int16, @154 int16
  const v96 = b.readInt16LE(96);
  const v98 = b.readInt16LE(98);
  const v150 = b.readInt16LE(150);
  const v154 = b.readInt16LE(154);
  
  if (uom) uomPresent++; else uomMissing++;
  
  items[code] = { code, name, uom, v96, v98, v150, v154 };
}

console.log(`Total items: ${Object.keys(items).length}, with UOM: ${uomPresent}, without: ${uomMissing}`);

// Show sample with UOM
const withUom = Object.values(items).filter(x => x.uom);
console.log('\nSample items with UOM:');
withUom.slice(0, 20).forEach(x => {
  console.log(`  ${x.code.padEnd(12)} ${x.name.substring(0,45).padEnd(46)} UOM=${x.uom.padEnd(8)} v96=${x.v96} v98=${x.v98} v150=${x.v150} v154=${x.v154}`);
});

// ============================================================
// 2. ITEMXTRA.V2$ — try to find structure
// ============================================================
console.log('\n\n=== ITEMXTRA.V2$ — Structure Analysis ===\n');

const ixBuf = readFile('ITEMXTRA.V2$');
console.log(`Size: ${ixBuf.length} bytes`);

// Test all record sizes 30-400
const cleanSizes = [];
for (let s = 30; s <= 400; s++) {
  if (ixBuf.length % s === 0) {
    cleanSizes.push({ size: s, count: ixBuf.length / s });
  }
}
console.log('Clean record sizes:', cleanSizes.map(x => `${x.size}→${x.count}`).join(', '));

// ITEMXTRA appears to not divide cleanly — might be variable-length
// Try to find item codes embedded in the file
console.log('\nSearching ITEMXTRA for item codes...');
const itemCodes = new Set(Object.keys(items));
const foundCodes = [];

// Scan every byte looking for Pascal strings that match item codes
for (let offset = 0; offset < Math.min(ixBuf.length - 50, 50000); offset++) {
  const len = ixBuf[offset];
  if (len >= 3 && len <= 10 && offset + 1 + len < ixBuf.length) {
    const s = ixBuf.toString('ascii', offset + 1, offset + 1 + len);
    if (/^[A-Z0-9]{3,10}$/.test(s) && itemCodes.has(s)) {
      // Found a matching item code — look at surrounding bytes
      const surrounding = [];
      for (let j = Math.max(0, offset - 4); j < Math.min(ixBuf.length, offset + len + 1 + 30); j++) {
        const c = ixBuf[j];
        surrounding.push((c >= 32 && c <= 126) ? String.fromCharCode(c) : '.');
      }
      foundCodes.push({ offset, code: s, ctx: surrounding.join('') });
    }
  }
}

if (foundCodes.length > 0) {
  console.log(`Found ${foundCodes.length} item code matches in first 50KB:`);
  foundCodes.slice(0, 20).forEach(x => {
    console.log(`  @${x.offset}: code="${x.code}" context: ${x.ctx}`);
  });
  
  // Find spacing between matches to infer record size
  if (foundCodes.length > 2) {
    const gaps = [];
    for (let i = 1; i < foundCodes.length; i++) {
      gaps.push(foundCodes[i].offset - foundCodes[i-1].offset);
    }
    const gapCounts = {};
    gaps.forEach(g => { gapCounts[g] = (gapCounts[g] || 0) + 1; });
    const sortedGaps = Object.entries(gapCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
    console.log('\nMost common gaps between item codes (likely record size):');
    sortedGaps.forEach(([gap, cnt]) => console.log(`  gap=${gap} : ${cnt} times`));
  }
} else {
  console.log('No direct item code matches found in first 50KB of ITEMXTRA');
  
  // Dump first 5 potential-record chunks
  console.log('\nFirst 5 x 245-byte chunks:');
  for (let i = 0; i < 5; i++) {
    const chunk = ixBuf.subarray(i * 245, (i+1) * 245);
    const hex = Array.from(chunk.subarray(0, 48)).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const ascii = Array.from(chunk.subarray(0, 48)).map(b => (b>=32&&b<=126)?String.fromCharCode(b):'.').join('');
    console.log(`  Chunk ${i}: ${ascii}`);
  }
}

// ============================================================
// 3. DRUG.V2$ — look for pack sizes
// ============================================================
console.log('\n\n=== DRUG.V2$ — Structure Analysis ===\n');

const drugBuf = readFile('DRUG.V2$');
if (!drugBuf) {
  console.log('DRUG.V2$ not found');
} else {
  console.log(`Size: ${drugBuf.length} bytes`);
  const drugClean = [];
  for (let s = 30; s <= 400; s++) {
    if (drugBuf.length % s === 0) drugClean.push({ size: s, count: drugBuf.length / s });
  }
  console.log('Clean sizes:', drugClean.map(x => `${x.size}→${x.count}`).join(', '));
  
  // Dump first 400 bytes
  console.log('\nFirst 400 bytes:');
  for (let i = 0; i < Math.min(400, drugBuf.length); i += 16) {
    const chunk = drugBuf.subarray(i, i + 16);
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const ascii = Array.from(chunk).map(b => (b>=32&&b<=126)?String.fromCharCode(b):'.').join('');
    console.log(`  @${String(i).padStart(3)}: ${hex.padEnd(47)}  ${ascii}`);
  }
}

// ============================================================
// 4. USAGE.V2$ — inventory usage, may have pack/UOM info
// ============================================================
console.log('\n\n=== USAGE.V2$ — Structure Analysis ===\n');

const usageBuf = readFile('USAGE.V2$');
if (!usageBuf) {
  console.log('USAGE.V2$ not found');
} else {
  console.log(`Size: ${usageBuf.length} bytes`);
  const usageClean = [];
  for (let s = 20; s <= 300; s++) {
    if (usageBuf.length % s === 0) usageClean.push({ size: s, count: usageBuf.length / s });
  }
  console.log('Clean sizes:', usageClean.map(x => `${x.size}→${x.count}`).join(', '));
  
  console.log('\nFirst 400 bytes:');
  for (let i = 0; i < Math.min(400, usageBuf.length); i += 16) {
    const chunk = usageBuf.subarray(i, i + 16);
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2,'0')).join(' ');
    const ascii = Array.from(chunk).map(b => (b>=32&&b<=126)?String.fromCharCode(b):'.').join('');
    console.log(`  @${String(i).padStart(3)}: ${hex.padEnd(47)}  ${ascii}`);
  }
}

// ============================================================
// 5. ITEM.V2$ pack size cross-ref with PO
// For items with UOM=TAB/EA, compare PO qty (packages ordered)
// vs service charge count (tabs dispensed) to infer pack size
// ============================================================
console.log('\n\n=== PO Qty vs Charge qty inference ===\n');

const poBuf = readFile('PO.V2$');
const PO_REC = 64;
const poCount = Math.floor(poBuf.length / PO_REC);

// Build item → PO orders: { code: [{date, qty, cost}] }
const poByItem = {};
let currentDate = null;
let currentVendor = null;

for (let i = 0; i < poCount; i++) {
  const b = poBuf.subarray(i * PO_REC, (i+1) * PO_REC);
  const flags29 = b[29];
  
  // Try header
  let date = null;
  const v = b.readDoubleLE(21);
  if (v > 35000 && v < 47000) {
    try { date = new Date(DELPHI_EPOCH + v * 86400000).toISOString().split('T')[0]; } catch(e) {}
  }
  
  if (date && flags29 !== 62 && flags29 !== 121) {
    currentDate = date;
    const vlen = Math.min(b[56] || 0, 8);
    currentVendor = vlen > 0 ? b.toString('ascii', 57, 57 + vlen).replace(/[^\x20-\x7E]/g, '').trim() : '';
  } else {
    // Line item
    const qtyStr = b.toString('ascii', 0, 12).replace(/[^\x20-\x7E]/g, '').trim();
    const qty = parseInt(qtyStr) || 0;
    const codeLen = Math.min(b[13] || 0, 14);
    const code = codeLen > 0 ? b.toString('ascii', 14, 14 + codeLen).replace(/[^\x20-\x7E]/g, '').trim() : '';
    const rawCost = b.readInt32LE(32);
    const cost = rawCost > 0 ? Math.round(rawCost / 100) / 100 : 0;
    
    if (code && qty > 0 && currentDate) {
      if (!poByItem[code]) poByItem[code] = [];
      poByItem[code].push({ date: currentDate, qty, cost, vendor: currentVendor });
    }
  }
}

console.log(`PO line items by item code: ${Object.keys(poByItem).length} unique items`);

// For items with UOM = TAB, EA, EACH, UNIT — show PO qty and cost
// These are items where pack size matters most
const unitItems = Object.values(items).filter(x => 
  x.uom && /^(TAB|EA|EACH|UNIT|TABLET|CAP|CAPSULE)$/i.test(x.uom.trim())
);

console.log(`\nItems with unit-type UOM (TAB/EA/UNIT/CAP): ${unitItems.length}`);
console.log('\nSample — PO orders for unit-dispensed items:');

let shown = 0;
for (const item of unitItems) {
  const orders = poByItem[item.code];
  if (!orders || orders.length === 0) continue;
  
  // Most recent orders
  const recent = orders.slice(-3);
  console.log(`\n  ${item.code} "${item.name}" UOM=${item.uom}`);
  recent.forEach(o => {
    console.log(`    ${o.date}  qty=${o.qty}  cost=$${o.cost}  vendor=${o.vendor}`);
  });
  
  if (++shown >= 20) break;
}
