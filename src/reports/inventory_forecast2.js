import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // PO numbers encode dates: YYMMDDRR (e.g., 26031101 = 2026-03-11, order 01)
  // Get all headers
  const { data: headers } = await sb
    .from('purchase_orders')
    .select('record_num, po_number, vendor_code')
    .eq('record_type', 'header')
    .not('po_number', 'is', null);

  // Get all line items
  const { data: lineItems } = await sb
    .from('purchase_orders')
    .select('record_num, item_code, quantity')
    .eq('record_type', 'line_item');

  // Build header map
  const headerMap = {};
  for (const h of headers || []) {
    headerMap[h.record_num] = h;
  }

  // Parse PO number into date
  function poToDate(po) {
    if (!po || po.length < 6) return null;
    const yy = parseInt(po.substring(0, 2));
    const mm = parseInt(po.substring(2, 4));
    const dd = parseInt(po.substring(4, 6));
    if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${String(mm).padStart(2,'0')}`;
  }

  // Build monthly data
  const monthly = {}; // YYYY-MM -> { orders, qty, vendors: Set }

  for (const li of lineItems || []) {
    const header = headerMap[li.record_num - 1];
    if (!header) continue;

    const month = poToDate(header.po_number);
    if (!month) continue;

    if (!monthly[month]) monthly[month] = { orders: 0, qty: 0, vendors: new Set() };
    monthly[month].orders++;
    monthly[month].qty += li.quantity || 0;
    if (header.vendor_code) monthly[month].vendors.add(header.vendor_code);
  }

  const months = Object.keys(monthly).sort();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Inventory Forecast — April 2026                    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Show last 24 months
  const recent24 = months.filter(m => m >= '2024-04');
  console.log('MONTHLY ORDER HISTORY');
  console.log('─'.repeat(65));
  console.log(`${'Month'.padEnd(10)} ${'Orders'.padStart(7)} ${'Units'.padStart(10)} ${'Vendors'.padStart(8)}`);
  console.log('─'.repeat(65));

  const recentData = [];
  for (const m of recent24) {
    const d = monthly[m];
    const bar = '█'.repeat(Math.min(40, Math.round(d.orders / 5)));
    console.log(`${m.padEnd(10)} ${d.orders.toString().padStart(7)} ${d.qty.toString().padStart(10)} ${d.vendors.size.toString().padStart(8)}  ${bar}`);
    recentData.push({ month: m, orders: d.orders, qty: d.qty });
  }

  // April history across years
  const aprilMonths = months.filter(m => m.endsWith('-04'));
  console.log('\n\nAPRIL ACROSS YEARS');
  console.log('─'.repeat(50));
  for (const m of aprilMonths) {
    const d = monthly[m];
    console.log(`${m}  ${d.orders} orders  ${d.qty} units  ${d.vendors.size} vendors`);
  }

  // Calculate predictions
  const last12 = recentData.slice(-12);
  const last6 = recentData.slice(-6);
  const last3 = recentData.slice(-3);

  const avg = (arr, field) => arr.length > 0 ? arr.reduce((s, r) => s + r[field], 0) / arr.length : 0;
  
  const aprilHist = aprilMonths.map(m => monthly[m]);
  const aprilAvgOrders = aprilHist.length > 0 ? aprilHist.reduce((s, d) => s + d.orders, 0) / aprilHist.length : avg(last12, 'orders');
  const aprilAvgQty = aprilHist.length > 0 ? aprilHist.reduce((s, d) => s + d.qty, 0) / aprilHist.length : avg(last12, 'qty');

  const predictedOrders = Math.round(
    avg(last3, 'orders') * 0.4 + avg(last6, 'orders') * 0.3 + aprilAvgOrders * 0.2 + avg(last12, 'orders') * 0.1
  );
  const predictedQty = Math.round(
    avg(last3, 'qty') * 0.4 + avg(last6, 'qty') * 0.3 + aprilAvgQty * 0.2 + avg(last12, 'qty') * 0.1
  );

  // Trend: is ordering increasing or decreasing?
  const firstHalf = last12.slice(0, 6);
  const secondHalf = last12.slice(6);
  const trend = avg(secondHalf, 'orders') - avg(firstHalf, 'orders');
  const trendPct = avg(firstHalf, 'orders') > 0 ? (trend / avg(firstHalf, 'orders') * 100) : 0;

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  📊 APRIL 2026 FORECAST');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`  Predicted order lines:     ${predictedOrders}`);
  console.log(`  Predicted total units:     ${predictedQty.toLocaleString()}`);
  console.log(`  12-month trend:            ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}% (${trend >= 0 ? 'increasing' : 'decreasing'})`);
  console.log('');
  console.log('  Method: Weighted average');
  console.log(`    40% last 3mo avg:  ${Math.round(avg(last3, 'orders'))} orders, ${Math.round(avg(last3, 'qty')).toLocaleString()} units`);
  console.log(`    30% last 6mo avg:  ${Math.round(avg(last6, 'orders'))} orders, ${Math.round(avg(last6, 'qty')).toLocaleString()} units`);
  console.log(`    20% April hist:    ${Math.round(aprilAvgOrders)} orders, ${Math.round(aprilAvgQty).toLocaleString()} units`);
  console.log(`    10% last 12mo avg: ${Math.round(avg(last12, 'orders'))} orders, ${Math.round(avg(last12, 'qty')).toLocaleString()} units`);

  // Top items ordered in last 3 months
  const recentItemQty = {};
  for (const li of lineItems || []) {
    const header = headerMap[li.record_num - 1];
    if (!header) continue;
    const month = poToDate(header.po_number);
    if (!month || month < '2025-12') continue;
    const code = li.item_code;
    if (!code) continue;
    recentItemQty[code] = (recentItemQty[code] || 0) + (li.quantity || 1);
  }

  // Get item names
  const { data: itemList } = await sb.from('items').select('code, name');
  const itemNames = {};
  for (const i of itemList || []) {
    if (i.code) itemNames[i.code] = i.name;
  }

  const topItems = Object.entries(recentItemQty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (topItems.length > 0) {
    console.log('\n\n  TOP 20 ITEMS ORDERED (last 3 months)');
    console.log('  ' + '─'.repeat(55));
    for (const [code, qty] of topItems) {
      const name = itemNames[code] || code;
      console.log(`  ${code.padEnd(10)} ${name.substring(0, 40).padEnd(42)} ${qty.toString().padStart(6)}`);
    }
  }

  // Vendor breakdown last 3 months
  console.log('\n\n  TOP VENDORS (last 3 months)');
  console.log('  ' + '─'.repeat(35));
  const vendorRecent = {};
  for (const li of lineItems || []) {
    const header = headerMap[li.record_num - 1];
    if (!header) continue;
    const month = poToDate(header.po_number);
    if (!month || month < '2025-12') continue;
    if (header.vendor_code) vendorRecent[header.vendor_code] = (vendorRecent[header.vendor_code] || 0) + 1;
  }
  const vendorSorted = Object.entries(vendorRecent).sort((a, b) => b[1] - a[1]);
  for (const [v, c] of vendorSorted.slice(0, 10)) {
    console.log(`  ${v.padEnd(12)} ${c} line items`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
