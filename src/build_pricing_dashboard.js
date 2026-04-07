#!/usr/bin/env node
/**
 * Build pricing_dashboard table from prices, services, and purchase_orders.
 * Uses billing-based pricing (most-frequent charge in 365d) as current_price.
 * Keeps fee_schedule_price and last_changed from PRICE.V2$ for reference.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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
      if (k === 'neq') for (const [col, val] of Object.entries(v)) query = query.neq(col, val);
    }
    const { data, error } = await query;
    if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    offset += PAGE;
    if (data.length < PAGE) break;
    if (offset % 10000 === 0) process.stdout.write(`  ${table}: ${offset} rows...\r`);
  }
  console.log(`  ${table}: ${all.length} rows loaded`);
  return all;
}

async function main() {
  console.log('Building pricing dashboard (billing-based)...\n');
  console.log('Loading data from Supabase...');

  // 1. Load prices (fee schedule)
  const prices = await fetchAll('prices', 'treatment_code,price,last_changed');

  // 2. Load services
  console.log('  services: loading (this will take a minute)...');
  const services = await fetchAll('services', 'code,description,amount,service_date');

  // 3. Load PO line items with costs
  const poItems = await fetchAll('purchase_orders', 'item_code,cost', {
    eq: { record_type: 'line_item' },
    not_null: ['cost', 'item_code'],
    gt: { cost: 0 },
  });

  console.log('\nProcessing...');

  // --- Fee schedule price per treatment code (most recent last_changed) ---
  const feeMap = new Map();
  for (const p of prices) {
    const existing = feeMap.get(p.treatment_code);
    if (!existing || (p.last_changed && (!existing.last_changed || p.last_changed > existing.last_changed))) {
      feeMap.set(p.treatment_code, p);
    }
  }
  console.log(`  ${feeMap.size} unique treatment codes in fee schedule`);

  // --- 365-day cutoff ---
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().replace('T', ' ').substring(0, 19);

  // --- Most common description per code ---
  const descCounts = new Map();
  for (const s of services) {
    if (!s.code || !s.description) continue;
    if (!descCounts.has(s.code)) descCounts.set(s.code, new Map());
    const counts = descCounts.get(s.code);
    counts.set(s.description, (counts.get(s.description) || 0) + 1);
  }
  const descMap = new Map();
  for (const [code, counts] of descCounts) {
    let best = '', bestN = 0;
    for (const [desc, n] of counts) {
      if (n > bestN) { best = desc; bestN = n; }
    }
    descMap.set(code, best);
  }

  // --- Billing-based price: most-frequent positive charge in last 365 days ---
  const billingCounts = new Map(); // code -> Map<amount, count>
  const usageMap = new Map();      // code -> { count, revenue }
  
  for (const s of services) {
    if (!s.code) continue;
    
    // Only use last 365 days for billing price AND usage
    if (!s.service_date || s.service_date < cutoffStr) continue;
    
    // Usage tracking
    if (!usageMap.has(s.code)) usageMap.set(s.code, { count: 0, revenue: 0 });
    const u = usageMap.get(s.code);
    u.count++;
    if (s.amount > 0) u.revenue += s.amount;
    
    // Billing price: only positive amounts
    if (s.amount > 0) {
      if (!billingCounts.has(s.code)) billingCounts.set(s.code, new Map());
      const counts = billingCounts.get(s.code);
      counts.set(s.amount, (counts.get(s.amount) || 0) + 1);
    }
  }
  
  const billingPriceMap = new Map();
  for (const [code, counts] of billingCounts) {
    let bestAmt = 0, bestN = 0;
    for (const [amt, n] of counts) {
      if (n > bestN) { bestAmt = amt; bestN = n; }
    }
    billingPriceMap.set(code, { price: bestAmt, confidence: bestN });
  }
  console.log(`  ${billingPriceMap.size} codes with billing-based prices`);

  // --- Avg cost from POs ---
  const costAgg = new Map();
  for (const po of poItems) {
    if (!po.item_code || !po.cost) continue;
    if (!costAgg.has(po.item_code)) costAgg.set(po.item_code, { sum: 0, count: 0 });
    const c = costAgg.get(po.item_code);
    c.sum += po.cost;
    c.count++;
  }
  const costMap = new Map();
  for (const [code, agg] of costAgg) {
    costMap.set(code, Math.round((agg.sum / agg.count) * 100) / 100);
  }

  // --- Build dashboard rows ---
  // Include all codes that appear in either fee schedule OR billing
  const allCodes = new Set([...feeMap.keys(), ...billingPriceMap.keys()]);
  const rows = [];

  for (const code of allCodes) {
    const fee = feeMap.get(code);
    const billing = billingPriceMap.get(code);
    const usage = usageMap.get(code) || { count: 0, revenue: 0 };
    const avgCost = costMap.get(code) || null;

    const currentPrice = billing ? billing.price : (fee ? fee.price : 0);
    const feeSchedulePrice = fee ? fee.price : null;
    const lastChanged = fee ? fee.last_changed : null;
    
    const markupPct = avgCost && avgCost > 0 && currentPrice > 0
      ? Math.round(((currentPrice - avgCost) / avgCost * 100) * 10) / 10
      : null;

    // Flag if fee schedule and billing disagree
    const priceMismatch = feeSchedulePrice !== null && billing
      && Math.abs(feeSchedulePrice - billing.price) > 0.01;

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      current_price: currentPrice,
      fee_schedule_price: feeSchedulePrice,
      last_changed: lastChanged || null,
      avg_cost: avgCost,
      markup_pct: markupPct,
      price_with_5pct_increase: Math.round(currentPrice * 1.05 * 100) / 100,
      usage_365d: usage.count,
      annual_revenue: Math.round(usage.revenue * 100) / 100,
      price_mismatch: priceMismatch,
    });
  }

  rows.sort((a, b) => b.annual_revenue - a.annual_revenue);

  const mismatches = rows.filter(r => r.price_mismatch).length;
  console.log(`  ${rows.length} dashboard rows built`);
  console.log(`  ${mismatches} price mismatches (fee schedule != billing)`);
  console.log(`  Top 5 by revenue:`);
  for (const r of rows.slice(0, 5)) {
    const flag = r.price_mismatch ? ' ⚠️' : '';
    console.log(`    ${r.treatment_code}: $${r.current_price} (fee: $${r.fee_schedule_price})${flag} | usage: ${r.usage_365d} | rev: $${r.annual_revenue}`);
  }

  // --- Upsert to Supabase ---
  console.log('\nUpserting to pricing_dashboard table...');

  // Delete existing
  const { error: delErr } = await sb.from('pricing_dashboard').delete().gte('usage_365d', 0);
  if (delErr && !delErr.message.includes('does not exist')) {
    // Try deleting all including negatives
    await sb.from('pricing_dashboard').delete().not('treatment_code', 'is', null);
  }

  // Batch upsert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb.from('pricing_dashboard').upsert(batch, { onConflict: 'treatment_code' });
    if (error) {
      console.error(`  Error batch ${i}-${i + BATCH}:`, error.message);
      // If column missing, log what we need
      if (error.message.includes('fee_schedule_price') || error.message.includes('price_mismatch')) {
        console.log('\n  Need new columns. Run in SQL Editor:');
        console.log('  ALTER TABLE pricing_dashboard ADD COLUMN IF NOT EXISTS fee_schedule_price double precision;');
        console.log('  ALTER TABLE pricing_dashboard ADD COLUMN IF NOT EXISTS price_mismatch boolean DEFAULT false;');
        return;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n✅ Done! ${inserted} rows upserted to pricing_dashboard`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
