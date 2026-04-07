#!/usr/bin/env node
/**
 * LIST PRICES v4 — Stable-run change-point detection.
 *
 * Key fix: A price change is only REAL if the new dominant price holds
 * for ≥3 consecutive months (or through "today" if run is shorter than 3).
 *
 * Algorithm:
 *   1. For each code, compute per-month dominant price (positive charges only).
 *   2. Collapse consecutive months with same dominant into RUNS.
 *   3. Filter out runs < 3 months long (noise) UNLESS it's the current ongoing run.
 *   4. The list_price = dominant price of the most recent VALID run.
 *   5. last_changed = first month of that run.
 *   6. Confidence from share-at-list + run length + sample size.
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

function monthOf(dt) { return dt.substring(0, 7); }

function dominantIn(arr) {
  const c = new Map();
  for (const a of arr) c.set(a, (c.get(a) || 0) + 1);
  let best = null, bestN = 0;
  for (const [a, n] of c) if (n > bestN) { best = a; bestN = n; }
  return { price: best, count: bestN, total: arr.length };
}

// Smooth monthly dominant: require 2+ charges in a month to trust it,
// otherwise merge into previous month's dominant.
function findStableListPrice(charges) {
  // Group by month
  const months = new Map();
  for (const c of charges) {
    const m = monthOf(c.service_date);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(c.amount);
  }
  const monthly = [...months.entries()]
    .map(([m, arr]) => ({ month: m, ...dominantIn(arr) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (monthly.length === 0) return null;

  // Smooth: if month has <2 charges, its dominant is unreliable → inherit prev
  const smoothed = [];
  for (let i = 0; i < monthly.length; i++) {
    const m = monthly[i];
    if (m.total < 2 && smoothed.length > 0) {
      smoothed.push({ ...smoothed[smoothed.length - 1], month: m.month, totalActual: m.total });
    } else {
      smoothed.push({ ...m, totalActual: m.total });
    }
  }

  // Build RUNS of consecutive same-price months
  const runs = [];
  for (const m of smoothed) {
    if (runs.length === 0 || runs[runs.length - 1].price !== m.price) {
      runs.push({ price: m.price, months: [m.month], startMonth: m.month });
    } else {
      runs[runs.length - 1].months.push(m.month);
    }
  }

  // Find the most recent VALID run.
  // Valid = length ≥ 3 OR it's the ongoing final run AND length ≥ 1.
  // If the ongoing run is 1-2 months, PREFER the previous stable run as current,
  // because recent noise may not yet constitute a change.
  let chosen = null;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const isLast = i === runs.length - 1;
    if (r.months.length >= 3) { chosen = r; break; }
    if (isLast && runs.length === 1) { chosen = r; break; } // only 1 run total
  }
  // If no 3-month run found, fall back to the longest run overall
  if (!chosen) {
    chosen = runs.reduce((best, r) => r.months.length > best.months.length ? r : best, runs[0]);
  }

  // Compute mode + share from actual charges during chosen run months
  const runMonthSet = new Set(chosen.months);
  const runCharges = charges.filter(c => runMonthSet.has(monthOf(c.service_date)));
  const c = new Map();
  for (const x of runCharges) c.set(x.amount, (c.get(x.amount) || 0) + 1);
  const sorted = [...c.entries()].sort((a, b) => b[1] - a[1]);
  const [listPrice, listCount] = sorted[0] || [chosen.price, 0];
  const [alt1, alt1N] = sorted[1] || [null, 0];
  const [alt2, alt2N] = sorted[2] || [null, 0];

  const share = runCharges.length > 0 ? listCount / runCharges.length : 0;

  // Does the current (last) run differ from chosen? Possible drift.
  const lastRun = runs[runs.length - 1];
  const drifting = lastRun.price !== chosen.price;

  return {
    list_price: listPrice,
    last_changed: chosen.startMonth + '-01',
    months_held: chosen.months.length,
    charges_in_run: runCharges.length,
    share_pct: Math.round(share * 1000) / 10,
    alt1, alt1N, alt2, alt2N,
    drifting,
    drift_price: drifting ? lastRun.price : null,
    drift_months: drifting ? lastRun.months.length : 0,
    monthly_count: monthly.length,
    all_runs: runs.length,
  };
}

async function main() {
  console.log('Loading all positive charges...');
  const services = await fetchAll('services', 'code,description,amount,service_date', {
    gt: { amount: 0 },
  });
  console.log(`  ${services.length} charges loaded\n`);

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

  const rows = [];
  for (const [code, arr] of byCode) {
    arr.sort((a, b) => a.service_date.localeCompare(b.service_date));
    const cp = findStableListPrice(arr);
    if (!cp) continue;

    // Confidence: share × sample × tenure
    const sampleScore = Math.min(1, Math.log10(cp.charges_in_run + 1) / Math.log10(51));
    const tenureScore = Math.min(1, cp.months_held / 6);
    const shareScore = cp.share_pct / 100;
    const confidence = Math.round((shareScore * 0.55 + sampleScore * 0.22 + tenureScore * 0.23) * 100);

    let tier = 'HIGH';
    if (confidence < 50) tier = 'LOW';
    else if (confidence < 75) tier = 'MEDIUM';

    // 365d activity
    const c365 = new Date(); c365.setDate(c365.getDate() - 365);
    const cutoffStr = c365.toISOString().substring(0, 10);
    const recent = arr.filter(c => c.service_date >= cutoffStr);
    const rev365 = recent.reduce((s, x) => s + x.amount, 0);

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: cp.list_price,
      last_changed: cp.last_changed,
      months_held: cp.months_held,
      confidence,
      tier,
      share_pct: cp.share_pct,
      charges_in_run: cp.charges_in_run,
      alt1_price: cp.alt1,
      alt1_count: cp.alt1N,
      alt2_price: cp.alt2,
      alt2_count: cp.alt2N,
      drifting: cp.drifting,
      drift_price: cp.drift_price,
      drift_months: cp.drift_months,
      uses_365d: recent.length,
      revenue_365d: Math.round(rev365 * 100) / 100,
      total_history_months: cp.monthly_count,
      runs_detected: cp.all_runs,
    });
  }
  rows.sort((a, b) => b.revenue_365d - a.revenue_365d);

  const high = rows.filter(r => r.tier === 'HIGH').length;
  const med = rows.filter(r => r.tier === 'MEDIUM').length;
  const low = rows.filter(r => r.tier === 'LOW').length;
  console.log(`Built ${rows.length} codes: ${high} HIGH, ${med} MEDIUM, ${low} LOW\n`);

  console.log('=== VALIDATION vs known UI prices ===');
  const known = { HC: 80, HEF: 80, ANEX: 80, '0007': 249, BLO: 41.35, GERI: 270, '303A': 180 };
  for (const [code, expected] of Object.entries(known)) {
    const r = rows.find(x => x.treatment_code === code);
    if (!r) { console.log(`  ${code}: NOT FOUND`); continue; }
    const ok = Math.abs(r.list_price - expected) < 0.01 ? '✅' : '❌';
    const drift = r.drifting ? ` 🔄drift→$${r.drift_price}×${r.drift_months}mo` : '';
    console.log(`  ${ok} ${code}: $${r.list_price} | ${r.tier} conf ${r.confidence} | share ${r.share_pct}% | since ${r.last_changed} (${r.months_held}mo, ${r.charges_in_run} chgs)${drift} | expected $${expected}`);
  }

  console.log('\n=== TOP 25 by 365d revenue ===');
  console.log('CODE      | LIST    | TIER   | CONF | SHARE  | SINCE      | MO | DRIFT       | DESC');
  for (const r of rows.slice(0, 25)) {
    const drift = r.drifting ? `🔄$${r.drift_price}(${r.drift_months}m)` : '     -      ';
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.list_price).padEnd(6)} ` +
      `| ${r.tier.padEnd(6)} | ${String(r.confidence).padStart(3)}  ` +
      `| ${String(r.share_pct).padStart(5)}% ` +
      `| ${r.last_changed} | ${String(r.months_held).padStart(2)} ` +
      `| ${drift.padEnd(12)} | ${(r.description || '').substring(0, 30)}`
    );
  }

  console.log('\n=== DRIFTING CODES (possible new change in progress) ===');
  const drifts = rows.filter(r => r.drifting && r.tier === 'HIGH' && r.drift_months >= 2).slice(0, 15);
  for (const r of drifts) {
    console.log(`  ${r.treatment_code.padEnd(9)} STABLE $${r.list_price} (${r.months_held}mo) → now $${r.drift_price} (${r.drift_months}mo) | ${(r.description||'').substring(0,40)}`);
  }

  // Save
  const csv = ['treatment_code,description,list_price,last_changed,months_held,confidence,tier,share_pct,charges_in_run,alt1_price,alt1_count,alt2_price,alt2_count,drifting,drift_price,drift_months,uses_365d,revenue_365d'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.last_changed, r.months_held, r.confidence, r.tier, r.share_pct, r.charges_in_run, r.alt1_price, r.alt1_count, r.alt2_price, r.alt2_count, r.drifting, r.drift_price, r.drift_months, r.uses_365d, r.revenue_365d].join(','));
  }
  fs.writeFileSync('list_prices_v4.csv', csv.join('\n'));
  fs.writeFileSync('list_prices_v4.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices_v4.csv + list_prices_v4.json');
}

main().catch(e => console.error(e));
