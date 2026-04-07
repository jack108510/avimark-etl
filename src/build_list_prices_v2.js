#!/usr/bin/env node
/**
 * Billing-derived LIST PRICES v2 — MODE-based with honest confidence.
 *
 * Formula:
 *   1. Combine all windows: 90d primary, widen to 180d/365d if <30 charges.
 *   2. list_price = MODE (most frequent charge).
 *   3. Capture TOP 3 amounts + counts for transparency.
 *   4. Confidence score (0-100) blends:
 *      - mode_share (% of charges at mode)
 *      - sample_size (≥50 = full, log-scaled below)
 *      - mode_gap (how much mode beats runner-up)
 *   5. Tiers: HIGH (≥80), MEDIUM (50-79), LOW (<50) — MANUAL-CHECK-REQUIRED.
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
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

function analyze(charges) {
  if (charges.length === 0) return null;
  const counts = new Map();
  for (const c of charges) counts.set(c.amount, (counts.get(c.amount) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = charges.length;
  const [mode, modeN] = sorted[0];
  const [second, secondN] = sorted[1] || [null, 0];
  const [third, thirdN] = sorted[2] || [null, 0];

  const modeShare = modeN / total;                           // 0..1
  const gap = secondN > 0 ? (modeN - secondN) / modeN : 1;   // 0..1 (1 = mode dominates)
  const sampleScore = Math.min(1, Math.log10(total + 1) / Math.log10(51));

  const confidence = Math.round((modeShare * 0.55 + gap * 0.25 + sampleScore * 0.20) * 100);

  let tier = 'HIGH';
  if (confidence < 50) tier = 'LOW';
  else if (confidence < 80) tier = 'MEDIUM';

  return {
    list_price: mode,
    list_count: modeN,
    total,
    mode_share_pct: Math.round(modeShare * 1000) / 10,
    second_price: second,
    second_count: secondN,
    third_price: third,
    third_count: thirdN,
    confidence,
    tier,
  };
}

async function main() {
  console.log('Loading positive charges (last 365d)...');
  const c365 = cutoff(365), c180 = cutoff(180), c90 = cutoff(90);

  const services = await fetchAll('services', 'code,description,amount,service_date', {
    gte: { service_date: c365 }, gt: { amount: 0 },
  });
  console.log(`  ${services.length} charges loaded\n`);

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
    // Pick smallest window with ≥30 charges. Widen if needed.
    let win = '90d', src = b.d90;
    if (src.length < 30) { win = '180d'; src = b.d180; }
    if (src.length < 30) { win = '365d'; src = b.d365; }

    const a = analyze(src);
    const a365 = analyze(b.d365);
    const rev365 = b.d365.reduce((s, x) => s + x.amount, 0);

    rows.push({
      treatment_code: code,
      description: descMap.get(code) || null,
      list_price: a?.list_price ?? null,
      confidence: a?.confidence ?? 0,
      tier: a?.tier ?? 'LOW',
      window_used: win,
      window_charges: a?.total ?? 0,
      mode_share_pct: a?.mode_share_pct ?? null,
      second_price: a?.second_price ?? null,
      second_count: a?.second_count ?? 0,
      third_price: a?.third_price ?? null,
      third_count: a?.third_count ?? 0,
      list_price_365d: a365?.list_price ?? null,
      confidence_365d: a365?.confidence ?? 0,
      uses_365d: b.d365.length,
      revenue_365d: Math.round(rev365 * 100) / 100,
      price_changed: a && a365 && a.list_price !== a365.list_price,
    });
  }
  rows.sort((a, b) => b.revenue_365d - a.revenue_365d);

  const high = rows.filter(r => r.tier === 'HIGH').length;
  const med = rows.filter(r => r.tier === 'MEDIUM').length;
  const low = rows.filter(r => r.tier === 'LOW').length;
  console.log(`Built ${rows.length} codes: ${high} HIGH, ${med} MEDIUM, ${low} LOW\n`);

  console.log('=== VALIDATION vs known UI prices ===');
  const known = { HC: 80, HEF: 80, ANEX: 80, '0007': 249, BLO: 41.35, GERI: 270 };
  for (const [code, expected] of Object.entries(known)) {
    const r = rows.find(x => x.treatment_code === code);
    if (!r) { console.log(`  ${code}: NOT FOUND (low/no usage)`); continue; }
    const ok = Math.abs(r.list_price - expected) < 0.01 ? '✅' : '❌';
    const alt = r.second_price !== null ? `| alt: $${r.second_price}×${r.second_count}` : '';
    console.log(`  ${ok} ${code}: got $${r.list_price} | conf ${r.confidence} (${r.tier}) | share ${r.mode_share_pct}% ${alt} | expected $${expected}`);
  }

  console.log('\n=== TOP 25 by revenue — FLAG LOW/MEDIUM for manual check ===');
  for (const r of rows.slice(0, 25)) {
    const alt = r.second_price !== null ? `$${r.second_price}×${r.second_count}` : '-';
    const chg = r.price_changed ? '🔄' : '  ';
    console.log(
      `${chg} ${r.treatment_code.padEnd(9)} $${String(r.list_price).padEnd(7)} ` +
      `[${r.tier.padEnd(6)} conf ${String(r.confidence).padStart(3)}, share ${String(r.mode_share_pct).padStart(5)}%] ` +
      `alt ${alt.padEnd(12)} | 365d: $${r.list_price_365d} | ${(r.description||'').substring(0, 35)}`
    );
  }

  console.log('\n=== TOP 10 LOW-CONFIDENCE by revenue (needs UI verification) ===');
  const lows = rows.filter(r => r.tier === 'LOW' || r.tier === 'MEDIUM').slice(0, 15);
  for (const r of lows) {
    console.log(`  ${r.treatment_code.padEnd(9)} guess $${r.list_price} (share ${r.mode_share_pct}%) | alts: $${r.second_price}×${r.second_count}, $${r.third_price}×${r.third_count} | ${(r.description||'').substring(0, 40)}`);
  }

  console.log('\n=== CONFIRMED PRICE CHANGES (HIGH conf in both windows, differ) ===');
  const changes = rows.filter(r => r.price_changed && r.tier === 'HIGH' && r.confidence_365d >= 50 && r.window_charges >= 30);
  for (const r of changes) {
    const dir = r.list_price > r.list_price_365d ? '↑' : '↓';
    const pct = Math.round(((r.list_price - r.list_price_365d) / r.list_price_365d) * 1000) / 10;
    console.log(`  ${r.treatment_code.padEnd(9)} $${r.list_price_365d} ${dir} $${r.list_price} (${pct > 0 ? '+' : ''}${pct}%) | ${(r.description||'').substring(0, 45)}`);
  }

  const csv = ['treatment_code,description,list_price,confidence,tier,window_used,window_charges,mode_share_pct,second_price,second_count,third_price,third_count,list_price_365d,confidence_365d,uses_365d,revenue_365d,price_changed'];
  for (const r of rows) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    csv.push([r.treatment_code, `"${desc}"`, r.list_price, r.confidence, r.tier, r.window_used, r.window_charges, r.mode_share_pct, r.second_price, r.second_count, r.third_price, r.third_count, r.list_price_365d, r.confidence_365d, r.uses_365d, r.revenue_365d, r.price_changed].join(','));
  }
  fs.writeFileSync('list_prices.csv', csv.join('\n'));
  fs.writeFileSync('list_prices.json', JSON.stringify(rows, null, 2));
  console.log('\n✅ Saved list_prices.csv + list_prices.json');
}

main().catch(e => console.error(e));
