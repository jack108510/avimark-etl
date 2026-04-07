#!/usr/bin/env node
/**
 * LIST PRICES v5 — DAILY resolution change detection.
 *
 * Algorithm:
 *   1. For each code: order all positive charges chronologically (by date).
 *   2. Identify current list_price = mode of most recent 30 charges (or all if fewer).
 *   3. Walk BACKWARDS through history. Find the FIRST charge at current_price
 *      such that EVERY SUBSEQUENT dominant price is also current_price.
 *      (i.e. the change point = first day current price appears as "the new normal")
 *   4. Refinement: the last_changed date = the date of that first charge OR
 *      the day AFTER the last charge at the old price (whichever is later).
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

function mode(arr) {
  const c = new Map();
  for (const a of arr) c.set(a, (c.get(a) || 0) + 1);
  let best = null, bestN = 0;
  for (const [a, n] of c) if (n > bestN) { best = a; bestN = n; }
  return best;
}

/**
 * Find the exact change point.
 * Returns the service_date of the FIRST charge at current_price that starts
 * the contiguous block ending today, OR the day after the LAST charge at any
 * other price (that's the moment the new price "took over").
 */
function findChangeDate(charges, currentPrice) {
  // charges sorted ascending by service_date
  // Find the LAST charge whose amount != currentPrice.
  // But we need to tolerate occasional discount/promo charges below list.
  // Rule: changeDate = service_date of the earliest charge at currentPrice
  //       such that from that date onward, currentPrice is the DOMINANT price.
  //
  // Simpler robust version: walk backwards. Count dominant of trailing window.
  // Find the earliest index i where [i..end] has currentPrice as mode.

  const n = charges.length;
  if (n === 0) return null;

  // Build cumulative counts from the end backwards
  // For each starting index i, is currentPrice still the mode of charges[i..n-1]?
  // Compute incrementally: maintain counts map.
  const counts = new Map();
  let bestStart = n - 1;
  let curMax = 0;
  let curMaxPrice = null;

  for (let i = n - 1; i >= 0; i--) {
    const p = charges[i].amount;
    counts.set(p, (counts.get(p) || 0) + 1);
    // Recompute mode
    if (counts.get(p) > curMax) {
      curMax = counts.get(p);
      curMaxPrice = p;
    } else if (counts.get(p) === curMax && p === currentPrice) {
      // tie — prefer currentPrice
      curMaxPrice = currentPrice;
    }
    // Check: if currentPrice is still the mode (or tied-top), keep going
    const countCur = counts.get(currentPrice) || 0;
    const countMax = curMax;
    // strict rule: currentPrice must be within 1 charge of the max AND
    // currentPrice share of window must be >= 50%
    const windowSize = n - i;
    const shareCur = countCur / windowSize;
    if (countCur >= countMax - 0 && shareCur >= 0.5) {
      bestStart = i;
    } else {
      // Current price no longer dominates → we've found the boundary
      break;
    }
  }

  // bestStart = index of earliest charge where currentPrice started dominating
  return charges[bestStart].service_date;
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

    // Current list price = mode of last 30 charges (or all if fewer)
    const tail = arr.slice(-30);
    const currentPrice = mode(tail.map(c => c.amount));
    if (currentPrice === null) continue;

    // Find the exact change date (first day the current price took over)
    const changeDate = findChangeDate(arr, currentPrice);

    // Stats over the run since changeDate
    const sinceRun = arr.filter(c => c.service_date >= changeDate);
    const atListCount = sinceRun.filter(c => c.amount === currentPrice).length;
    const share = sinceRun.length > 0 ? atListCount / sinceRun.length : 0;

    // Days held
    const changeDateOnly = changeDate.substring(0, 10);
    const today = new Date().toISOString().substring(0, 10);
    const daysHeld = Math.round((new Date(today) - new Date(changeDateOnly)) / 86400000);

    // Get the date of the LAST charge at an OLD price (gives us the "true" change moment)
    // Search backward from changeDate for the last non-currentPrice charge
    let lastOldPriceDate = null;
    let oldPrice = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].service_date >= changeDate) continue; // already in new run
      if (arr[i].amount !== currentPrice) {
        lastOldPriceDate = arr[i].service_date;
        oldPrice = arr[i].amount;
        break;
      }
    }

    // Confidence
    const sampleScore = Math.min(1, Math.log10(sinceRun.length + 1) / Math.log10(51));
    const tenureScore = Math.min(1, daysHeld / 180); // 6mo = full
    const confidence = Math.round((share * 0.55 + sampleScore * 0.22 + tenureScore * 0.23) * 100);

    let tier = 'HIGH';
    if (confidence < 50) tier = 'LOW';
    else if (confidence < 75) tier = 'MEDIUM';

    // 365d stats
    const c365 = new Date(); c365.setDate(c365.getDate() - 365);
    const cutoffStr = c365.toISOString().substring(0, 10);
    const recent = arr.filter(c => c.service_date >= cutoffStr);
    const rev365 = recent.reduce((s, x) => s + x.amount, 0);

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: currentPrice,
      last_charge_at_old_price: lastOldPriceDate ? lastOldPriceDate.substring(0, 10) : null,
      previous_price: oldPrice,
      change_date: changeDateOnly, // first day new price appeared
      days_held: daysHeld,
      confidence,
      tier,
      share_pct: Math.round(share * 1000) / 10,
      charges_since_change: sinceRun.length,
      total_charges: arr.length,
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
    console.log(`  ${ok} ${code}: $${r.list_price} | changed ${r.change_date} (${r.days_held}d held) | prev $${r.previous_price}, last seen ${r.last_charge_at_old_price} | ${r.tier} ${r.confidence} | share ${r.share_pct}% | expected $${expected}`);
  }

  console.log('\n=== TOP 25 by 365d revenue — with EXACT change dates ===');
  console.log('CODE      | LIST   | CHANGED    | DAYS | PREV   | LAST-OLD   | TIER  | DESC');
  for (const r of rows.slice(0, 25)) {
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.list_price).padEnd(5)} ` +
      `| ${r.change_date} | ${String(r.days_held).padStart(4)} ` +
      `| $${String(r.previous_price ?? '-').padEnd(5)} ` +
      `| ${(r.last_charge_at_old_price || '    -     ').padEnd(10)} ` +
      `| ${r.tier.padEnd(6)}| ${(r.description || '').substring(0, 30)}`
    );
  }

  const csv = ['treatment_code,description,list_price,change_date,days_held,previous_price,last_charge_at_old_price,confidence,tier,share_pct,charges_since_change,total_charges,uses_365d,revenue_365d'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.change_date, r.days_held, r.previous_price, r.last_charge_at_old_price, r.confidence, r.tier, r.share_pct, r.charges_since_change, r.total_charges, r.uses_365d, r.revenue_365d].join(','));
  }
  fs.writeFileSync('list_prices_v5.csv', csv.join('\n'));
  fs.writeFileSync('list_prices_v5.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices_v5.csv + list_prices_v5.json');
}

main().catch(e => console.error(e));
