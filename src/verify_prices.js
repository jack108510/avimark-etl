#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const codes = ['HC','HEF','ANEX','V1','0023','GERI','2VW','BLO','DENTCALA','F2Y','0714','109257','FEFIV','URIN2','CYSTO'];

for (const code of codes) {
  // Dashboard price
  const { data: dash } = await sb.from('pricing_dashboard').select('current_price').eq('treatment_code', code).limit(1);
  
  // All prices for this code from PRICE.V2$
  const { data: allPrices } = await sb.from('prices').select('price,last_changed').eq('treatment_code', code).order('last_changed', { ascending: false });
  
  // Most common charge amount from services (last 1000 positive charges)
  const { data: svcSample } = await sb.from('services').select('amount').eq('code', code).gt('amount', 0).limit(1000);
  
  let mostCommon = '—';
  if (svcSample && svcSample.length > 0) {
    const counts = {};
    for (const s of svcSample) {
      counts[s.amount] = (counts[s.amount] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    mostCommon = sorted.slice(0, 3).map(([amt, n]) => `$${amt} (${n}x)`).join(', ');
  }
  
  const dashPrice = dash && dash[0] ? `$${dash[0].current_price}` : '—';
  const priceCount = allPrices ? allPrices.length : 0;
  const latestV2 = allPrices && allPrices[0] ? `$${allPrices[0].price} (${(allPrices[0].last_changed || '?').substring(0, 10)})` : '—';
  
  console.log(`${code}:`);
  console.log(`  Dashboard:     ${dashPrice}`);
  console.log(`  PRICE.V2$ x${priceCount}: ${latestV2}`);
  console.log(`  Billing top3:  ${mostCommon}`);
  
  // Flag mismatch
  if (dash && dash[0] && svcSample && svcSample.length > 0) {
    const counts = {};
    for (const s of svcSample) counts[s.amount] = (counts[s.amount] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const billingPrice = parseFloat(sorted[0][0]);
    if (Math.abs(billingPrice - dash[0].current_price) > 0.01) {
      console.log(`  ⚠️  MISMATCH: Dashboard=$${dash[0].current_price} vs Billing=$${billingPrice}`);
    } else {
      console.log(`  ✅ Match`);
    }
  }
  console.log();
}
