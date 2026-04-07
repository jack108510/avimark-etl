#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // Full billing distribution for 303A in last 365 days
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  console.log(`=== 303A billing for last 365 days (since ${cutoffStr}) ===`);
  const { data: svcs } = await sb.from('services')
    .select('amount,description,service_date')
    .eq('code', '303A')
    .gte('service_date', cutoffStr)
    .gt('amount', 0)
    .order('service_date', { ascending: true });

  const counts = new Map();
  let total = 0;
  const byYear = new Map();
  for (const s of svcs || []) {
    counts.set(s.amount, (counts.get(s.amount) || 0) + 1);
    total++;
    const y = s.service_date.substring(0, 7); // YYYY-MM
    if (!byYear.has(y)) byYear.set(y, new Map());
    const m = byYear.get(y);
    m.set(s.amount, (m.get(s.amount) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Total (positive): ${total}`);
  console.log('Amount distribution:');
  for (const [amt, n] of sorted) {
    console.log(`  $${amt} × ${n}`);
  }

  console.log('\n=== Timeline: dominant amount by month (all time, positive) ===');
  const { data: all } = await sb.from('services')
    .select('amount,service_date')
    .eq('code', '303A')
    .gt('amount', 0)
    .order('service_date', { ascending: true });

  const months = new Map();
  for (const s of all || []) {
    if (!s.service_date) continue;
    const ym = s.service_date.substring(0, 7);
    if (!months.has(ym)) months.set(ym, new Map());
    const m = months.get(ym);
    m.set(s.amount, (m.get(s.amount) || 0) + 1);
  }
  const sortedMonths = [...months.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  let prevDom = null;
  for (const [ym, m] of sortedMonths) {
    const top = [...m.entries()].sort((a,b) => b[1] - a[1])[0];
    const marker = (prevDom !== null && prevDom !== top[0]) ? ' ← CHANGE' : '';
    console.log(`  ${ym}: dominant $${top[0]} (${top[1]}x) ${marker}`);
    prevDom = top[0];
  }
}

main().catch(e => console.error(e));
