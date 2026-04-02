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
  const serviceVolume = JSON.parse(fs.readFileSync('reports/service_volumes.json', 'utf8'));

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
    .select('item_code, date_text, old_value, new_value')
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
    const change = lastChange[code];
    let lastChangeDate, yearsSinceChange, changeYear;
    if (change) {
      lastChangeDate = change.date;
      yearsSinceChange = (now - lastChangeDate) / (365.25 * 24 * 60 * 60 * 1000);
      changeYear = lastChangeDate.getFullYear();
    } else {
      yearsSinceChange = 10;
      changeYear = 2014;
      lastChangeDate = new Date(2014, 0, 1);
    }
    if (yearsSinceChange < 1) continue;

    const daysSinceChange = Math.round((now - lastChangeDate) / (24 * 60 * 60 * 1000));
    const inflationFactor = compoundInflation(changeYear);
    const suggestedPrice = Math.round(currentPrice * inflationFactor * 100) / 100;
    const delta = Math.round((suggestedPrice - currentPrice) * 100) / 100;
    if (delta <= 0.50) continue;

    const annualVolume = serviceVolume.annualCounts?.[code] || 0;
    const estimatedUplift = Math.round(delta * annualVolume * 100) / 100;

    rows.push({
      code,
      name: nameMap[code] || code,
      daysSinceChange,
      currentPrice,
      suggestedPrice,
      delta,
      annualVolume,
      estimatedUplift,
    });
  }

  rows.sort((a, b) => b.estimatedUplift - a.estimatedUplift);

  const totalUplift = rows.reduce((s, r) => s + r.estimatedUplift, 0);

  // Generate HTML
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 15mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1a1a1a; margin: 0; padding: 0; }
  .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%); color: white; padding: 20px 25px; margin-bottom: 15px; border-radius: 4px; }
  .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 600; }
  .header p { margin: 0; font-size: 11px; opacity: 0.85; }
  .summary { display: flex; gap: 20px; margin-bottom: 15px; }
  .summary-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px 15px; flex: 1; }
  .summary-box .label { font-size: 9px; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-box .value { font-size: 18px; font-weight: 700; color: #1e3a5f; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  thead th { background: #1e3a5f; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.right { text-align: right; }
  tbody td { padding: 4px 8px; border-bottom: 1px solid #e9ecef; }
  tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  tbody tr:hover { background: #e3f2fd; }
  .highlight { background: #fff3cd !important; font-weight: 600; }
  .footer { margin-top: 12px; font-size: 8px; color: #6c757d; text-align: center; border-top: 1px solid #dee2e6; padding-top: 8px; }
  .neg { color: #dc3545; }
  .pos { color: #28a745; }
</style>
</head>
<body>
<div class="header">
  <h1>Inflation Price Adjustment Report</h1>
  <p>Rosslyn Veterinary Clinic &mdash; Generated ${now.toISOString().split('T')[0]} &mdash; ${rows.length} stale prices identified</p>
</div>
<div class="summary">
  <div class="summary-box">
    <div class="label">Stale Prices</div>
    <div class="value">${rows.length}</div>
  </div>
  <div class="summary-box">
    <div class="label">Estimated Annual Uplift</div>
    <div class="value">$${totalUplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
  <div class="summary-box">
    <div class="label">Inflation Source</div>
    <div class="value" style="font-size:12px">Statistics Canada CPI</div>
  </div>
  <div class="summary-box">
    <div class="label">Volume Source</div>
    <div class="value" style="font-size:12px">SERVICE.V2$ (622K records)</div>
  </div>
</div>
<table>
<thead>
<tr>
  <th>#</th>
  <th>Code</th>
  <th>Service</th>
  <th class="right">Days Since Change</th>
  <th class="right">Current Price</th>
  <th class="right">Suggested Price</th>
  <th class="right">Delta</th>
  <th class="right">Usage/yr</th>
  <th class="right">Est. Uplift/yr</th>
</tr>
</thead>
<tbody>
${rows.map((r, i) => {
  const cls = i < 10 ? ' class="highlight"' : '';
  return `<tr${cls}>
  <td>${i + 1}</td>
  <td><strong>${esc(r.code)}</strong></td>
  <td>${esc(r.name)}</td>
  <td class="right">${r.daysSinceChange.toLocaleString()}</td>
  <td class="right">$${r.currentPrice.toFixed(2)}</td>
  <td class="right">$${r.suggestedPrice.toFixed(2)}</td>
  <td class="right pos">+$${r.delta.toFixed(2)}</td>
  <td class="right">${r.annualVolume.toLocaleString()}</td>
  <td class="right"><strong>$${r.estimatedUplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
</tr>`;
}).join('\n')}
</tbody>
</table>
<div class="footer">
  Avimark ETL &mdash; Inflation calculated using Statistics Canada CPI rates (2013&ndash;2026) &mdash; Volumes from SERVICE.V2$ over ~12.5 years annualized
</div>
</body>
</html>`;

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/inflation_report.html', html);
  console.log('✅ HTML written to reports/inflation_report.html');
  console.log(`${rows.length} rows, total uplift: $${totalUplift.toFixed(2)}`);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main().catch(err => { console.error(err); process.exit(1); });
