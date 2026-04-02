import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // Get all PO headers with dates
  const { data: headers } = await sb
    .from('purchase_orders')
    .select('record_num, order_date, po_number, vendor_code')
    .eq('record_type', 'header')
    .not('order_date', 'is', null)
    .order('order_date', { ascending: true });

  // Get all line items with quantities
  const { data: lineItems } = await sb
    .from('purchase_orders')
    .select('record_num, item_code, quantity')
    .eq('record_type', 'line_item');

  // Get item prices from services (average amount per code)
  const { data: services } = await sb
    .from('services')
    .select('code, amount')
    .gt('amount', 0);

  // Build avg price per item code from services
  const priceSum = {};
  const priceCount = {};
  for (const s of services || []) {
    if (!s.code) continue;
    priceSum[s.code] = (priceSum[s.code] || 0) + s.amount;
    priceCount[s.code] = (priceCount[s.code] || 0) + 1;
  }
  const avgPrice = {};
  for (const code of Object.keys(priceSum)) {
    avgPrice[code] = priceSum[code] / priceCount[code];
  }

  // Also get item cost from items table
  const { data: items } = await sb.from('items').select('code, name');
  const itemNames = {};
  for (const i of items || []) {
    if (i.code) itemNames[i.code] = i.name;
  }

  // Match line items to their headers (line_item record_num = header record_num + 1)
  const headerMap = {};
  for (const h of headers || []) {
    headerMap[h.record_num] = h;
  }

  // Build monthly PO spend
  const monthlyOrders = {}; // 'YYYY-MM' -> { count, items, estimated_cost }
  const vendorMonthly = {}; // 'YYYY-MM' -> { vendor -> count }
  const itemMonthly = {}; // item_code -> { 'YYYY-MM' -> qty }

  for (const li of lineItems || []) {
    // The header for this line item is at record_num - 1
    const header = headerMap[li.record_num - 1];
    if (!header || !header.order_date) continue;

    const month = header.order_date.substring(0, 7); // YYYY-MM
    if (!monthlyOrders[month]) monthlyOrders[month] = { count: 0, items: 0, qty: 0 };
    monthlyOrders[month].count++;
    monthlyOrders[month].qty += li.quantity || 0;

    if (!vendorMonthly[month]) vendorMonthly[month] = {};
    vendorMonthly[month][header.vendor_code] = (vendorMonthly[month][header.vendor_code] || 0) + 1;

    if (li.item_code) {
      if (!itemMonthly[li.item_code]) itemMonthly[li.item_code] = {};
      itemMonthly[li.item_code][month] = (itemMonthly[li.item_code][month] || 0) + (li.quantity || 1);
    }
  }

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Inventory Spend Forecast — April 2026              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Show monthly order history (last 24 months)
  const months = Object.keys(monthlyOrders).sort();
  const recent24 = months.slice(-24);

  console.log('MONTHLY ORDER HISTORY (last 24 months)');
  console.log('─'.repeat(50));
  
  const monthlyQtys = [];
  for (const m of recent24) {
    const mo = monthlyOrders[m];
    const bar = '█'.repeat(Math.min(50, Math.round(mo.qty / 50)));
    console.log(`${m}  ${mo.count.toString().padStart(4)} orders  ${mo.qty.toString().padStart(6)} units  ${bar}`);
    monthlyQtys.push({ month: m, count: mo.count, qty: mo.qty });
  }

  // Calculate averages for prediction
  const last12 = monthlyQtys.slice(-12);
  const last6 = monthlyQtys.slice(-6);
  const last3 = monthlyQtys.slice(-3);

  const avg12orders = last12.reduce((s, m) => s + m.count, 0) / last12.length;
  const avg6orders = last6.reduce((s, m) => s + m.count, 0) / last6.length;
  const avg3orders = last3.reduce((s, m) => s + m.count, 0) / last3.length;

  const avg12qty = last12.reduce((s, m) => s + m.qty, 0) / last12.length;
  const avg6qty = last6.reduce((s, m) => s + m.qty, 0) / last6.length;
  const avg3qty = last3.reduce((s, m) => s + m.qty, 0) / last3.length;

  // Check for April in prior years
  const aprilData = monthlyQtys.filter(m => m.month.endsWith('-04'));
  console.log('\n\nAPRIL HISTORY');
  console.log('─'.repeat(50));
  for (const a of aprilData) {
    console.log(`${a.month}  ${a.count} orders  ${a.qty} units`);
  }
  const aprilAvgOrders = aprilData.length > 0 
    ? aprilData.reduce((s, a) => s + a.count, 0) / aprilData.length : avg12orders;
  const aprilAvgQty = aprilData.length > 0
    ? aprilData.reduce((s, a) => s + a.qty, 0) / aprilData.length : avg12qty;

  // Weighted prediction: 40% recent 3mo, 30% recent 6mo, 20% April historical, 10% 12mo avg
  const predictedOrders = Math.round(
    avg3orders * 0.4 + avg6orders * 0.3 + aprilAvgOrders * 0.2 + avg12orders * 0.1
  );
  const predictedQty = Math.round(
    avg3qty * 0.4 + avg6qty * 0.3 + aprilAvgQty * 0.2 + avg12qty * 0.1
  );

  // Estimate cost: look at recent months' actual spending pattern
  // Since we don't have cost per item directly, use the average qty * estimated unit cost
  // Get top ordered items and their service prices as proxy
  const topItems = Object.entries(itemMonthly)
    .map(([code, months]) => {
      const recentMonths = Object.entries(months).filter(([m]) => m >= '2025-04').sort();
      const totalQty = recentMonths.reduce((s, [, q]) => s + q, 0);
      const monthCount = recentMonths.length || 1;
      const avgMonthlyQty = totalQty / monthCount;
      const price = avgPrice[code] || 0;
      return { code, name: itemNames[code] || code, avgMonthlyQty, price, monthlyCost: avgMonthlyQty * price };
    })
    .filter(i => i.monthlyCost > 0)
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  const estimatedMonthlyCost = topItems.reduce((s, i) => s + i.monthlyCost, 0);

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  APRIL 2026 FORECAST');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`  Predicted order lines:     ${predictedOrders}`);
  console.log(`  Predicted total units:     ${predictedQty}`);
  console.log('');
  console.log('  Calculation method:');
  console.log(`    Last 3 months avg:       ${Math.round(avg3orders)} orders, ${Math.round(avg3qty)} units`);
  console.log(`    Last 6 months avg:       ${Math.round(avg6orders)} orders, ${Math.round(avg6qty)} units`);
  console.log(`    Last 12 months avg:      ${Math.round(avg12orders)} orders, ${Math.round(avg12qty)} units`);
  console.log(`    April historical avg:    ${Math.round(aprilAvgOrders)} orders, ${Math.round(aprilAvgQty)} units`);
  console.log(`    Weighted (40/30/20/10):  ${predictedOrders} orders, ${predictedQty} units`);

  if (topItems.length > 0) {
    console.log('\n\n  TOP 20 ITEMS BY ESTIMATED MONTHLY COST');
    console.log('  ' + '─'.repeat(70));
    console.log(`  ${'Code'.padEnd(12)} ${'Item'.padEnd(35)} ${'Qty/mo'.padStart(8)} ${'$/unit'.padStart(8)} ${'$/mo'.padStart(10)}`);
    console.log('  ' + '─'.repeat(70));
    for (const i of topItems.slice(0, 20)) {
      console.log(`  ${i.code.padEnd(12)} ${i.name.substring(0,33).padEnd(35)} ${i.avgMonthlyQty.toFixed(1).padStart(8)} ${('$'+i.price.toFixed(2)).padStart(8)} ${('$'+i.monthlyCost.toFixed(2)).padStart(10)}`);
    }
    console.log('\n  ESTIMATED TOTAL MONTHLY INVENTORY COST: $' + estimatedMonthlyCost.toFixed(2));
  }

  // Vendor breakdown
  console.log('\n\n  VENDOR ORDER FREQUENCY (last 6 months)');
  console.log('  ' + '─'.repeat(40));
  const vendorTotals = {};
  for (const m of last6.map(m => m.month)) {
    for (const [v, c] of Object.entries(vendorMonthly[m] || {})) {
      vendorTotals[v] = (vendorTotals[v] || 0) + c;
    }
  }
  const vendorSorted = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1]);
  for (const [vendor, count] of vendorSorted.slice(0, 10)) {
    console.log(`  ${vendor.padEnd(12)} ${count} line items`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
