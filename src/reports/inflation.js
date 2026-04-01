#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Canada CPI annual inflation rates (Stats Canada)
// https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes/consumer_price_indexes
const CANADA_CPI = {
  2013: 0.91,
  2014: 1.96,
  2015: 1.13,
  2016: 1.43,
  2017: 1.60,
  2018: 2.27,
  2019: 1.95,
  2020: 0.72,
  2021: 3.40,
  2022: 6.80,
  2023: 3.88,
  2024: 2.95,
  2025: 2.40, // Bank of Canada forecast
  2026: 2.20, // forecast
};

/**
 * Parse the audit date formats into a JS Date.
 * Formats: "09-28-13", "28/09/2013", "03-13-26"
 */
function parseAuditDate(dateStr) {
  if (!dateStr) return null;

  // MM-DD-YY format
  let m = dateStr.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    let year = parseInt(m[3]);
    year = year >= 50 ? 1900 + year : 2000 + year;
    return new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
  }

  // DD/MM/YYYY format
  m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  }

  return null;
}

/**
 * Calculate compounded inflation from a start year to 2026.
 */
function compoundInflation(fromYear, toYear = 2026) {
  let factor = 1.0;
  for (let y = fromYear; y < toYear; y++) {
    const rate = CANADA_CPI[y] || 2.0; // default 2% if unknown
    factor *= (1 + rate / 100);
  }
  return factor;
}

