/**
 * packsize_decode.js
 * 
 * Focused hunt for pack size / units-per-package.
 * 
 * Hypotheses to test:
 * 1. ITEM.V2$ @154 (int16) = pack size for unit-dispensed items
 * 2. USAGE.V2$ has item codes + qty data that could confirm pack sizes
 * 3. VARIANCE.V2$ might have on-hand qty data useful for cross-check
 */

import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

function readFileCopy(name) {
  // Read from live file (Avimark keeps files open, use direct read)
  try {
    const fd = fs.openSync(`${dataDir}\\${name}`, 'r');
    const stat = fs.fstatSync(fd);
    const buf = Buffer.alloc(stat.size);
    fs.readSync(fd, buf, 0, stat.size, 0);
    fs.closeSync(fd);
    return buf;
  } catch(e) {
    console.log(`  Could not read ${name}: ${e.message}`);
    return null;
  }
}

function extractPascal(buf, offset, maxLen = 40) {
  if (offset >= buf.length) return '';
  const len = buf[offset];
  if (len === 0 || len > maxLen || offset + 1 + len > buf.length) return '';
  const s = buf.toString('ascii', offset + 1, offset + 1 + len);
  return /^[\x20-\x7E]+$/.test(s) ? s.trim() : '';
}

// ============================================================
// 1. Test ITEM.V2$ @154 as pack size
// ============================================================
console.log('=== HYPOTHESIS 1: ITEM.V2$ @154 = pack size ===\n');

const itemBuf = readFileCopy('ITEM.V2$');
const ITEM_REC = 549;
const itemCount = Math.floor(itemBuf.length / ITEM_REC);

const items = {};
const v154dist = {};

for (let i = 0; i < itemCount; i++) {
  const b = itemBuf.subarray(i * ITEM_REC, (i+1) * ITEM_REC);
  const code = extractPascal(b, 40, 10);
  if (!code) continue;
  const nameLen = b[51] || 0;
  const name = nameLen > 0 ? b.toString('ascii', 52, 52+nameLen).replace(/[^\x20-\x7E]/g, '').trim() : '';
  if (!name) continue;
  const uom = extractPascal(b, 123, 20);
  
  // All numeric candidates for pack size
  const v150 = b.readInt16LE(150);
  const v154 = b.readInt16LE(154);
  const v156 = b.readInt16LE(156);
  const v158 = b.readInt16LE(158);
  const v160 = b.readInt16LE(160);
  const v162 = b.readInt16LE(162);
  
  // Also check 4-byte values
  const v144 = b.readInt32LE(144);
  const v148 = b.readInt32LE(148);
  const v152 = b.readInt32LE(152);
  
  v154dist[v154] = (v154dist[v154] || 0) + 1;
  
  items[code] = { code, name, uom, v150, v154, v156, v158, v160, v162, v144, v148, v152 };
}

console.log(`Total items parsed: ${Object.keys(items).length}`);
console.log('\nDistribution of @154 values (top 20):');
Object.entries(v154dist)
  .sort((a,b) => b[1]-a[1])
  .slice(0, 20)
  .forEach(([v, cnt]) => console.log(`  v154=${String(v).padStart(6)}: ${cnt} items`));

// Show items where v154 > 1 — these are candidates for actual pack size
console.log('\nItems with v154 > 1 (likely pack size):');
Object.values(items)
  .filter(x => x.v154 > 1 && x.v154 < 10000)
  .sort((a,b) => b.v154 - a.v154)
  .slice(0, 40)
  .forEach(x => {
    console.log(`  ${x.code.padEnd(12)} ${x.name.substring(0,45).padEnd(46)} UOM=${String(x.uom||'').padEnd(10)} @154=${x.v154}`);
  });

// ============================================================
// 2. USAGE.V2$ — decode item + qty fields
// ============================================================
console.log('\n\n=== USAGE.V2$ — Item + Qty decode ===\n');

