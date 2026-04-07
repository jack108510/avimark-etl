#!/usr/bin/env node
/**
 * LIST PRICES v3 — Change-point anchored.
 *
 * Algorithm:
 *   1. Load all positive charges for each code, ordered by date.
 *   2. Walk month-by-month; for each month compute the DOMINANT price (mode).
 *   3. Find the most recent month where dominant price STABLY shifted.
 *      Stability = new dominant price holds for ≥3 consecutive months OR
 *      covers the most recent window through today.
 *   4. list_price = MODE of all positive charges since that change point.
 *   5. last_changed = first day of the month the change happened.
 *   6. Confidence = share of charges at list_price since the change point.
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

function monthOf(dt) { return dt.substring(0, 7); } // YYYY-MM

function dominantIn(arr) {
  const c = new Map();
  for (const a of arr) c.set(a, (c.get(a) || 0) + 1);
  let best = null, bestN = 0;
  for (const [a, n] of c) if (n > bestN) { best = a; bestN = n; }
  return { price: best, count: bestN, total: arr.length };
}

function findChangePoint(charges) {
  // charges = sorted by date ascending, each {amount, service_date}
  // Group by month → dominant price per month
  const months = new Map();
  for (const c of charges) {
    const m = monthOf(c.service_date);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(c.amount);
  }
  const sorted = [...months.entries()]
    .map(([m, arr]) => ({ month: m, ...dominantIn(arr) }))
    .filter(m => m.total >= 1)
    .sort((a, b) => a.month.localeCompare(b.month));

  if (sorted.length === 0) return null;

  // Current price = mode of last 3 months (or all if < 3)
  const tail = sorted.slice(-3);
  const tailAmounts = [];
  for (const m of tail) {
    for (let i = 0; i < m.count; i++) tailAmounts.push(m.price);
  }
  const currentPrice = dominantIn(tailAmounts).price;

  // Walk backwards: find the most recent month where dominant != currentPrice
  // but subsequent months are consistently currentPrice
  let changeIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].price !== currentPrice) { changeIdx = i; break; }
  }
  // changeIdx = last month where price was DIFFERENT
  // So the change happened the month AFTER changeIdx
  const changeMonthIdx = changeIdx + 1;
  const changeMonth = changeMonthIdx < sorted.length
    ? sorted[changeMonthIdx].month
    : sorted[sorted.length - 1].month; // never changed = stable forever

  return { currentPrice, changeMonth, monthly: sorted };
}

async function main() {
  console.log('Loading all positive charges (all-time)...');
  const services = await fetchAll('services', 'code,description,amount,service_date', {
    gt: { amount: 0 },
  });
  console.log(`  ${services.length} charges loaded\n`);

  // Bucket by code
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
    const cp = findChangePoint(arr);
    if (!cp) continue;

    // Take all charges since (and including) the change month
    const sinceChange = arr.filter(c => monthOf(c.service_date) >= cp.changeMonth);
    const countsSince = new Map();
    for (const c of sinceChange) countsSince.set(c.amount, (countsSince.get(c.amount) || 0) + 1);
    const sortedSince = [...countsSince.entries()].sort((a, b) => b[1] - a[1]);
    const [listPrice, listCount] = sortedSince[0] || [null, 0];
    const [alt1Price, alt1Count] = sortedSince[1] || [null, 0];
    const [alt2Price, alt2Count] = sortedSince[2] || [null, 0];

    const share = sinceChange.length > 0 ? listCount / sinceChange.length : 0;
    const monthsHeld = cp.monthly.length - cp.monthly.findIndex(m => m.month >= cp.changeMonth);

    // Confidence: share weighted by sample size and months held
    const sampleScore = Math.min(1, Math.log10(sinceChange.length + 1) / Math.log10(51));
    const tenureScore = Math.min(1, monthsHeld / 6); // 6+ months held = full score
    const confidence = Math.round((share * 0.55 + sampleScore * 0.25 + tenureScore * 0.20) * 100);

    let tier = 'HIGH';
    if (confidence < 50) tier = 'LOW';
    else if (confidence < 75) tier = 'MEDIUM';

    // 365d revenue
    const c365 = new Date(); c365.setDate(c365.getDate() - 365);
    const cutoffStr = c365.toISOString().substring(0, 10);
    const rev365 = arr.filter(c => c.service_date >= cutoffStr).reduce((s, x) => s + x.amount, 0);
    const uses365 = arr.filter(c => c.service_date >= cutoffStr).length;

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: listPrice,
      confidence,
      tier,
      last_changed: cp.changeMonth + '-01',
      months_held: monthsHeld,
      charges_since_change: sinceChange.length,
      share_at_list_pct: Math.round(share * 1000) / 10,
      alt1_price: alt1Price,
      alt1_count: alt1Count,
      alt2_price: alt2Price,
      alt2_count: alt2Count,
      uses_365d: uses365,
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
    const alt = r.alt1_price !== null ? `| alt $${r.alt1_price}×${r.alt1_count}` : '';
    console.log(`  ${ok} ${code}: $${r.list_price} | ${r.tier} conf ${r.confidence} | share ${r.share_at_list_pct}% | since ${r.last_changed} (${r.months_held}mo) ${alt} | expected $${expected}`);
  }

  console.log('\n=== TOP 25 by 365d revenue ===');
  console.log('CODE      | LIST    | TIER   | CONF | SHARE  | SINCE      | MO | ALT          | DESC');
  for (const r of rows.slice(0, 25)) {
    const alt = r.alt1_price !== null ? `$${r.alt1_price}×${r.alt1_count}` : '-';
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.list_price).padEnd(6)} ` +
      `| ${r.tier.padEnd(6)} | ${String(r.confidence).padStart(3)}  ` +
      `| ${String(r.share_at_list_pct).padStart(5)}% ` +
      `| ${r.last_changed} | ${String(r.months_held).padStart(2)} ` +
      `| ${alt.padEnd(12)} | ${(r.description || '').substring(0, 35)}`
    );
  }

  // Save
  const csv = ['treatment_code,description,list_price,confidence,tier,last_changed,months_held,charges_since_change,share_at_list_pct,alt1_price,alt1_count,alt2_price,alt2_count,uses_365d,revenue_365d'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.confidence, r.tier, r.last_changed, r.months_held, r.charges_since_change, r.share_at_list_pct, r.alt1_price, r.alt1_count, r.alt2_price, r.alt2_count, r.uses_365d, r.revenue_365d].join(','));
  }
  fs.writeFileSync('list_prices_v3.csv', csv.join('\n'));
  fs.writeFileSync('list_prices_v3.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices_v3.csv + list_prices_v3.json');
}

main().catch(e => console.error(e));
