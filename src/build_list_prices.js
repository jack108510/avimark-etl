#!/usr/bin/env node
/**
 * Build billing-derived LIST PRICES that match Avimark UI.
 *
 * Theory: In Avimark, adding a service auto-fills the list price. Staff can
 * discount DOWN (frequent customer, writeoffs, promos) but almost never charge
 * ABOVE list price. So list price = MAX of the "sticky" charge amounts.
 *
 * Formula:
 *   1. Window: prefer 90d. Fall back to 180d then 365d if <20 charges.
 *   2. Group by amount; keep amounts with freq >= max(3, 10% of total).
 *   3. list_price = MAX of sticky amounts.
 *   4. confidence = % of charges AT list_price.
 *   5. Flag if confidence < 40% OR only 1 sticky amount with <10 uses.
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

function cutoff(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

function deriveListPrice(charges) {
  if (charges.length === 0) return null;
  const counts = new Map();
  for (const c of charges) counts.set(c.amount, (counts.get(c.amount) || 0) + 1);
  const total = charges.length;
  const threshold = Math.max(3, Math.ceil(total * 0.10));
  const sticky = [...counts.entries()].filter(([, n]) => n >= threshold);
  if (sticky.length === 0) {
    // Nothing sticky → fall back to single highest-count amount
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { list_price: top[0], confidence_pct: Math.round((top[1] / total) * 1000) / 10, sticky_count: 0, total, low_confidence: true };
  }
  const listPrice = Math.max(...sticky.map(([a]) => a));
  const atList = counts.get(listPrice) || 0;
  return {
    list_price: listPrice,
    confidence_pct: Math.round((atList / total) * 1000) / 10,
    sticky_count: sticky.length,
    total,
    low_confidence: (atList / total) < 0.40 || (sticky.length === 1 && total < 10),
  };
}

async function main() {
  console.log('Loading positive charges (last 365d)...');
  const c365 = cutoff(365);
  const c180 = cutoff(180);
  const c90 = cutoff(90);

  const services = await fetchAll('services', 'code,description,amount,service_date', {
    gte: { service_date: c365 },
    gt: { amount: 0 },
  });
  console.log(`  ${services.length} charges loaded\n`);

  // Group by code + windows
  const byCode = new Map();
  const descCounts = new Map();
  for (const s of services) {
    if (!s.code) continue;
    if (!byCode.has(s.code)) byCode.set(s.code, { d90: [], d180: [], d365: [] });
    const b = byCode.get(s.code);
    b.d365.push(s);
    if (s.service_date >= c180) b.d180.push(s);
    if (s.service_date >= c90) b.d90.push(s);
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
  for (const [code, b] of byCode) {
    // Pick window: prefer 90d if >=20 charges, then 180d, then 365d
    let win = '90d', src = b.d90;
    if (src.length < 20) { win = '180d'; src = b.d180; }
    if (src.length < 20) { win = '365d'; src = b.d365; }

    const primary = deriveListPrice(src);
    const p365 = deriveListPrice(b.d365); // full-year comparison

    // Revenue
    const rev365 = b.d365.reduce((s, x) => s + x.amount, 0);

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: primary?.list_price ?? null,
      confidence_pct: primary?.confidence_pct ?? null,
      window_used: win,
      window_charges: primary?.total ?? 0,
      sticky_amounts: primary?.sticky_count ?? 0,
      low_confidence: primary?.low_confidence ?? true,
      list_price_365d: p365?.list_price ?? null,
      confidence_365d_pct: p365?.confidence_pct ?? null,
      uses_365d: b.d365.length,
      revenue_365d: Math.round(rev365 * 100) / 100,
      price_changed_recently: primary && p365 && primary.list_price !== p365.list_price,
    });
  }

  rows.sort((a, b) => b.revenue_365d - a.revenue_365d);

  const lowConf = rows.filter(r => r.low_confidence).length;
  const changed = rows.filter(r => r.price_changed_recently).length;
  console.log(`Built ${rows.length} codes.`);
  console.log(`  ${rows.length - lowConf} HIGH confidence, ${lowConf} LOW confidence (need review)`);
  console.log(`  ${changed} codes show a recent list-price change (primary window ≠ 365d)\n`);

  // Validate against known-good codes
  console.log('=== VALIDATION vs known prices ===');
  const known = { HC: 80, BL: 34.70, ANEX: 80, '0007': 249 };
  for (const [code, expected] of Object.entries(known)) {
    const r = rows.find(x => x.treatment_code === code);
    if (!r) { console.log(`  ${code}: NOT FOUND`); continue; }
    const ok = Math.abs(r.list_price - expected) < 0.01 ? '✅' : '❌';
    console.log(`  ${ok} ${code}: got $${r.list_price} (conf ${r.confidence_pct}%, ${r.window_used}, ${r.window_charges} charges) | expected $${expected}`);
  }

  console.log('\n=== TOP 20 by 365d revenue ===');
  console.log('CODE      | LIST     | 365d LIST | CONF   | WIN    | CHGS | USES | FLAG');
  for (const r of rows.slice(0, 20)) {
    const flag = r.low_confidence ? '⚠️ LOW' : (r.price_changed_recently ? '🔄 CHG' : '  OK');
    console.log(
      `${r.treatment_code.padEnd(9)} | $${String(r.list_price).padEnd(7)}` +
      `| $${String(r.list_price_365d).padEnd(7)} ` +
      `| ${String(r.confidence_pct).padStart(5)}% ` +
      `| ${r.window_used.padEnd(5)} ` +
      `| ${String(r.window_charges).padStart(4)} ` +
      `| ${String(r.uses_365d).padStart(4)} ` +
      `| ${flag}`
    );
  }

  console.log('\n=== Recent PRICE CHANGES (high confidence only) ===');
  const realChanges = rows.filter(r => r.price_changed_recently && !r.low_confidence && r.window_charges >= 10);
  for (const r of realChanges.slice(0, 20)) {
    const dir = r.list_price > r.list_price_365d ? '↑' : '↓';
    const pct = Math.round(((r.list_price - r.list_price_365d) / r.list_price_365d) * 1000) / 10;
    console.log(`  ${r.treatment_code.padEnd(9)} $${r.list_price_365d} ${dir} $${r.list_price} (${pct > 0 ? '+' : ''}${pct}%) conf ${r.confidence_pct}% | ${(r.description||'').substring(0,40)}`);
  }

  // Save
  const csv = ['treatment_code,description,list_price,confidence_pct,window_used,window_charges,sticky_amounts,low_confidence,list_price_365d,confidence_365d_pct,uses_365d,revenue_365d,price_changed_recently'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.confidence_pct, r.window_used, r.window_charges, r.sticky_amounts, r.low_confidence, r.list_price_365d, r.confidence_365d_pct, r.uses_365d, r.revenue_365d, r.price_changed_recently].join(','));
  }
  fs.writeFileSync('list_prices.csv', csv.join('\n'));
  fs.writeFileSync('list_prices.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices.csv + list_prices.json');
}

main().catch(e => console.error(e));
