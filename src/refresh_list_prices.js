#!/usr/bin/env node
/**
 * refresh_list_prices.js — ETL step: rebuild list_prices from services.
 * Loads positive billing charges from Supabase, runs v6 algorithm,
 * upserts results to list_prices. Meant to run nightly.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function fetchAll(table, select, filters = {}) {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) {
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

function monthOf(dt) { return dt.substring(0, 7); }
function dayOf(dt) { return dt.substring(0, 10); }

function dominantIn(arr) {
  const c = new Map();
  for (const a of arr) c.set(a, (c.get(a) || 0) + 1);
  let best = null, bestN = 0;
  for (const [a, n] of c) if (n > bestN) { best = a; bestN = n; }
  return { price: best, count: bestN };
}

function findStableRun(charges) {
  const months = new Map();
  for (const c of charges) {
    const m = monthOf(c.service_date);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(c.amount);
  }
  const monthly = [...months.entries()]
    .map(([m, arr]) => ({ month: m, ...dominantIn(arr), total: arr.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (monthly.length === 0) return null;

  const smoothed = [];
  for (const m of monthly) {
    if (m.total < 2 && smoothed.length > 0) {
      smoothed.push({ price: smoothed[smoothed.length - 1].price, month: m.month });
    } else {
      smoothed.push({ price: m.price, month: m.month });
    }
  }
  const runs = [];
  for (const m of smoothed) {
    if (runs.length === 0 || runs[runs.length - 1].price !== m.price) {
      runs.push({ price: m.price, months: [m.month] });
    } else {
      runs[runs.length - 1].months.push(m.month);
    }
  }
  let chosen = null;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].months.length >= 3) { chosen = runs[i]; break; }
  }
  if (!chosen) chosen = runs.reduce((b, r) => r.months.length > b.months.length ? r : b, runs[0]);
  return { list_price: chosen.price, run_months: new Set(chosen.months), runs, chosenIdx: runs.indexOf(chosen) };
}

async function main() {
  const startTs = Date.now();
  console.log(`[${new Date().toISOString()}] Refreshing list_prices...`);
  const services = await fetchAll('services', 'code,description,amount,service_date', { gt: { amount: 0 } });
  console.log(`  Loaded ${services.length} positive charges`);

  const byCode = new Map();
  const descCounts = new Map();
  for (const s of services) {
    if (!s.code || !s.service_date) continue;
    if (!byCode.has(s.code)) byCode.set(s.code, []);
    byCode.get(s.code).push(s);
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

  const today = new Date().toISOString().substring(0, 10);
  const rows = [];
  for (const [code, arr] of byCode) {
    arr.sort((a, b) => a.service_date.localeCompare(b.service_date));
    const run = findStableRun(arr);
    if (!run) continue;
    const listPrice = run.list_price;
    const inRun = arr.filter(c => run.run_months.has(monthOf(c.service_date)));
    const firstAtList = inRun.find(c => c.amount === listPrice);
    const lastChanged = firstAtList ? dayOf(firstAtList.service_date) : dayOf(inRun[0]?.service_date || arr[0].service_date);

    let lastOldDate = null, oldPrice = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (c.service_date >= lastChanged) continue;
      if (c.amount !== listPrice) { lastOldDate = dayOf(c.service_date); oldPrice = c.amount; break; }
    }

    const atList = inRun.filter(c => c.amount === listPrice).length;
    const share = inRun.length > 0 ? atList / inRun.length : 0;
    const monthsHeld = run.run_months.size;
    const daysHeld = Math.round((new Date(today) - new Date(lastChanged)) / 86400000);
    const sampleScore = Math.min(1, Math.log10(inRun.length + 1) / Math.log10(51));
    const tenureScore = Math.min(1, monthsHeld / 6);
    const confidence = Math.round((share * 0.55 + sampleScore * 0.22 + tenureScore * 0.23) * 100);
    let tier = 'HIGH';
    if (confidence < 50) tier = 'LOW'; else if (confidence < 75) tier = 'MEDIUM';

    const c365 = new Date(); c365.setDate(c365.getDate() - 365);
    const cutoffStr = c365.toISOString().substring(0, 10);
    const recent = arr.filter(c => c.service_date >= cutoffStr);
    const rev365 = recent.reduce((s, x) => s + x.amount, 0);

    const laterRuns = run.runs.slice(run.chosenIdx + 1);
    const drifting = laterRuns.length > 0;
    const drift_price = drifting ? laterRuns[laterRuns.length - 1].price : null;
    const drift_months = drifting ? laterRuns[laterRuns.length - 1].months.length : 0;

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: listPrice,
      last_changed: lastChanged,
      months_held: monthsHeld,
      confidence,
      tier,
      share_pct: Math.round(share * 1000) / 10,
      charges_in_run: inRun.length,
      alt1_price: oldPrice,
      alt1_count: null,
      alt2_price: null,
      alt2_count: null,
      drifting,
      drift_price,
      drift_months,
      uses_365d: recent.length,
      revenue_365d: Math.round(rev365 * 100) / 100,
    });
  }
  console.log(`  Computed ${rows.length} list prices`);

  const { error: delErr } = await sb.from('list_prices').delete().not('treatment_code', 'is', null);
  if (delErr) { console.error('Delete:', delErr.message); process.exit(1); }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb.from('list_prices').upsert(rows.slice(i, i + BATCH), { onConflict: 'treatment_code' });
    if (error) { console.error(`Batch ${i}:`, error.message); process.exit(1); }
  }
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] ✅ Wrote ${rows.length} rows to list_prices in ${elapsed}s`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
