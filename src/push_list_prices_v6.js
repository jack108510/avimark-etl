#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const rows = JSON.parse(fs.readFileSync('list_prices_v6.json', 'utf8'));
  console.log(`Loaded ${rows.length} rows`);

  // Normalize to match table schema
  const payload = rows.map(r => ({
    treatment_code: r.treatment_code,
    description: r.description,
    list_price: r.list_price,
    last_changed: r.last_changed,
    months_held: r.months_held ?? null,
    confidence: r.confidence,
    tier: r.tier,
    share_pct: r.share_pct,
    charges_in_run: r.charges_in_run,
    alt1_price: r.previous_price ?? null,
    alt1_count: null,
    alt2_price: null,
    alt2_count: null,
    drifting: r.drifting ?? false,
    drift_price: r.drift_price ?? null,
    drift_months: r.drift_months ?? 0,
    uses_365d: r.uses_365d,
    revenue_365d: r.revenue_365d,
  }));

  // Clear existing
  console.log('Clearing list_prices...');
  const { error: delErr } = await sb.from('list_prices').delete().not('treatment_code', 'is', null);
  if (delErr) { console.error('Delete:', delErr.message); return; }

  // Batch upsert
  console.log('Uploading...');
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH);
    const { error } = await sb.from('list_prices').upsert(batch, { onConflict: 'treatment_code' });
    if (error) {
      console.error(`Batch ${i}:`, error.message);
      console.error('Sample:', JSON.stringify(batch[0]));
      return;
    }
    done += batch.length;
    process.stdout.write(`  ${done}/${payload.length}\r`);
  }
  console.log(`\n✅ ${done} rows uploaded to list_prices`);

  // Verify
  const { count } = await sb.from('list_prices').select('*', { count: 'exact', head: true });
  console.log(`Verified: list_prices now has ${count} rows`);
}

main().catch(e => console.error(e));
