import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dataDir = 'C:\\AVImark';
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

async function main() {
  // Step 1: Get a recent full day of services from SERVICE.V2$
  // Use @21 date field, scan recent records
  const fd = fs.openSync(dataDir + '\\SERVICE.V2$', 'r');
  const stat = fs.statSync(dataDir + '\\SERVICE.V2$');
  const totalRecs = Math.floor(stat.size / 256);

  // Find the most recent business day — scan backwards from end
  const targetDates = {};
  const CHUNK = 5000;
  const startRec = totalRecs - CHUNK;
  const buf = Buffer.alloc(CHUNK * 256);
  fs.readSync(fd, buf, 0, CHUNK * 256, startRec * 256);

  for (let i = 0; i < CHUNK; i++) {
    const rec = buf.subarray(i * 256, (i + 1) * 256);
    const dateVal = rec.readDoubleLE(21);
    if (dateVal > 35000 && dateVal < 47000) {
      const dt = new Date(DELPHI_EPOCH + dateVal * 86400000);
      const dateStr = dt.toISOString().split('T')[0];
      if (!targetDates[dateStr]) targetDates[dateStr] = [];
      
      const codeLen = Math.min(rec[103] || 0, 12);
      const code = codeLen > 0 ? rec.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
      const amount = rec.readInt32LE(112) / 100;
      const nameLen = Math.min(rec[53] || 0, 50);
      const name = nameLen > 0 ? rec.toString('ascii', 54, 54 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
      const type = rec.toString('ascii', 42, 44).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
      
      if (code) targetDates[dateStr].push({ code, name, amount, type });
    }
  }
  fs.closeSync(fd);

  // Find the most recent date with significant activity
  const sortedDates = Object.keys(targetDates).sort().reverse();
  let targetDate = null;
  for (const d of sortedDates) {
    if (targetDates[d].length >= 20) { // at least 20 service lines
      targetDate = d;
      break;
    }
  }

  if (!targetDate) {
    console.log('No recent day with enough activity found');
    return;
  }

  const dayServices = targetDates[targetDate];

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Daily COGS Analysis                                ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`Date: ${targetDate}`);
  console.log(`Total service lines: ${dayServices.length}\n`);

  // Step 2: Build cost lookup from PO data
  // Read all PO line items to get average cost per item code
  const poFd = fs.openSync(dataDir + '\\PO.V2$', 'r');
  const poStat = fs.statSync(dataDir + '\\PO.V2$');
  const poTotal = Math.floor(poStat.size / 64);

  const itemCosts = {}; // code -> { totalCost, totalQty, count }

  for (let i = 0; i < poTotal - 1; i += 2) {
    const lBuf = Buffer.alloc(64);
    fs.readSync(poFd, lBuf, 0, 64, (i + 1) * 64);

    const qty = lBuf[9] || 0;
    const codeLen = Math.min(lBuf[12] || 0, 14);
    const code = codeLen > 0 ? lBuf.toString('ascii', 13, 13 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
    const costRaw = lBuf.readInt32LE(32);
    const cost = costRaw / 10000;

    if (code && cost > 0 && qty > 0) {
      if (!itemCosts[code]) itemCosts[code] = { totalCost: 0, totalQty: 0, count: 0 };
      itemCosts[code].totalCost += cost;
      itemCosts[code].totalQty += qty;
      itemCosts[code].count++;
    }
  }
  fs.closeSync(poFd);

  // Build avg unit cost
  const unitCost = {};
  for (const [code, data] of Object.entries(itemCosts)) {
    unitCost[code] = data.totalCost / data.totalQty;
  }

  // Step 3: Get item names
  const { data: itemList } = await sb.from('items').select('code, name');
  const itemNames = {};
  for (const i of itemList || []) {
    if (i.code) itemNames[i.code] = i.name;
  }

  // Step 4: Categorize services and calculate COGS
  // Service types: AI=inventory item, AS=service, AT=attachment, AM=medication, etc.
  // Items with codes matching PO items have COGS; pure services don't

  let totalRevenue = 0;
  let totalCOGS = 0;
  let cogsItems = 0;
  let serviceOnlyItems = 0;
  let zeroChargeItems = 0;

  const categories = {
    'Product/Inventory (has COGS)': { revenue: 0, cogs: 0, lines: 0, items: [] },
    'Professional Services (no COGS)': { revenue: 0, cogs: 0, lines: 0, items: [] },
    'Zero-Charge Items': { revenue: 0, cogs: 0, lines: 0, items: [] },
  };

  for (const svc of dayServices) {
    totalRevenue += svc.amount;

    const hasCost = unitCost[svc.code] !== undefined;
    const cost = hasCost ? unitCost[svc.code] : 0;

    if (svc.amount === 0) {
      categories['Zero-Charge Items'].revenue += svc.amount;
      categories['Zero-Charge Items'].lines++;
      categories['Zero-Charge Items'].items.push(svc);
      zeroChargeItems++;
    } else if (hasCost) {
      totalCOGS += cost;
      categories['Product/Inventory (has COGS)'].revenue += svc.amount;
      categories['Product/Inventory (has COGS)'].cogs += cost;
      categories['Product/Inventory (has COGS)'].lines++;
      categories['Product/Inventory (has COGS)'].items.push({ ...svc, cost });
      cogsItems++;
    } else {
      categories['Professional Services (no COGS)'].revenue += svc.amount;
      categories['Professional Services (no COGS)'].lines++;
      categories['Professional Services (no COGS)'].items.push(svc);
      serviceOnlyItems++;
    }
  }

  const grossProfit = totalRevenue - totalCOGS;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0;

  // Print summary
  console.log('═══════════════════════════════════════════════════');
  console.log('  DAILY P&L SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Revenue:        $${totalRevenue.toFixed(2).padStart(10)}`);
  console.log(`  COGS:           $${totalCOGS.toFixed(2).padStart(10)}`);
  console.log(`  Gross Profit:   $${grossProfit.toFixed(2).padStart(10)}`);
  console.log(`  Gross Margin:   ${grossMargin.toFixed(1)}%`);
  console.log('');
  console.log(`  Service lines:  ${dayServices.length}`);
  console.log(`    Products (with COGS): ${cogsItems}`);
  console.log(`    Services (no COGS):   ${serviceOnlyItems}`);
  console.log(`    Zero-charge:          ${zeroChargeItems}`);

  // Category breakdown
  for (const [cat, data] of Object.entries(categories)) {
    if (data.lines === 0) continue;
    console.log(`\n\n  ${cat}`);
    console.log('  ' + '─'.repeat(65));
    console.log(`  ${'Code'.padEnd(12)} ${'Description'.padEnd(30)} ${'Revenue'.padStart(10)} ${'Cost'.padStart(10)} ${'Margin'.padStart(8)}`);
    console.log('  ' + '─'.repeat(65));

    // Aggregate by code
    const byCode = {};
    for (const item of data.items) {
      if (!byCode[item.code]) byCode[item.code] = { name: item.name, revenue: 0, cost: 0, count: 0 };
      byCode[item.code].revenue += item.amount;
      byCode[item.code].cost += item.cost || 0;
      byCode[item.code].count++;
    }

    const sorted = Object.entries(byCode).sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [code, d] of sorted.slice(0, 20)) {
      const margin = d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue * 100).toFixed(0) + '%' : '-';
      const name = d.name || itemNames[code] || code;
      const countStr = d.count > 1 ? ` (×${d.count})` : '';
      console.log(`  ${code.padEnd(12)} ${(name.substring(0, 28) + countStr).padEnd(30)} ${('$' + d.revenue.toFixed(2)).padStart(10)} ${('$' + d.cost.toFixed(2)).padStart(10)} ${margin.padStart(8)}`);
    }
    if (sorted.length > 20) console.log(`  ... and ${sorted.length - 20} more`);
    console.log(`  ${'SUBTOTAL'.padEnd(42)} ${('$' + data.revenue.toFixed(2)).padStart(10)} ${('$' + data.cogs.toFixed(2)).padStart(10)}`);
  }

  // Monthly projection
  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  MONTHLY PROJECTION (×22 business days)');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Monthly Revenue:  $${(totalRevenue * 22).toFixed(2)}`);
  console.log(`  Monthly COGS:     $${(totalCOGS * 22).toFixed(2)}`);
  console.log(`  Monthly Gross:    $${(grossProfit * 22).toFixed(2)}`);
  console.log(`  Gross Margin:     ${grossMargin.toFixed(1)}%`);

  // Show recent dates for context
  console.log('\n\n  Recent daily activity:');
  for (const d of sortedDates.slice(0, 7)) {
    const count = targetDates[d].length;
    const rev = targetDates[d].reduce((s, svc) => s + svc.amount, 0);
    console.log(`  ${d}  ${count.toString().padStart(4)} lines  $${rev.toFixed(2).padStart(10)}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
