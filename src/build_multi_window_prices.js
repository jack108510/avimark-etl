#!/usr/bin/env node
/**
 * Build billing-derived prices over 3 windows: 90d, 180d, 365d.
 * For each code in each window: most-frequent positive charge = current price.
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
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) {
      if (k === 'gte') for (const [c, val] of Object.entries(v)) q = q.gte(c, val);
      if (k === 'gt') for (const [c, val] of Object.entries(v)) q = q.gt(c, val);
    }
    const { data, error } = await q;
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return all;
}

function windowCutoff(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

function pickDominant(records) {
  const counts = new Map();
  let total = 0;
  let revenue = 0;
  for (const r of records) {
    counts.set(r.amount, (counts.get(r.amount) || 0) + 1);
    total++;
    revenue += r.amount;
  }
  if (total === 0) return null;
  let bestAmt = 0, bestN = 0;
  for (const [a, n] of counts) if (n > bestN) { bestAmt = a; bestN = n; }
  return {
    price: bestAmt,
    confidence_pct: Math.round((bestN / total) * 1000) / 10,
    usage: total,
    revenue: Math.round(revenue * 100) / 100,
  };
}

async function main() {
  console.log('Loading services (positive amounts, last 365d)...');
  const cutoff365 = windowCutoff(365);
  const cutoff180 = windowCutoff(180);
  const cutoff90 = windowCutoff(90);
  console.log(`  90d cutoff: ${cutoff90}`);
  console.log(`  180d cutoff: ${cutoff180}`);
  console.log(`  365d cutoff: ${cutoff365}`);

  const services = await fetchAll('services', 'code,description,amount,service_date', {
    gte: { service_date: cutoff365 },
    gt: { amount: 0 },
  });
  console.log(`  Loaded ${services.length} positive charges in last 365d`);

  // Group by code and window
  const byCode = new Map();
  const descCounts = new Map();
  for (const s of services) {
    if (!s.code) continue;
    if (!byCode.has(s.code)) byCode.set(s.code, { d90: [], d180: [], d365: [] });
    const b = byCode.get(s.code);
    b.d365.push(s);
    if (s.service_date >= cutoff180) b.d180.push(s);
    if (s.service_date >= cutoff90) b.d90.push(s);

    if (s.description) {
      if (!descCounts.has(s.code)) descCounts.set(s.code, new Map());
      const m = descCounts.get(s.code);
      m.set(s.description, (m.get(s.description) || 0) + 1);
    }
  }

  const descMap = new Map();
  for (const [code, m] of descCounts) {
    let best = '', bestN = 0;
    for (const [d, n] of m) if (n > bestN) { best = d; bestN = n; }
    descMap.set(code, best);
  }

  // Build rows
  const rows = [];
  for (const [code, buckets] of byCode) {
    const p90 = pickDominant(buckets.d90);
    const p180 = pickDominant(buckets.d180);
    const p365 = pickDominant(buckets.d365);
    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      price_90d: p90?.price ?? null,
      confidence_90d_pct: p90?.confidence_pct ?? null,
      usage_90d: p90?.usage ?? 0,
      price_180d: p180?.price ?? null,
      confidence_180d_pct: p180?.confidence_pct ?? null,
      usage_180d: p180?.usage ?? 0,
      price_365d: p365?.price ?? null,
      confidence_365d_pct: p365?.confidence_pct ?? null,
      usage_365d: p365?.usage ?? 0,
      revenue_365d: p365?.revenue ?? 0,
      price_drifted: (p90 && p365 && p90.price !== p365.price),
    });
  }
  rows.sort((a, b) => b.revenue_365d - a.revenue_365d);

  console.log(`\nBuilt ${rows.length} codes with billing-derived prices.`);
  const drifted = rows.filter(r => r.price_drifted).length;
  console.log(`${drifted} codes where 90d price ≠ 365d price (recent change or low volume)`);

  console.log('\n=== Top 20 codes by 365d revenue ===');
  console.log('CODE      | 90d    | 180d   | 365d   | conf90 | uses | rev     | desc');
  console.log('-'.repeat(110));
  for (const r of rows.slice(0, 20)) {
    const drift = r.price_drifted ? '🔄' : '  ';
    const desc = (r.description || '').substring(0, 35);
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.price_90d ?? 'n/a').padEnd(6)}` +
      `| $${String(r.price_180d ?? 'n/a').padEnd(6)}` +
      `| $${String(r.price_365d ?? 'n/a').padEnd(6)}` +
      `| ${String(r.confidence_90d_pct ?? '').padStart(5)}% ` +
      `| ${String(r.usage_365d).padStart(4)} ` +
      `| $${String(r.revenue_365d).padEnd(7)}` +
      ` ${drift} ${desc}`
    );
  }

  // Save CSV
  const csv = [
    'treatment_code,description,price_90d,confidence_90d_pct,usage_90d,price_180d,confidence_180d_pct,usage_180d,price_365d,confidence_365d_pct,usage_365d,revenue_365d,price_drifted'
  ];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([
      r.treatment_code, `"${desc}"`, r.price_90d, r.confidence_90d_pct, r.usage_90d,
      r.price_180d, r.confidence_180d_pct, r.usage_180d,
      r.price_365d, r.confidence_365d_pct, r.usage_365d, r.revenue_365d, r.price_drifted
    ].join(','));
  }
  fs.writeFileSync('prices_multi_window.csv', csv.join('\n'));
  console.log('\n✅ Saved prices_multi_window.csv');

  // Also save JSON
  fs.writeFileSync('prices_multi_window.json', JSON.stringify(rows, null, 2));
  console.log('✅ Saved prices_multi_window.json');

  // Show some drifted codes
  console.log('\n=== Codes with recent price drift (90d ≠ 365d, high usage) ===');
  const drifts = rows.filter(r => r.price_drifted && r.usage_90d >= 10).slice(0, 15);
  for (const r of drifts) {
    console.log(`  ${r.treatment_code.padEnd(9)} $${r.price_365d} → $${r.price_90d} | 90d uses: ${r.usage_90d} | ${(r.description||'').substring(0,40)}`);
  }
}

main().catch(e => console.error(e));
