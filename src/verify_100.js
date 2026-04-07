#!/usr/bin/env node
/**
 * Generate a PDF with 100 billing-based prices for verification.
 * Shows: code, description, billing price, fee schedule price, mismatch flag
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function fetchAll(table, select, filters = {}) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    let query = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) {
      if (k === 'gt') for (const [col, val] of Object.entries(v)) query = query.gt(col, val);
      if (k === 'eq') for (const [col, val] of Object.entries(v)) query = query.eq(col, val);
      if (k === 'not_null') for (const col of v) query = query.not(col, 'is', null);
    }
    const { data, error } = await query;
    if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    offset += PAGE;
    if (data.length < PAGE) break;
    if (offset % 10000 === 0) process.stdout.write(`  ${table}: ${offset}...\r`);
  }
  console.log(`  ${table}: ${all.length} rows`);
  return all;
}

async function main() {
  console.log('Loading data...');
  const prices = await fetchAll('prices', 'treatment_code,price,last_changed');
  console.log('  services: loading...');
  const services = await fetchAll('services', 'code,description,amount,service_date');

  // Fee schedule map
  const feeMap = new Map();
  for (const p of prices) {
    const existing = feeMap.get(p.treatment_code);
    if (!existing || (p.last_changed && (!existing.last_changed || p.last_changed > existing.last_changed))) {
      feeMap.set(p.treatment_code, p);
    }
  }

  // 365d cutoff
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().replace('T', ' ').substring(0, 19);

  // Descriptions
  const descCounts = new Map();
  for (const s of services) {
    if (!s.code || !s.description) continue;
    if (!descCounts.has(s.code)) descCounts.set(s.code, new Map());
    descCounts.get(s.code).set(s.description, (descCounts.get(s.code).get(s.description) || 0) + 1);
  }
  const descMap = new Map();
  for (const [code, counts] of descCounts) {
    let best = '', bestN = 0;
    for (const [desc, n] of counts) { if (n > bestN) { best = desc; bestN = n; } }
    descMap.set(code, best);
  }

  // Billing prices + usage (365d only)
  const billingCounts = new Map();
  const usageMap = new Map();
  for (const s of services) {
    if (!s.code || !s.service_date || s.service_date < cutoffStr) continue;
    if (!usageMap.has(s.code)) usageMap.set(s.code, { count: 0, revenue: 0 });
    const u = usageMap.get(s.code);
    u.count++;
    if (s.amount > 0) u.revenue += s.amount;
    if (s.amount > 0) {
      if (!billingCounts.has(s.code)) billingCounts.set(s.code, new Map());
      billingCounts.get(s.code).set(s.amount, (billingCounts.get(s.code).get(s.amount) || 0) + 1);
    }
  }

  // Build rows — only codes that have BOTH fee schedule and billing data, sorted by usage
  const rows = [];
  for (const [code, counts] of billingCounts) {
    const fee = feeMap.get(code);
    if (!fee) continue; // skip if no fee schedule entry
    
    let bestAmt = 0, bestN = 0, totalCharges = 0;
    for (const [amt, n] of counts) { 
      totalCharges += n;
      if (n > bestN) { bestAmt = amt; bestN = n; } 
    }
    
    const usage = usageMap.get(code) || { count: 0, revenue: 0 };
    const mismatch = Math.abs(fee.price - bestAmt) > 0.01;
    const confidence = Math.round(bestN / totalCharges * 100);
    
    rows.push({
      code,
      description: descMap.get(code) || '—',
      billing_price: bestAmt,
      billing_count: bestN,
      confidence,
      fee_schedule_price: fee.price,
      last_changed: fee.last_changed ? fee.last_changed.substring(0, 10) : '—',
      mismatch,
      usage: usage.count,
      revenue: Math.round(usage.revenue * 100) / 100,
    });
  }

  // Sort by usage (most used first — easiest to verify)
  rows.sort((a, b) => b.usage - a.usage);
  const top100 = rows.slice(0, 100);

  console.log(`\n${rows.length} codes with both billing + fee schedule`);
  console.log(`Top 100 selected by usage`);
  console.log(`Mismatches in top 100: ${top100.filter(r => r.mismatch).length}`);

  // Build HTML
  const tableRows = top100.map((r, i) => {
    const rowClass = r.mismatch ? ' style="background: #fff3cd;"' : (i % 2 === 0 ? '' : ' style="background: #f9fafb;"');
    const flag = r.mismatch ? '⚠️' : '✅';
    return `<tr${rowClass}>
      <td>${i + 1}</td>
      <td><b>${r.code}</b></td>
      <td>${r.description}</td>
      <td class="r"><b>$${r.billing_price.toFixed(2)}</b></td>
      <td class="r">${r.confidence}% (${r.billing_count}x)</td>
      <td class="r">$${r.fee_schedule_price.toFixed(2)}</td>
      <td>${r.last_changed}</td>
      <td class="c">${flag}</td>
      <td class="r">${r.usage.toLocaleString()}</td>
      <td class="r">$${r.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
    </tr>`;
  }).join('\n');

  const mismatches = top100.filter(r => r.mismatch);
  const matches = top100.filter(r => !r.mismatch);
  const today = new Date().toISOString().substring(0, 10);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Price Verification — Top 100 Items</title>
<style>
  @page { size: landscape; margin: 12mm; }
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 11px; color: #555; margin-top: 2px; }
  .summary { margin: 12px 0; padding: 10px 16px; background: #f0f4f8; border-radius: 8px; font-size: 10px; }
  .summary b { color: #1a56db; }
  table { border-collapse: collapse; width: 100%; font-size: 8.5px; }
  th { background: #1a56db; color: white; padding: 5px 8px; text-align: left; font-size: 8.5px; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  .r { text-align: right; }
  .c { text-align: center; }
  .legend { margin-top: 12px; font-size: 9px; color: #555; }
  .legend span { display: inline-block; padding: 2px 8px; margin-right: 8px; border-radius: 3px; }
  .match { background: #d4edda; }
  .mismatch { background: #fff3cd; }
</style>
</head>
<body>
<h1>Rosslyn Veterinary Clinic — Price Verification</h1>
<h2>Top 100 Items by Usage | Generated ${today}</h2>

<div class="summary">
  <b>${matches.length}</b> prices match fee schedule &nbsp;|&nbsp; 
  <b>${mismatches.length}</b> mismatches (highlighted yellow) &nbsp;|&nbsp;
  Billing price = most-frequent charge amount in last 365 days &nbsp;|&nbsp;
  Confidence = % of charges at that price
</div>

<table>
<thead>
<tr>
  <th>#</th>
  <th>Code</th>
  <th>Description</th>
  <th class="r">Billing Price</th>
  <th class="r">Confidence</th>
  <th class="r">Fee Schedule</th>
  <th>Last Changed</th>
  <th class="c">Match</th>
  <th class="r">Usage (365d)</th>
  <th class="r">Revenue (365d)</th>
</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>

<div class="legend">
  <span class="match">✅ = billing matches fee schedule</span>
  <span class="mismatch">⚠️ = billing differs from fee schedule</span>
</div>

<div class="legend" style="margin-top: 6px;">
  <b>How to verify:</b> Open Avimark, look up each code, and compare the price shown to the "Billing Price" column.
  The billing price is what clients were actually charged (most common amount). If it matches what you see in Avimark, the data is good.
</div>
</body>
</html>`;

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');
  fs.writeFileSync('reports/price_verification_100.html', html);
  console.log('HTML written to reports/price_verification_100.html');
}

main().catch(console.error);
