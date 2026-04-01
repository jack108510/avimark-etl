import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Canada CPI annual inflation rates (Stats Canada)
const CANADA_CPI = {
  2013: 0.91, 2014: 1.96, 2015: 1.13, 2016: 1.43, 2017: 1.60,
  2018: 2.27, 2019: 1.95, 2020: 0.72, 2021: 3.40, 2022: 6.80,
  2023: 3.88, 2024: 2.95, 2025: 2.40, 2026: 2.20,
};

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

function compoundInflation(fromYear, toYear = 2026) {
  let factor = 1.0;
  for (let y = fromYear; y < toYear; y++) {
    factor *= (1 + (CANADA_CPI[y] || 2.0) / 100);
  }
  return factor;
}

function inflationBreakdown(fromYear, toYear = 2026) {
  const years = [];
  let cumulative = 1.0;
  for (let y = fromYear; y < toYear; y++) {
    const rate = CANADA_CPI[y] || 2.0;
    cumulative *= (1 + rate / 100);
    years.push({ year: y, rate, cumulative: Math.round((cumulative - 1) * 10000) / 100 });
  }
  return years;
}

async function main() {
  // 1. Get current prices — take the MAX price per code (current fee schedule)
  const { data: allPrices } = await sb.from('prices').select('treatment_code, price');
  const currentPrice = {};
  for (const p of allPrices || []) {
    if (!currentPrice[p.treatment_code] || p.price > currentPrice[p.treatment_code]) {
      currentPrice[p.treatment_code] = p.price;
    }
  }

  // 2. Get treatment names
  const { data: treatments } = await sb.from('treatments').select('code, name');
  const nameMap = {};
  for (const t of treatments || []) nameMap[t.code] = t.name;

  // 2b. FILTER will happen after serviceVolume is loaded (see below)

  // 3. Get real price changes (old > 0, new > 0, different)
  //    These represent the last time someone ACTUALLY changed the invoiced amount
  //    We use this as a proxy for when the fee schedule was last touched
  let auditAll = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('audit_log')
      .select('item_code, date_text, old_value, new_value')
      .eq('category', 'price_change')
      .gt('new_value', 0)
      .gt('old_value', 0)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    auditAll = auditAll.concat(data);
    from += data.length;
    if (data.length < 1000) break;
  }

  // Find last REAL change per code (not zeroing out)
  const lastChange = {};
  for (const a of auditAll) {
    if (!a.item_code || a.old_value === a.new_value || a.new_value < 0) continue;
    const d = parseDate(a.date_text);
    if (!d || isNaN(d.getTime())) continue;
    if (!lastChange[a.item_code] || d > lastChange[a.item_code].date) {
      lastChange[a.item_code] = { date: d, old: a.old_value, new: a.new_value };
    }
  }

  // 4. Load service volumes
  let serviceVolume = { annualCounts: {}, annualRevenue: {} };
  if (fs.existsSync('reports/service_volumes.json')) {
    serviceVolume = JSON.parse(fs.readFileSync('reports/service_volumes.json', 'utf8'));
  }

  // 4b. FILTER: Services only — exclude inventory items
  const { data: itemList } = await sb.from('items').select('code');
  const itemCodes = new Set((itemList || []).map(i => i.code));
  const serviceBilledCodes = new Set(Object.keys(serviceVolume.counts || {}));
  const treatCodes = new Set((treatments || []).map(t => t.code));

  let filtered = 0;
  for (const code of Object.keys(currentPrice)) {
    if (itemCodes.has(code)) { delete currentPrice[code]; filtered++; continue; }
    if (!treatCodes.has(code) && !serviceBilledCodes.has(code)) { delete currentPrice[code]; filtered++; }
  }
  console.log('Filtered out ' + filtered + ' non-service codes. Remaining: ' + Object.keys(currentPrice).length);

  // 5. Build report items
  const now = new Date();
  const items = [];

  for (const [code, price] of Object.entries(currentPrice)) {
    if (price <= 0) continue;

    const change = lastChange[code];
    let changeYear, changeDate;

    if (change) {
      changeDate = change.date;
      changeYear = change.date.getFullYear();
    } else {
      // No audit record — skip, we can't determine staleness
      continue;
    }

    const yearsSince = (now - changeDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsSince < 1) continue; // Changed within last year, skip

    const factor = compoundInflation(changeYear);
    const suggested = Math.round(price * factor * 100) / 100;
    const gap = Math.round((suggested - price) * 100) / 100;
    if (gap <= 0.50) continue;

    const annualVol = serviceVolume.annualCounts?.[code] || 0;
    const lostPerYear = Math.round(gap * annualVol * 100) / 100;
    const breakdown = inflationBreakdown(changeYear);

    items.push({
      code,
      name: nameMap[code] || code,
      currentPrice: price,
      lastChanged: changeDate.toISOString().split('T')[0],
      changeYear,
      yearsSince: Math.round(yearsSince * 10) / 10,
      inflationFactor: Math.round((factor - 1) * 10000) / 100,
      suggestedPrice: suggested,
      gap,
      annualVolume: annualVol,
      lostPerYear,
      breakdown,
    });
  }

  items.sort((a, b) => b.lostPerYear - a.lostPerYear || b.gap - a.gap);

  // 6. Generate HTML for PDF
  const totalLost = items.reduce((s, i) => s + i.lostPerYear, 0);
  const totalItems = items.length;

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Inflation Report — Rosslyn Veterinary Clinic</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; font-size: 11px; }
  h1 { color: #1a5276; margin-bottom: 5px; font-size: 22px; }
  h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px; font-size: 16px; margin-top: 30px; }
  h3 { color: #34495e; font-size: 13px; margin-top: 20px; }
  .subtitle { color: #7f8c8d; font-size: 13px; margin-bottom: 20px; }
  .summary-box { background: #eaf2f8; border-left: 4px solid #3498db; padding: 15px 20px; margin: 20px 0; }
  .summary-box .big { font-size: 28px; font-weight: bold; color: #1a5276; }
  .methodology { background: #fef9e7; border-left: 4px solid #f1c40f; padding: 12px 16px; margin: 15px 0; font-size: 10px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10px; }
  th { background: #2c3e50; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f8f9fa; }
  .right { text-align: right; }
  .green { color: #27ae60; }
  .red { color: #c0392b; }
  .small { font-size: 9px; color: #7f8c8d; }
  .cpi-table { font-size: 9px; }
  .cpi-table td { padding: 3px 6px; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #999; }
</style>
</head>
<body>

<h1>🏥 Inflation Adjustment Report</h1>
<div class="subtitle">Rosslyn Veterinary Clinic — Generated ${now.toISOString().split('T')[0]}</div>

<div class="summary-box">
  <div class="big">$${totalLost.toLocaleString('en-CA', {minimumFractionDigits: 2})}</div>
  <div>Estimated annual revenue gap from ${totalItems} stale prices (not adjusted for CPI inflation)</div>
</div>

<div class="methodology">
  <strong>Methodology:</strong> Each service's current fee was compared against its last known price change date (from the Avimark audit trail).
  Canada CPI inflation rates (Statistics Canada) were compounded year-over-year from the change year to 2026 to calculate
  what the price <em>should</em> be today. Services changed within the last 12 months are excluded.
  Annual volume is estimated from ${(serviceVolume.counts ? Object.values(serviceVolume.counts).reduce((a,b)=>a+b,0) : 0).toLocaleString()} historical billing records over ~12.5 years.
</div>

<h2>📊 Canada CPI Inflation Reference</h2>
<table class="cpi-table">
<tr><th>Year</th>${Object.keys(CANADA_CPI).map(y => `<th>${y}</th>`).join('')}</tr>
<tr><td><strong>CPI %</strong></td>${Object.values(CANADA_CPI).map(v => `<td>${v}%</td>`).join('')}</tr>
</table>

<h2>💰 Top Opportunities (by estimated annual lost revenue)</h2>
<table>
<tr>
  <th>Code</th><th>Service</th><th class="right">Current</th><th class="right">Suggested</th>
  <th class="right">Gap</th><th>Last Changed</th><th class="right">CPI Since</th>
  <th class="right">Vol/yr</th><th class="right">Lost/yr</th>
</tr>`;

  for (const item of items.filter(i => i.annualVolume > 0).slice(0, 50)) {
    html += `
<tr>
  <td><strong>${item.code}</strong></td>
  <td>${item.name}</td>
  <td class="right">$${item.currentPrice.toFixed(2)}</td>
  <td class="right green">$${item.suggestedPrice.toFixed(2)}</td>
  <td class="right red">+$${item.gap.toFixed(2)}</td>
  <td>${item.lastChanged}</td>
  <td class="right">${item.inflationFactor.toFixed(1)}%</td>
  <td class="right">${item.annualVolume}</td>
  <td class="right"><strong>$${item.lostPerYear.toFixed(2)}</strong></td>
</tr>`;
  }

  html += `</table>`;

  // Detail pages for top 10
  const top10 = items.filter(i => i.annualVolume > 0).slice(0, 10);
  if (top10.length > 0) {
    html += `<div class="page-break"></div>
<h2>📋 Detailed Breakdown — Top 10 Items</h2>
<p>Year-by-year CPI compounding from last price change to present.</p>`;

    for (const item of top10) {
      html += `
<h3>${item.code} — ${item.name}</h3>
<p>Current: <strong>$${item.currentPrice.toFixed(2)}</strong> | Last changed: <strong>${item.lastChanged}</strong> | Suggested: <strong class="green">$${item.suggestedPrice.toFixed(2)}</strong></p>
<table class="cpi-table">
<tr><th>Year</th><th class="right">CPI Rate</th><th class="right">Cumulative Inflation</th><th class="right">Price If Adjusted</th></tr>`;
      for (const yr of item.breakdown) {
        const adjPrice = (item.currentPrice * (1 + yr.cumulative / 100)).toFixed(2);
        html += `<tr><td>${yr.year}→${yr.year+1}</td><td class="right">${yr.rate}%</td><td class="right">${yr.cumulative}%</td><td class="right">$${adjPrice}</td></tr>`;
      }
      html += `</table>`;
    }
  }

  // All stale items
  html += `<div class="page-break"></div>
<h2>📑 Complete Stale Price List (${items.length} items)</h2>
<table>
<tr>
  <th>Code</th><th>Service</th><th class="right">Current</th><th class="right">Suggested</th>
  <th class="right">Gap</th><th>Last Changed</th><th class="right">Years Stale</th>
</tr>`;

  for (const item of items) {
    html += `
<tr>
  <td>${item.code}</td>
  <td>${item.name.substring(0, 45)}</td>
  <td class="right">$${item.currentPrice.toFixed(2)}</td>
  <td class="right">$${item.suggestedPrice.toFixed(2)}</td>
  <td class="right">+$${item.gap.toFixed(2)}</td>
  <td>${item.lastChanged}</td>
  <td class="right">${item.yearsSince} yr</td>
</tr>`;
  }

  html += `</table>

<div class="footer">
  Generated by Avimark ETL — ${now.toISOString()} | Data source: Avimark V2$ files (PRICE.V2$, AUDIT.V2$, TREAT.V2$, SERVICE.V2$)<br>
  CPI data: Statistics Canada Consumer Price Index | Estimates based on historical billing volumes
</div>

</body></html>`;

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/inflation_report.html', html);
  console.log('HTML report saved: reports/inflation_report.html');
  console.log('Total stale items: ' + items.length);
  console.log('Total estimated lost revenue: $' + totalLost.toFixed(2));
  console.log('Items with volume data: ' + items.filter(i => i.annualVolume > 0).length);
}

main().catch(e => { console.error(e); process.exit(1); });