const usageBuf = readFileCopy('USAGE.V2$');
if (!usageBuf) {
  console.log('Skipping USAGE.V2$');
} else {
  // From earlier: recSize=117 gives 95,039 records
  // Bytes visible: item code at @67 (Pascal), qty-like fields at @46 and @51
  // `A` at @45, `d` (100) at @46...
  const USAGE_REC = 117;
  const usageCount = Math.floor(usageBuf.length / USAGE_REC);
  console.log(`USAGE records: ${usageCount} (recSize=117)`);
  
  // Full decode of first 5 records
  console.log('\nFull decode first 5 records:');
  for (let i = 0; i < 5; i++) {
    const b = usageBuf.subarray(i * USAGE_REC, (i+1) * USAGE_REC);
    const hex = Array.from(b).map(x => x.toString(16).padStart(2,'0')).join(' ');
    const ascii = Array.from(b).map(x => (x>=32&&x<=126)?String.fromCharCode(x):'.').join('');
    console.log(`\nRecord ${i}:`);
    // Break into 16-byte lines
    for (let j = 0; j < USAGE_REC; j += 16) {
      const chunk = b.subarray(j, Math.min(j+16, USAGE_REC));
      const h = Array.from(chunk).map(x => x.toString(16).padStart(2,'0')).join(' ');
      const a = Array.from(chunk).map(x => (x>=32&&x<=126)?String.fromCharCode(x):'.').join('');
      console.log(`  @${String(j).padStart(3)}: ${h.padEnd(47)}  ${a}`);
    }
    
    // TDateTime scan
    for (let off = 0; off + 8 <= USAGE_REC; off++) {
      const v = b.readDoubleBE ? null : null;
      try {
        const vle = b.readDoubleLE(off);
        if (vle > 35000 && vle < 47000) {
          const d = new Date(DELPHI_EPOCH + vle * 86400000).toISOString().split('T')[0];
          console.log(`  Date @${off}: ${d}`);
        }
      } catch(e) {}
    }
    
    // Non-zero int32 scan
    const nonzero = [];
    for (let off = 0; off < USAGE_REC - 3; off += 4) {
      const v = b.readInt32LE(off);
      if (v > 0 && v < 1000000) nonzero.push(`@${off}=${v}`);
    }
    if (nonzero.length) console.log(`  Non-zero int32: ${nonzero.join(', ')}`);
    
    // Pascal strings
    for (let off = 0; off < USAGE_REC - 2; off++) {
      const len = b[off];
      if (len >= 3 && len <= 15 && off + 1 + len < USAGE_REC) {
        const s = b.toString('ascii', off+1, off+1+len);
        if (/^[A-Z0-9a-z ]{3,}$/.test(s)) console.log(`  Pascal @${off} len=${len}: "${s}"`);
      }
    }
  }
  
  // Now extract all USAGE records: item code + all numeric fields
  // Build: itemCode → [{qty at various offsets}]
  console.log('\n\nBuilding USAGE item→qty map...');
  const usageByItem = {};
  
  for (let i = 0; i < usageCount; i++) {
    const b = usageBuf.subarray(i * USAGE_REC, (i+1) * USAGE_REC);
    
    // Item code - scan all Pascal strings
    let itemCode = null;
    for (let off = 60; off < 80; off++) {
      const s = extractPascal(b, off, 12);
      if (s && /^[A-Z0-9]{3,10}$/.test(s) && items[s]) {
        itemCode = s;
        break;
      }
    }
    
    if (!itemCode) continue;
    
    // Pull all int32 values that look like quantities (1-99999)
    const qtys = {};
    for (let off = 40; off < USAGE_REC - 3; off += 4) {
      const v = b.readInt32LE(off);
      if (v > 0 && v < 100000) qtys[off] = v;
    }
    
    if (!usageByItem[itemCode]) usageByItem[itemCode] = [];
    usageByItem[itemCode].push(qtys);
  }
  
  console.log(`Items found in USAGE: ${Object.keys(usageByItem).length}`);
  
  // For items we know pack size (from description), check if any offset matches
  const knownPacks = {
    '1023': 30, // Zonisamide 25mg - if v154=30 is correct
    '1113': 30, // Zonisamide 50mg
  };
  
  console.log('\nUSAGE entries for known items (looking for pack-size number):');
  for (const [code, expectedPack] of Object.entries(knownPacks)) {
    const entries = usageByItem[code] || [];
    const item = items[code];
    if (!item) continue;
    console.log(`\n  ${code} "${item.name}" UOM=${item.uom} expected_pack=${expectedPack}`);
    entries.slice(0, 5).forEach((qtys, j) => {
      console.log(`    Entry ${j}: ${Object.entries(qtys).map(([k,v]) => `@${k}=${v}`).join(', ')}`);
    });
  }
  
  // Cross-ref USAGE with ITEM v154 hypothesis
  // For items where v154 > 1: do USAGE qty fields confirm?
  const packCandidates = Object.values(items).filter(x => x.v154 > 1 && x.v154 < 1000);
  console.log(`\n\nCross-ref: ${packCandidates.length} items with v154>1, checking USAGE...`);
  
  let confirmed = 0;
  let notInUsage = 0;
  for (const item of packCandidates.slice(0, 30)) {
    const entries = usageByItem[item.code] || [];
    if (entries.length === 0) { notInUsage++; continue; }
    const matches = entries.filter(e => Object.values(e).includes(item.v154));
    if (matches.length > 0) confirmed++;
    console.log(`  ${item.code.padEnd(12)} ${item.name.substring(0,35).padEnd(36)} v154=${item.v154} UOM=${item.uom||''}`);
    console.log(`    USAGE entries: ${entries.length}, matches v154: ${matches.length}`);
  }
}

// ============================================================
// 3. VARIANCE.V2$ — on-hand qty, might confirm pack sizes
// ============================================================
console.log('\n\n=== VARIANCE.V2$ — Quick look ===\n');
const varBuf = readFileCopy('VARIANCE.V2$');
if (!varBuf) {
  console.log('Not available');
} else {
  console.log(`Size: ${varBuf.length} bytes`);
  const cleanV = [];
  for (let s = 20; s <= 200; s++) {
    if (varBuf.length % s === 0) cleanV.push(`${s}→${varBuf.length/s}`);
  }
  console.log('Clean sizes:', cleanV.join(', '));
  
  console.log('\nFirst 200 bytes:');
  for (let i = 0; i < Math.min(200, varBuf.length); i += 16) {
    const chunk = varBuf.subarray(i, i+16);
    const h = Array.from(chunk).map(x => x.toString(16).padStart(2,'0')).join(' ');
    const a = Array.from(chunk).map(x => (x>=32&&x<=126)?String.fromCharCode(x):'.').join('');
    console.log(`  @${String(i).padStart(3)}: ${h.padEnd(47)}  ${a}`);
  }
}
