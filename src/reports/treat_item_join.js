/**
 * treat_item_join.js
 * Find the treatment-to-item mapping.
 * TREAT.V2$ has service codes. TREATX.V2$ is a cross-ref.
 * v98 in ITEM.V2$ may be a back-pointer to TREAT record number.
 */

import fs from 'fs';

function pascal(b, off, max = 40) {
  const len = b[off];
  if (!len || len > max) return '';
  const s = b.toString('ascii', off + 1, off + 1 + len);
  return /^[\x20-\x7E]+$/.test(s) ? s.trim() : '';
}

const dataDir = 'C:\\AVImark';

// Load items by record number and by code
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
  const v98 = b.readInt16LE(98);
  const pack = b.readInt16LE(154) || 1;
  const uom = pascal(b, 123, 20);
  itemByRec[i] = { code, name, v98, pack, uom };
  itemByCode[code] = { rec: i, name, v98, pack, uom };
}
console.log('Items loaded:', Object.keys(itemByCode).length);

// Load TREAT.V2$ — 181 bytes/rec
const treatFd = fs.openSync(dataDir + '\\TREAT.V2$', 'r');
const treatStat = fs.fstatSync(treatFd);
const TREAT_REC = 181;
const treatBuf = Buffer.alloc(treatStat.size);
fs.readSync(treatFd, treatBuf, 0, treatStat.size, 0);
fs.closeSync(treatFd);
const treatCount = Math.floor(treatStat.size / TREAT_REC);
console.log('TREAT records:', treatCount);

// Build treat by record number and by service code
const treatByRec = {};
const treatByCode = {};
for (let i = 0; i < treatCount; i++) {
  const b = treatBuf.subarray(i * TREAT_REC, (i + 1) * TREAT_REC);
  const code = pascal(b, 40, 10);
  if (!code) continue;
  treatByRec[i] = code;
  treatByCode[code] = i;
}
console.log('TREAT service codes:', Object.keys(treatByCode).length);

// === HYPOTHESIS: ITEM.v98 = TREAT record number ===
// If true: item.v98 → treat record → service code
// This means each item knows which treatment it belongs to
console.log('\n=== HYPOTHESIS: ITEM.v98 = TREAT record number ===');
let v98Hits = 0;
const itemToTreat = {};
for (const [code, item] of Object.entries(itemByCode)) {
  const treatCode = treatByRec[item.v98];
  if (treatCode) {
    itemToTreat[code] = treatCode;
    if (v98Hits < 25) {
      console.log('  item ' + code.padEnd(12) + item.name.substring(0, 35).padEnd(36) +
        ' v98=' + String(item.v98).padStart(5) + ' -> TREAT ' + treatCode);
    }
    v98Hits++;
  }
}
console.log('Total item->treat matches via v98:', v98Hits);

// === Now invert: treat service code -> item codes ===
const treatToItems = {};
for (const [itemCode, svcCode] of Object.entries(itemToTreat)) {
  if (!treatToItems[svcCode]) treatToItems[svcCode] = [];
  treatToItems[svcCode].push(itemCode);
}

console.log('\nService codes with mapped items:', Object.keys(treatToItems).length);
console.log('\nSample mappings (svc -> items):');
Object.entries(treatToItems).slice(0, 30).forEach(([svc, items]) => {
  items.forEach(ic => {
    const item = itemByCode[ic];
    console.log('  ' + svc.padEnd(14) + '-> ' + ic.padEnd(12) + item.name.substring(0, 40));
  });
});

// === TREATX.V2$ decode ===
console.log('\n\n=== TREATX.V2$ — 79 bytes/rec, 3641 records ===');
const txFd = fs.openSync(dataDir + '\\TREATX.V2$', 'r');
const txStat = fs.fstatSync(txFd);
const TX_REC = 79;
const txBuf = Buffer.alloc(txStat.size);
fs.readSync(txFd, txBuf, 0, txStat.size, 0);
fs.closeSync(txFd);
const txCount = Math.floor(txStat.size / TX_REC);

// Dump first 20 records in detail
console.log('First 20 records:');
for (let i = 0; i < 20; i++) {
  const b = txBuf.subarray(i * TX_REC, (i + 1) * TX_REC);

  // All non-zero int32 values
  const int32s = [];
  for (let off = 0; off < TX_REC - 3; off += 4) {
    const v = b.readInt32LE(off);
    if (v > 0 && v < 100000) int32s.push('@' + off + '=' + v);
  }

  // All int16 values
  const int16s = [];
  for (let off = 32; off < TX_REC - 1; off += 2) {
    const v = b.readInt16LE(off);
    if (v > 0 && v < 10000) int16s.push('@' + off + '=' + v);
  }

  // Pascal strings
  const strs = [];
  for (let off = 0; off < TX_REC - 2; off++) {
    const s = pascal(b, off, 15);
    if (s && s.length >= 3) strs.push('@' + off + '=[' + s + ']');
  }

  const ascii = Array.from(b).map(x => (x >= 32 && x <= 126) ? String.fromCharCode(x) : '.').join('');
  console.log('  TX[' + i + ']: ' + ascii.substring(0, 60));
  if (int32s.length) console.log('    int32: ' + int32s.join(' '));
  if (strs.length) console.log('    strs:  ' + strs.join(' '));
}

// Check if TREATX int32 fields point to TREAT or ITEM records
console.log('\nTREATX — checking as treat_rec + item_rec pointer pairs:');
let txJoins = 0;
for (let i = 0; i < txCount; i++) {
  const b = txBuf.subarray(i * TX_REC, (i + 1) * TX_REC);

  // Try pairs of int32 values as (treat_rec, item_rec)
  for (let off = 32; off < TX_REC - 7; off += 4) {
    const v1 = b.readInt32LE(off);
    const v2 = b.readInt32LE(off + 4);
    const treatCode = treatByRec[v1];
    const item = itemByRec[v2];
    if (treatCode && item && v2 > 0) {
      console.log('  TX[' + i + '] @' + off + ': treat_rec=' + v1 + '->' + treatCode +
        '  item_rec=' + v2 + '->' + item.code + ' "' + item.name.substring(0, 30) + '"');
      txJoins++;
      if (txJoins >= 30) break;
    }
  }
  if (txJoins >= 30) break;
}
if (txJoins === 0) console.log('  No (treat_rec, item_rec) pairs found in TREATX');

// Try TREATX as just item pointers — check every int32
console.log('\nTREATX — all int32s that match item record numbers:');
const txItemRefs = {};
for (let i = 0; i < txCount; i++) {
  const b = txBuf.subarray(i * TX_REC, (i + 1) * TX_REC);
  for (let off = 0; off < TX_REC - 3; off += 4) {
    const v = b.readInt32LE(off);
    if (v > 0 && v < 5100 && itemByRec[v]) {
      if (!txItemRefs[i]) txItemRefs[i] = [];
      txItemRefs[i].push({ off, itemRec: v, item: itemByRec[v] });
    }
  }
}
const txWithItems = Object.keys(txItemRefs).length;
console.log('TREATX records with item record refs:', txWithItems);
if (txWithItems > 0) {
  Object.entries(txItemRefs).slice(0, 15).forEach(([txRec, refs]) => {
    refs.forEach(r => {
      console.log('  TX[' + txRec + '] @' + r.off + ' -> item ' + r.item.code + ' "' + r.item.name.substring(0, 35) + '"');
    });
  });
}
