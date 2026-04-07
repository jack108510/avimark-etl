#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // Top 15 codes by revenue
  const { data: top, error } = await sb
    .from('pricing_dashboard')
    .select('treatment_code,description,current_price,fee_schedule_price,price_mismatch,usage_365d,annual_revenue')
    .order('annual_revenue', { ascending: false })
    .limit(15);
  if (error) { console.error(error); return; }

  console.log('\n=== TOP 15 by annual revenue ===');
  for (const r of top) {
    const flag = r.price_mismatch ? ' ⚠️' : '';
    const desc = (r.description || '').substring(0, 40);
    console.log(`${r.treatment_code.padEnd(8)} $${String(r.current_price).padEnd(8)} (fee $${r.fee_schedule_price})${flag} | used ${r.usage_365d}x | rev $${r.annual_revenue} | ${desc}`);
  }

  // Cross-check a few codes against raw services
  const codes = ['HC', 'BL', 'ANEX', '0007'];
  console.log('\n=== Cross-check vs raw services (last 365d) ===');
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  for (const code of codes) {
    const { data: svcs } = await sb
      .from('services')
      .select('amount,description,service_date')
      .eq('code', code)
      .gte('service_date', cutoffStr)
      .gt('amount', 0)
      .limit(5000);
    if (!svcs) continue;
    const counts = new Map();
    const descs = new Map();
    for (const s of svcs) {
      counts.set(s.amount, (counts.get(s.amount) || 0) + 1);
      if (s.description) descs.set(s.description, (descs.get(s.description) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topDesc = [...descs.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`${code}: top amounts → ${sorted.map(([a, n]) => `$${a}×${n}`).join(', ')} | desc: "${topDesc?.[0]}"`);
  }

  // Check total row count
  const { count } = await sb.from('pricing_dashboard').select('*', { count: 'exact', head: true });
  console.log(`\nTotal rows in pricing_dashboard: ${count}`);

  // How many have null descriptions?
  const { count: nullDesc } = await sb.from('pricing_dashboard').select('*', { count: 'exact', head: true }).is('description', null);
  console.log(`Rows with NULL description: ${nullDesc}`);

  // How many with usage > 0?
  const { count: used } = await sb.from('pricing_dashboard').select('*', { count: 'exact', head: true }).gt('usage_365d', 0);
  console.log(`Rows with usage_365d > 0: ${used}`);
}

main().catch(e => console.error(e));
