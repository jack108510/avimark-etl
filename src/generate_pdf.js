#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // Fetch all rows
  let all = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('pricing_dashboard')
      .select('*')
      .order('annual_revenue', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    offset += 1000;
    if (data.length < 1000) break;
  }
  console.log('Total rows:', all.length);

  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = all.map(r => {
    const markup = r.markup_pct !== null ? r.markup_pct + '%' : '—';
    const cost = r.avg_cost !== null ? '$' + r.avg_cost.toFixed(2) : '—';
    const lastChanged = r.last_changed ? r.last_changed.substring(0, 10) : '—';
    return `<tr>
      <td>${r.treatment_code}</td>
      <td>${r.description || '—'}</td>
      <td class="r">$${r.current_price.toFixed(2)}</td>
      <td>${lastChanged}</td>
      <td class="r">${cost}</td>
      <td class="r">${markup}</td>
      <td class="r">$${r.price_with_5pct_increase.toFixed(2)}</td>
      <td class="r">${r.usage_365d.toLocaleString()}</td>
      <td class="r">$${fmt(r.annual_revenue)}</td>
    </tr>`;
  }).join('\n');

  const totalRevenue = all.reduce((s, r) => s + r.annual_revenue, 0);
  const withMarkup = all.filter(r => r.markup_pct !== null).length;
  const stale = all.filter(r => r.last_changed && r.last_changed < '2024-01-01').length;
  const today = new Date().toISOString().substring(0, 10);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Rosslyn Veterinary Clinic — Pricing Dashboard</title>
<style>
  @page { size: landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 8px; margin: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 12px; color: #555; margin-top: 0; }
  .stats { display: flex; gap: 30px; margin: 10px 0 15px 0; }
  .stat { background: #f0f4f8; padding: 8px 14px; border-radius: 6px; }
  .stat .num { font-size: 16px; font-weight: bold; color: #1a56db; }
  .stat .label { font-size: 9px; color: #666; }
  table { border-collapse: collapse; width: 100%; font-size: 7.5px; }
  th { background: #1a56db; color: white; padding: 4px 6px; text-align: left; font-size: 7.5px; }
  td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f9fafb; }
  .r { text-align: right; }
  .footer { margin-top: 10px; font-size: 8px; color: #888; }
</style>
</head>
<body>
<h1>Rosslyn Veterinary Clinic — Pricing Dashboard</h1>
<h2>Generated ${today} | Data from Avimark ETL</h2>

<div class="stats">
  <div class="stat"><div class="num">${all.length.toLocaleString()}</div><div class="label">Items</div></div>
  <div class="stat"><div class="num">$${(totalRevenue/1000).toFixed(0)}K</div><div class="label">Annual Revenue</div></div>
  <div class="stat"><div class="num">${withMarkup}</div><div class="label">With Cost Data</div></div>
  <div class="stat"><div class="num">${stale}</div><div class="label">Stale Prices (pre-2024)</div></div>
</div>

<table>
<thead>
<tr>
  <th>Code</th>
  <th>Description</th>
  <th class="r">Price</th>
  <th>Last Changed</th>
  <th class="r">Avg Cost</th>
  <th class="r">Markup</th>
  <th class="r">+5% Price</th>
  <th class="r">Usage (365d)</th>
  <th class="r">Revenue (365d)</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>

<div class="footer">
  Source: Avimark ETL (30 tables, 2.58M rows) | Supabase: pricing_dashboard table<br>
  Prices from PRICE.V2$ | Usage from SERVICE.V2$ | Costs from PO.V2$ (bulk purchase costs, not per-unit)
</div>
</body>
</html>`;

  if (!fs.existsSync('reports')) fs.mkdirSync('reports');
  fs.writeFileSync('reports/pricing_dashboard.html', html);
  console.log('HTML written to reports/pricing_dashboard.html');
}

main().catch(console.error);
