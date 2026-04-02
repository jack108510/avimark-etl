#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CANADA_CPI = {
  2013: 0.91, 2014: 1.96, 2015: 1.13, 2016: 1.43, 2017: 1.60,
  2018: 2.27, 2019: 1.95, 2020: 0.72, 2021: 3.40, 2022: 6.80,
  2023: 3.88, 2024: 2.95, 2025: 2.40, 2026: 2.20,
};

function parseAuditDate(dateStr) {
  if (!dateStr) return null;
  let m = dateStr.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = parseInt(m[3]); y = y >= 50 ? 1900+y : 2000+y; return new Date(y, parseInt(m[1])-1, parseInt(m[2])); }
  m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
  return null;
}

function compoundInflation(fromYear, toYear = 2026) {
  let factor = 1.0;
  for (let y = fromYear; y < toYear; y++) {
    factor *= (1 + (CANADA_CPI[y] || 2.0) / 100);
  }
  return factor;
}

async function main() {
  // Load last-year volumes from SERVICE.V2$ positional estimate
  const recentData = JSON.parse(fs.readFileSync('reports/service_last_year.json', 'utf8'));
  const recentCounts = recentData.counts;
  const recentRevenue = recentData.revenue;

  const { data: priceList } = await sb.from('prices').select('treatment_code, price');
  const priceMap = {};
  for (const p of priceList) {
    if (!priceMap[p.treatment_code] || p.price > priceMap[p.treatment_code]) priceMap[p.treatment_code] = p.price;
  }

  const { data: treatments } = await sb.from('treatments').select('code, name');
  const nameMap = {};
  for (const t of treatments || []) nameMap[t.code] = t.name;

  const { data: auditData } = await sb
    .from('audit_log')
    .select('item_code, date_text')
    .eq('category', 'price_change')
    .order('date_text', { ascending: false });

  const lastChange = {};
  for (const a of auditData) {
    if (!a.item_code) continue;
    const d = parseAuditDate(a.date_text);
    if (!d) continue;
    if (!lastChange[a.item_code] || d > lastChange[a.item_code].date) {
      lastChange[a.item_code] = { date: d };
    }
  }

  const now = new Date();
  const rows = [];

  for (const [code, currentPrice] of Object.entries(priceMap)) {
    // Only include codes with actual last-365-day volume
    const volume365 = recentCounts[code];
    if (!volume365 || volume365 <= 0) continue;

    const change = lastChange[code];
    let lastChangeDate, changeYear;
    if (change) {
      lastChangeDate = change.date;
      changeYear = lastChangeDate.getFullYear();
    } else {
      lastChangeDate = new Date(2014, 0, 1);
      changeYear = 2014;
    }

    const daysSinceChange = Math.round((now - lastChangeDate) / (24 * 60 * 60 * 1000));
    if (daysSinceChange < 365) continue; // Changed recently

    const inflationFactor = compoundInflation(changeYear);
    const inflationPct = Math.round((inflationFactor - 1) * 10000) / 100;
    const suggestedPrice = Math.round(currentPrice * inflationFactor * 100) / 100;
    const delta = Math.round((suggestedPrice - currentPrice) * 100) / 100;
    if (delta <= 0) continue;

    const estimatedUplift = Math.round(delta * volume365 * 100) / 100;

    rows.push({
      code,
      name: nameMap[code] || code,
      description: nameMap[code] || '',
      daysSinceChange,
      currentPrice,
      suggestedPrice,
      delta,
      inflationPct,
      usage365: volume365,
      estimatedUplift,
    });
  }

  rows.sort((a, b) => b.estimatedUplift - a.estimatedUplift);

  const totalUplift = rows.reduce((s, r) => s + r.estimatedUplift, 0);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1a1a1a; margin: 0; padding: 0; }
  .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%); color: white; padding: 20px 25px; margin-bottom: 15px; border-radius: 4px; }
  .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 600; }
  .header p { margin: 0; font-size: 11px; opacity: 0.85; }
  .summary { display: flex; gap: 15px; margin-bottom: 15px; }
  .summary-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px 15px; flex: 1; }
  .summary-box .label { font-size: 8px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-box .value { font-size: 16px; font-weight: 700; color: #1e3a5f; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  thead th { background: #1e3a5f; color: white; padding: 6px 6px; text-align: left; font-weight: 600; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.right { text-align: right; }
  tbody td { padding: 4px 6px; border-bottom: 1px solid #e9ecef; }
  tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  .highlight { background: #fff3cd !important; font-weight: 600; }
  .footer { margin-top: 12px; font-size: 8px; color: #6c757d; text-align: center; border-top: 1px solid #dee2e6; padding-top: 8px; }
  .pos { color: #28a745; }
</style>
</head>
<body>
<div class="header">
  <h1>Inflation Price Adjustment Report</h1>
  <p>Rosslyn Veterinary Clinic &mdash; Generated ${now.toISOString().split('T')[0]} &mdash; Based on billing volume (est. last 12 months from SERVICE.V2$)</p>
</div>
<div class="summary">
  <div class="summary-box">
    <div class="label">Stale Prices (with recent usage)</div>
    <div class="value">${rows.length}</div>
  </div>
  <div class="summary-box">
    <div class="label">Estimated Annual Uplift</div>
    <div class="value">$${totalUplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
  <div class="summary-box">
    <div class="label">Inflation Source</div>
    <div class="value" style="font-size:11px">Statistics Canada CPI</div>
  </div>
  <div class="summary-box">
    <div class="label">Volume Period</div>
    <div class="value" style="font-size:11px">~Mar 2025 – Mar 2026</div>
  </div>
</div>
<table>
<thead>
<tr>
  <th>#</th>
  <th>Code</th>
  <th>Description</th>
  <th class="right">Days Since Change</th>
  <th class="right">Inflation %</th>
  <th class="right">Current Price</th>
  <th class="right">Suggested Price</th>
  <th class="right">Delta</th>
  <th class="right">Usage (365d)</th>
  <th class="right">Est. Uplift</th>
</tr>
</thead>
<tbody>
${rows.map((r, i) => {
  const cls = i < 5 ? ' class="highlight"' : '';
  return `<tr${cls}>
  <td>${i + 1}</td>
  <td><strong>${esc(r.code)}</strong></td>
  <td>${esc(r.description)}</td>
  <td class="right">${r.daysSinceChange.toLocaleString()}</td>
  <td class="right">${r.inflationPct.toFixed(1)}%</td>
  <td class="right">$${r.currentPrice.toFixed(2)}</td>
  <td class="right">$${r.suggestedPrice.toFixed(2)}</td>
  <td class="right pos">+$${r.delta.toFixed(2)}</td>
  <td class="right">${r.usage365}</td>
  <td class="right"><strong>$${r.estimatedUplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
</tr>`;
}).join('\n')}
</tbody>
</table>
<div class="footer">
  Avimark ETL &mdash; CPI rates: Statistics Canada (2013–2024), Bank of Canada forecast (2025–2026) &mdash; Usage from SERVICE.V2$ (last ~12 months, position-estimated)
</div>
</body>
</html>`;

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/inflation_report_v2.html', html);
  console.log('✅ HTML written to reports/inflation_report_v2.html');
  console.log(rows.length + ' rows, total uplift: $' + totalUplift.toFixed(2));
  
  // Also dump rows for verification
  for (const r of rows) {
    console.log(`${r.code.padEnd(14)} ${r.description.substring(0,30).padEnd(32)} ${r.daysSinceChange}d  ${r.inflationPct.toFixed(1)}%  $${r.currentPrice.toFixed(2).padStart(8)} → $${r.suggestedPrice.toFixed(2).padStart(8)}  +$${r.delta.toFixed(2).padStart(7)}  x${r.usage365.toString().padStart(4)} = $${r.estimatedUplift.toFixed(2).padStart(10)}`);
  }
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main().catch(err => { console.error(err); process.exit(1); });
