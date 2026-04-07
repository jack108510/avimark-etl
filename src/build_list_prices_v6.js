#!/usr/bin/env node
/**
 * LIST PRICES v6 — v4 accuracy + v5 daily resolution.
 *
 * Step 1: Use v4 method to find the stable LIST PRICE (monthly runs ≥ 3mo).
 * Step 2: Within the stable run, find the EXACT first day that price appeared
 *         (the day it "took over"). That's last_changed.
 * Step 3: Also find the last day the PREVIOUS price was charged (boundary day).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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
  return { price: best, count: bestN, total: arr.length };
}

/**
 * v4 logic: returns stable list_price via monthly runs.
 * Returns { list_price, run_months[], run_months_count }
 */
function findStableRun(charges) {
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

  // Smooth: low-volume month inherits prev
  const smoothed = [];
  for (const m of monthly) {
    if (m.total < 2 && smoothed.length > 0) {
      smoothed.push({ price: smoothed[smoothed.length - 1].price, month: m.month });
    } else {
      smoothed.push({ price: m.price, month: m.month });
    }
  }

  // Build runs
  const runs = [];
  for (const m of smoothed) {
    if (runs.length === 0 || runs[runs.length - 1].price !== m.price) {
      runs.push({ price: m.price, months: [m.month] });
    } else {
      runs[runs.length - 1].months.push(m.month);
    }
  }

  // Most recent run with ≥3 months; else longest run
  let chosen = null;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].months.length >= 3) { chosen = runs[i]; break; }
  }
  if (!chosen) chosen = runs.reduce((b, r) => r.months.length > b.months.length ? r : b, runs[0]);

  return { list_price: chosen.price, run_months: new Set(chosen.months), runs, chosenIdx: runs.indexOf(chosen) };
}

async function main() {
  console.log('Loading all positive charges...');
  const services = await fetchAll('services', 'code,description,amount,service_date', { gt: { amount: 0 } });
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

  const today = new Date().toISOString().substring(0, 10);
  const rows = [];

  for (const [code, arr] of byCode) {
    arr.sort((a, b) => a.service_date.localeCompare(b.service_date));
    const run = findStableRun(arr);
    if (!run) continue;

    const listPrice = run.list_price;

    // --- EXACT last_changed: first charge at list_price inside the stable run's months
    const inRun = arr.filter(c => run.run_months.has(monthOf(c.service_date)));
    const firstAtList = inRun.find(c => c.amount === listPrice);
    const lastChangedExact = firstAtList ? dayOf(firstAtList.service_date) : dayOf(inRun[0]?.service_date || arr[0].service_date);

    // Last charge at a DIFFERENT price BEFORE the run (the real "old price" boundary)
    let lastOldDate = null;
    let oldPrice = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (c.service_date >= lastChangedExact) continue;
      if (c.amount !== listPrice) {
        lastOldDate = dayOf(c.service_date);
        oldPrice = c.amount;
        break;
      }
    }

    // Stats for confidence
    const atList = inRun.filter(c => c.amount === listPrice).length;
    const share = inRun.length > 0 ? atList / inRun.length : 0;
    const monthsHeld = run.run_months.size;
    const daysHeld = Math.round((new Date(today) - new Date(lastChangedExact)) / 86400000);

    const sampleScore = Math.min(1, Math.log10(inRun.length + 1) / Math.log10(51));
    const tenureScore = Math.min(1, monthsHeld / 6);
    const confidence = Math.round((share * 0.55 + sampleScore * 0.22 + tenureScore * 0.23) * 100);

    let tier = 'HIGH';
    if (confidence < 50) tier = 'LOW';
    else if (confidence < 75) tier = 'MEDIUM';

    // 365d stats
    const c365 = new Date(); c365.setDate(c365.getDate() - 365);
    const cutoffStr = c365.toISOString().substring(0, 10);
    const recent = arr.filter(c => c.service_date >= cutoffStr);
    const rev365 = recent.reduce((s, x) => s + x.amount, 0);

    // Drift detection: is there a newer run after chosen?
    const laterRuns = run.runs.slice(run.chosenIdx + 1);
    const drifting = laterRuns.length > 0;
    const drift_price = drifting ? laterRuns[laterRuns.length - 1].price : null;
    const drift_months = drifting ? laterRuns[laterRuns.length - 1].months.length : 0;

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: listPrice,
      last_changed: lastChangedExact,
      previous_price: oldPrice,
      last_old_price_date: lastOldDate,
      days_held: daysHeld,
      months_held: monthsHeld,
      confidence,
      tier,
      share_pct: Math.round(share * 1000) / 10,
      charges_in_run: inRun.length,
      drifting,
      drift_price,
      drift_months,
      uses_365d: recent.length,
      revenue_365d: Math.round(rev365 * 100) / 100,
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
    console.log(`  ${ok} ${code}: $${r.list_price} | changed ${r.last_changed} | prev $${r.previous_price} last seen ${r.last_old_price_date} | ${r.tier} ${r.confidence} | expected $${expected}`);
  }

  console.log('\n=== TOP 25 by 365d revenue — EXACT change dates ===');
  console.log('CODE      | LIST   | LAST_CHANGED | DAYS | PREV   | LAST-OLD   | TIER   | DESC');
  for (const r of rows.slice(0, 25)) {
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.list_price).padEnd(5)} ` +
      `| ${r.last_changed}   | ${String(r.days_held).padStart(4)} ` +
      `| $${String(r.previous_price ?? '-').padEnd(5)} ` +
      `| ${(r.last_old_price_date || '    -     ').padEnd(10)} ` +
      `| ${r.tier.padEnd(6)} | ${(r.description || '').substring(0, 28)}`
    );
  }

  const csv = ['treatment_code,description,list_price,last_changed,days_held,months_held,previous_price,last_old_price_date,confidence,tier,share_pct,charges_in_run,drifting,drift_price,drift_months,uses_365d,revenue_365d'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.last_changed, r.days_held, r.months_held, r.previous_price, r.last_old_price_date, r.confidence, r.tier, r.share_pct, r.charges_in_run, r.drifting, r.drift_price, r.drift_months, r.uses_365d, r.revenue_365d].join(','));
  }
  fs.writeFileSync('list_prices_v6.csv', csv.join('\n'));
  fs.writeFileSync('list_prices_v6.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices_v6.csv + list_prices_v6.json');
}

main().catch(e => console.error(e));
