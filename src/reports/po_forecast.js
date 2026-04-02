import fs from 'fs';

const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();
const fd = fs.openSync(dataDir + '\\PO.V2$', 'r');
const stat = fs.statSync(dataDir + '\\PO.V2$');
const totalRecs = Math.floor(stat.size / 64);

// Read all records, pair headers with line items
const orders = []; // { date, vendor, poNum, item, qty, cost }

for (let i = 0; i < totalRecs - 1; i += 2) {
  const hBuf = Buffer.alloc(64);
  const lBuf = Buffer.alloc(64);
  fs.readSync(fd, hBuf, 0, 64, i * 64);
  fs.readSync(fd, lBuf, 0, 64, (i + 1) * 64);
  
  // Header: date @21, PO# @46, vendor @56
  let date = null;
  try {
    const v = hBuf.readDoubleLE(21);
    if (v > 35000 && v < 47000) {
      date = new Date(DELPHI_EPOCH + v * 86400000);
    }
  } catch(e) {}
  
  const poLen = Math.min(hBuf[46] || 0, 12);
  const poNum = poLen > 0 ? hBuf.toString('ascii', 47, 47 + poLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  const vendLen = Math.min(hBuf[56] || 0, 10);
  const vendor = vendLen > 0 ? hBuf.toString('ascii', 57, 57 + vendLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Line item: qty @9, code @12 (Pascal), cost @32 (/10000)
  const qty = lBuf[9] || 0;
  const codeLen = Math.min(lBuf[12] || 0, 14);
  const itemCode = codeLen > 0 ? lBuf.toString('ascii', 13, 13 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  const costRaw = lBuf.readInt32LE(32);
  const cost = costRaw / 10000;
  
  if (date && cost > 0) {
    orders.push({
      date,
      month: date.toISOString().substring(0, 7),
      vendor,
      poNum,
      itemCode,
      qty,
      cost,
    });
  }
}
fs.closeSync(fd);

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║   Inventory Spend Forecast — April 2026              ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
console.log(`Total PO line items with costs: ${orders.length}`);
console.log(`Date range: ${orders[0]?.date.toISOString().split('T')[0]} to ${orders[orders.length-1]?.date.toISOString().split('T')[0]}\n`);

// Monthly spend
const monthly = {};
for (const o of orders) {
  if (!monthly[o.month]) monthly[o.month] = { spend: 0, lines: 0, items: new Set() };
  monthly[o.month].spend += o.cost;
  monthly[o.month].lines++;
  monthly[o.month].items.add(o.itemCode);
}

const months = Object.keys(monthly).sort();
console.log('MONTHLY INVENTORY SPEND');
console.log('─'.repeat(65));
console.log(`${'Month'.padEnd(10)} ${'Lines'.padStart(6)} ${'Items'.padStart(6)} ${'Spend'.padStart(12)}`);
console.log('─'.repeat(65));

for (const m of months.slice(-24)) {
  const d = monthly[m];
  const bar = '█'.repeat(Math.min(30, Math.round(d.spend / 2000)));
  console.log(`${m.padEnd(10)} ${d.lines.toString().padStart(6)} ${d.items.size.toString().padStart(6)} ${('$' + d.spend.toFixed(2)).padStart(12)}  ${bar}`);
}

// Averages for forecast
const last12 = months.slice(-12).map(m => monthly[m].spend);
const last6 = months.slice(-6).map(m => monthly[m].spend);
const last3 = months.slice(-3).map(m => monthly[m].spend);
const aprilSpend = months.filter(m => m.endsWith('-04')).map(m => monthly[m].spend);

const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

const predicted = avg(last3) * 0.4 + avg(last6) * 0.3 + (aprilSpend.length ? avg(aprilSpend) : avg(last12)) * 0.2 + avg(last12) * 0.1;

console.log('\n\n═══════════════════════════════════════════════════');
console.log('  📊 APRIL 2026 PREDICTED INVENTORY SPEND');
console.log('═══════════════════════════════════════════════════\n');
console.log(`  Last 3 months avg:      $${avg(last3).toFixed(2)}`);
console.log(`  Last 6 months avg:      $${avg(last6).toFixed(2)}`);
console.log(`  Last 12 months avg:     $${avg(last12).toFixed(2)}`);
if (aprilSpend.length) {
  console.log(`  April historical avg:   $${avg(aprilSpend).toFixed(2)}`);
}
console.log(`\n  ➤ PREDICTED APRIL SPEND: $${predicted.toFixed(2)}`);
console.log(`    (weighted: 40% recent 3mo, 30% recent 6mo, 20% April hist, 10% 12mo avg)`);

// Top vendors last 3 months
console.log('\n\n  TOP VENDORS (last 3 months)');
console.log('  ' + '─'.repeat(45));
const recentVendors = {};
for (const o of orders) {
  if (o.month >= months[months.length - 3]) {
    recentVendors[o.vendor] = (recentVendors[o.vendor] || 0) + o.cost;
  }
}
for (const [v, c] of Object.entries(recentVendors).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${v.padEnd(12)} $${c.toFixed(2)}`);
}

// Top items by spend last 3 months
console.log('\n\n  TOP ITEMS BY SPEND (last 3 months)');
console.log('  ' + '─'.repeat(45));
const recentItems = {};
for (const o of orders) {
  if (o.month >= months[months.length - 3]) {
    if (!recentItems[o.itemCode]) recentItems[o.itemCode] = { cost: 0, qty: 0 };
    recentItems[o.itemCode].cost += o.cost;
    recentItems[o.itemCode].qty += o.qty;
  }
}
for (const [code, d] of Object.entries(recentItems).sort((a, b) => b[1].cost - a[1].cost).slice(0, 15)) {
  console.log(`  ${code.padEnd(12)} qty=${d.qty.toString().padStart(4)}  $${d.cost.toFixed(2).padStart(10)}`);
}
