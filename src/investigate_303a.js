#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  // 1. What's in the prices table for 303A?
  console.log('=== prices table (fee schedule from PRICE.V2$) ===');
  const { data: prices } = await sb.from('prices').select('*').eq('treatment_code', '303A');
  console.log(JSON.stringify(prices, null, 2));

  // 2. Look for anything matching euthanasia
  console.log('\n=== prices table matching euthanasia-ish codes ===');
  const { data: euths } = await sb.from('prices')
    .select('treatment_code,price,last_changed')
    .ilike('treatment_code', '303%');
  console.log(JSON.stringify(euths, null, 2));

  // 3. Full billing distribution for 303A
  console.log('\n=== services: ALL amounts for 303A (all time) ===');
  const { data: svcs } = await sb.from('services')
    .select('amount,description,service_date')
    .eq('code', '303A')
    .order('service_date', { ascending: false })
    .limit(2000);
  const counts = new Map();
  let total = 0;
  for (const s of svcs || []) {
    counts.set(s.amount, (counts.get(s.amount) || 0) + 1);
    total++;
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Total records: ${total}`);
  console.log('Amount distribution:');
  for (const [amt, n] of sorted.slice(0, 15)) {
    console.log(`  $${amt} × ${n}`);
  }
  console.log('\nSample records:');
  for (const s of (svcs || []).slice(0, 5)) {
    console.log(`  ${s.service_date} | $${s.amount} | ${s.description}`);
  }

  // 4. Check if $371.20 appears anywhere else
  console.log('\n=== Any code with price exactly $371.20? ===');
  const { data: matches } = await sb.from('prices')
    .select('treatment_code,price,last_changed')
    .gte('price', 371.19)
    .lte('price', 371.21);
  console.log(JSON.stringify(matches, null, 2));
}

main().catch(e => console.error(e));
