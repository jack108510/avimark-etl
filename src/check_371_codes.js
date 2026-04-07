#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const codes = ['303A', 'GER5', '100', 'BLOOD1'];
  for (const code of codes) {
    const { data: svcs } = await sb.from('services')
      .select('amount')
      .eq('code', code)
      .gt('amount', 0);
    const counts = new Map();
    for (const s of svcs || []) counts.set(s.amount, (counts.get(s.amount) || 0) + 1);
    const top = [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 3);
    console.log(`${code}: total=${svcs?.length || 0} | top amounts: ${top.map(([a,n]) => `$${a}×${n}`).join(', ')}`);
  }

  // Also check distribution of prices in fee schedule — is 371.20 suspiciously common overall?
  const { data: allPrices } = await sb.from('prices').select('price').not('price', 'is', null);
  const priceCounts = new Map();
  for (const p of allPrices || []) priceCounts.set(p.price, (priceCounts.get(p.price) || 0) + 1);
  const duplicates = [...priceCounts.entries()].filter(([_,n]) => n >= 3).sort((a,b) => b[1] - a[1]).slice(0, 15);
  console.log('\n=== Most common exact prices in PRICE.V2$ (3+ codes share same price) ===');
  for (const [p, n] of duplicates) console.log(`  $${p} shared by ${n} codes`);
}

main().catch(e => console.error(e));