async function generateInflationReport() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Avimark Inflation Report — Rosslyn Vet Clinic     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. Get all current prices with treatment names
  const { data: priceList, error: priceErr } = await sb
    .from('prices')
    .select('treatment_code, price');
  if (priceErr) throw new Error('Failed to fetch prices: ' + priceErr.message);

  // Build price map (keep highest if multiple entries per code)
  const priceMap = {};
  for (const p of priceList) {
    if (!priceMap[p.treatment_code] || p.price > priceMap[p.treatment_code]) {
      priceMap[p.treatment_code] = p.price;
    }
  }

  // 2. Get treatment names
  const { data: treatments } = await sb.from('treatments').select('code, name');
  const nameMap = {};
  for (const t of treatments || []) {
    nameMap[t.code] = t.name;
  }

  // 3. Get all AUD01 price changes to find LAST change date per code
  const { data: auditData, error: auditErr } = await sb
    .from('audit_log')
    .select('item_code, date_text, old_value, new_value')
    .eq('category', 'price_change')
    .order('date_text', { ascending: false });
  if (auditErr) throw new Error('Failed to fetch audit: ' + auditErr.message);

  // Find last change date per treatment code
  const lastChange = {};
  for (const a of auditData) {
    if (!a.item_code) continue;
    const d = parseAuditDate(a.date_text);
    if (!d) continue;
    if (!lastChange[a.item_code] || d > lastChange[a.item_code].date) {
      lastChange[a.item_code] = {
        date: d,
        dateStr: a.date_text,
        oldValue: a.old_value,
        newValue: a.new_value,
      };
    }
  }

  // 4. Get AUD02 charge entries from last year to estimate volume
  // Count how many times each code was billed
  const { data: charges } = await sb
    .from('audit_log')
    .select('item_code, new_value')
    .eq('category', 'charge');

  const chargeCount = {};
  const chargeRevenue = {};
  for (const c of charges || []) {
    if (!c.item_code) continue;
    chargeCount[c.item_code] = (chargeCount[c.item_code] || 0) + 1;
    chargeRevenue[c.item_code] = (chargeRevenue[c.item_code] || 0) + (c.new_value || 0);
  }

  // 5. Build the report
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const staleItems = [];

  for (const [code, currentPrice] of Object.entries(priceMap)) {
    const change = lastChange[code];
    let lastChangeDate, yearsSinceChange, changeYear;

    if (change) {
      lastChangeDate = change.date;
      yearsSinceChange = (now - lastChangeDate) / (365.25 * 24 * 60 * 60 * 1000);
      changeYear = lastChangeDate.getFullYear();
    } else {
      // No audit record = probably never changed, assume very old
      yearsSinceChange = 10;
      changeYear = 2014;
      lastChangeDate = new Date(2014, 0, 1);
    }

    if (yearsSinceChange < 1) continue; // Changed recently, skip

    const inflationFactor = compoundInflation(changeYear);
    const inflationAdjustedPrice = Math.round(currentPrice * inflationFactor * 100) / 100;
    const priceDifference = Math.round((inflationAdjustedPrice - currentPrice) * 100) / 100;

    // Estimate annual volume (rough — total charges / years of data * recent weighting)
    const totalCharges = chargeCount[code] || 0;
    const dataYears = 12.5; // 2013-2026
    const estimatedAnnualVolume = Math.round(totalCharges / dataYears);

    const estimatedLostRevenue = Math.round(priceDifference * estimatedAnnualVolume * 100) / 100;

    if (priceDifference > 0.50) { // Only show meaningful differences
      staleItems.push({
        code,
        name: nameMap[code] || code,
        currentPrice,
        lastChanged: lastChangeDate.toISOString().split('T')[0],
        yearsSinceChange: Math.round(yearsSinceChange * 10) / 10,
        changeYear,
        inflationFactor: Math.round((inflationFactor - 1) * 10000) / 100, // as percentage
        suggestedPrice: inflationAdjustedPrice,
        priceDifference,
        estimatedAnnualVolume,
        estimatedLostRevenue,
      });
    }
  }

  // Sort by lost revenue (biggest opportunities first)
  staleItems.sort((a, b) => b.estimatedLostRevenue - a.estimatedLostRevenue);

  // 6. Print the report
  console.log(`Prices not updated in 1+ year: ${staleItems.length}`);
  console.log(`Analysis date: ${now.toISOString().split('T')[0]}`);
  console.log(`Inflation source: Statistics Canada CPI\n`);

  // Summary
  const totalLostRevenue = staleItems.reduce((s, i) => s + i.estimatedLostRevenue, 0);
  const totalPriceGap = staleItems.reduce((s, i) => s + i.priceDifference, 0);
  console.log('━'.repeat(60));
  console.log(`💰 TOTAL ESTIMATED ANNUAL LOST REVENUE: $${totalLostRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`);
  console.log('━'.repeat(60));
  console.log('');

  // Top opportunities
  console.log('TOP 25 INFLATION-ADJUSTMENT OPPORTUNITIES');
  console.log('(sorted by estimated annual lost revenue)\n');

  console.log(
    'Code'.padEnd(10) +
    'Service'.padEnd(40) +
    'Current'.padStart(10) +
    'Suggested'.padStart(10) +
    'Gap'.padStart(8) +
    'CPI%'.padStart(8) +
    'Vol/yr'.padStart(8) +
    'Lost$/yr'.padStart(12)
  );
  console.log('─'.repeat(106));

  for (const item of staleItems.slice(0, 25)) {
    console.log(
      item.code.padEnd(10) +
      item.name.substring(0, 38).padEnd(40) +
      ('$' + item.currentPrice.toFixed(2)).padStart(10) +
      ('$' + item.suggestedPrice.toFixed(2)).padStart(10) +
      ('+$' + item.priceDifference.toFixed(2)).padStart(8) +
      (item.inflationFactor.toFixed(1) + '%').padStart(8) +
      item.estimatedAnnualVolume.toString().padStart(8) +
      ('$' + item.estimatedLostRevenue.toFixed(2)).padStart(12)
    );
  }

  // Detailed breakdown
  console.log('\n\nFULL STALE PRICE LIST (' + staleItems.length + ' items)');
  console.log('Last changed > 1 year ago\n');

  const byAge = {};
  for (const item of staleItems) {
    const bucket = item.yearsSinceChange >= 5 ? '5+ years' :
                   item.yearsSinceChange >= 3 ? '3-5 years' :
                   item.yearsSinceChange >= 2 ? '2-3 years' : '1-2 years';
    if (!byAge[bucket]) byAge[bucket] = [];
    byAge[bucket].push(item);
  }

  for (const [bucket, items] of Object.entries(byAge)) {
    const bucketLost = items.reduce((s, i) => s + i.estimatedLostRevenue, 0);
    console.log(`\n📅 ${bucket} (${items.length} items, ~$${bucketLost.toFixed(2)} lost/yr)`);
    for (const item of items.slice(0, 10)) {
      console.log(`  ${item.code.padEnd(10)} ${item.name.substring(0, 35).padEnd(37)} $${item.currentPrice.toFixed(2).padStart(8)} → $${item.suggestedPrice.toFixed(2).padStart(8)}  (last: ${item.lastChanged})`);
    }
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`);
  }

  // CSV export
  const csvLines = ['Code,Service,Current Price,Last Changed,Years Stale,CPI Inflation %,Suggested Price,Price Gap,Est Annual Volume,Est Lost Revenue/Year'];
  for (const item of staleItems) {
    csvLines.push([
      item.code,
      '"' + (item.name || '').replace(/"/g, '""') + '"',
      item.currentPrice.toFixed(2),
      item.lastChanged,
      item.yearsSinceChange.toFixed(1),
      item.inflationFactor.toFixed(1),
      item.suggestedPrice.toFixed(2),
      item.priceDifference.toFixed(2),
      item.estimatedAnnualVolume,
      item.estimatedLostRevenue.toFixed(2),
    ].join(','));
  }

  const csvPath = 'reports/inflation_report.csv';
  const fs = await import('fs');
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`\n\n📄 CSV exported: ${csvPath}`);
  console.log('Open in Excel/Sheets to sort, filter, and share with the team.');
}

generateInflationReport().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
