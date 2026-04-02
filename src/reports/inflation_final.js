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

function compoundInflation(fromYear, toYear = 2026) {
  let factor = 1.0;
  for (let y = fromYear; y < toYear; y++) {
    factor *= (1 + (CANADA_CPI[y] || 2.0) / 100);
  }
  return factor;
}

async function main() {
  // Load price dates from PRICE.V2$ (actual last-modified timestamps)
  const priceDateData = JSON.parse(fs.readFileSync('reports/price_dates.json', 'utf8'));
  
  // Load real 365-day volumes from SERVICE @21 TDateTime
  const volumeData = JSON.parse(fs.readFileSync('reports/real_volumes_v2.json', 'utf8'));

  // Get actual prices from Supabase (these are correctly parsed)
  const { data: priceList } = await sb.from('prices').select('treatment_code, price');
  const priceMap = {};
  for (const p of priceList) {
    if (!priceMap[p.treatment_code] || p.price > priceMap[p.treatment_code]) {
      priceMap[p.treatment_code] = p.price;
    }
  }

  // Get treatment names
  const { data: treatments } = await sb.from('treatments').select('code, name');
  const nameMap = {};
  for (const t of treatments || []) nameMap[t.code] = t.name;

  const now = new Date();
  const rows = [];

  for (const [code, currentPrice] of Object.entries(priceMap)) {
    if (currentPrice <= 0) continue;

    const volume = volumeData.counts?.[code] || 0;
    if (volume <= 0) continue;

    // Get last-modified date from PRICE.V2$
    const priceInfo = priceDateData[code];
    let lastModified = null;
    let changeYear = 2014; // default if unknown
    
    if (priceInfo?.lastModified) {
      lastModified = new Date(priceInfo.lastModified);
      changeYear = lastModified.getFullYear();
    }
    
    const daysSinceChange = lastModified 
      ? Math.round((now - lastModified) / (24 * 60 * 60 * 1000))
      : null;

    // Only include if price hasn't been modified in > 1 year
    if (daysSinceChange !== null && daysSinceChange < 365) continue;
    if (daysSinceChange === null) continue; // skip if no date at all

    const inflationFactor = compoundInflation(changeYear);
    const inflationPct = Math.round((inflationFactor - 1) * 10000) / 100;
    const suggestedPrice = Math.round(currentPrice * inflationFactor * 100) / 100;
    const delta = Math.round((suggestedPrice - currentPrice) * 100) / 100;
    if (delta <= 0) continue;

    rows.push({
      code,
      name: nameMap[code] || '',
      daysSinceChange,
      lastModified: lastModified.toISOString().split('T')[0],
      inflationPct,
      currentPrice,
      suggestedPrice,
      delta,
      usage: volume,
      uplift: Math.round(delta * volume * 100) / 100,
    });
  }

  rows.sort((a, b) => b.uplift - a.uplift);
  const totalUplift = rows.reduce((s, r) => s + r.uplift, 0);

  console.log(`${rows.length} stale-priced services with last-year usage`);
  console.log(`Total estimated annual uplift: $${totalUplift.toFixed(2)}\n`);

  for (const r of rows.slice(0, 20)) {
    console.log(`${r.code.padEnd(14)} ${r.name.substring(0,30).padEnd(32)} last: ${r.lastModified}  ${r.daysSinceChange}d  ${r.inflationPct.toFixed(1)}%  $${r.currentPrice.toFixed(2).padStart(8)} → $${r.suggestedPrice.toFixed(2).padStart(8)}  +$${r.delta.toFixed(2).padStart(7)}  x${r.usage.toString().padStart(4)} = $${r.uplift.toFixed(2).padStart(10)}`);
  }

  // HTML report
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
  thead th { background: #1e3a5f; color: white; padding: 6px 6px; text-align: left; font-weight: 600; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.3px; position: sticky; top: 0; }
  thead th.right { text-align: right; }
  tbody td { padding: 4px 6px; border-bottom: 1px solid #e9ecef; }
  tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f8f9fa; }
  .highlight { background: #fff3cd !important; }
  .footer { margin-top: 12px; font-size: 8px; color: #6c757d; text-align: center; border-top: 1px solid #dee2e6; padding-top: 8px; }
  .pos { color: #28a745; }
</style>
</head>
<body>
<div class="header">
  <h1>Inflation Price Adjustment Report</h1>
  <p>Rosslyn Veterinary Clinic &mdash; Generated ${now.toISOString().split('T')[0]} &mdash; Prices not updated in 1+ year, with real 365-day billing volumes</p>
</div>
<div class="summary">
  <div class="summary-box">
    <div class="label">Stale Prices (with usage)</div>
    <div class="value">${rows.length}</div>
  </div>
  <div class="summary-box">
    <div class="label">Estimated Annual Uplift</div>
    <div class="value">$${totalUplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
  <div class="summary-box">
    <div class="label">Price Dates Source</div>
    <div class="value" style="font-size:11px">PRICE.V2$ TDateTime</div>
  </div>
  <div class="summary-box">
    <div class="label">Volume Period</div>
    <div class="value" style="font-size:11px">${volumeData.cutoffDate} – ${volumeData.generatedDate}</div>
  </div>
</div>
<table>
<thead>
<tr>
  <th>#</th>
  <th>Code</th>
  <th>Description</th>
  <th class="right">Days Since Change</th>
  <th class="right">Last Modified</th>
  <th class="right">Inflation %</th>
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
  <td class="right">${r.lastModified}</td>
  <td class="right">${r.inflationPct.toFixed(1)}%</td>
  <td class="right">$${r.currentPrice.toFixed(2)}</td>
  <td class="right">$${r.suggestedPrice.toFixed(2)}</td>
  <td class="right pos">+$${r.delta.toFixed(2)}</td>
  <td class="right">${r.usage}</td>
  <td class="right"><strong>$${r.uplift.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
</tr>`;
}).join('\n')}
</tbody>
</table>
<div class="footer">
  Avimark ETL &mdash; CPI: Statistics Canada (2013–2024) + Bank of Canada forecast (2025–2026) &mdash; Price dates from PRICE.V2$ embedded TDateTime &mdash; Volumes: SERVICE.V2$ @21 TDateTime, last 365 days (${volumeData.totalInRange?.toLocaleString()} line items)
</div>
</body>
</html>`;

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/inflation_final.html', html);
  console.log('\n✅ HTML written to reports/inflation_final.html');
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main().catch(err => { console.error(err); process.exit(1); });
