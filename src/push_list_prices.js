#!/usr/bin/env node
/**
 * Push list_prices_v4.json to Supabase table `list_prices`.
 * Creates a spot-check list of 25 HIGH-confidence codes for Avimark UI verification.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const rows = JSON.parse(fs.readFileSync('list_prices_v4.json', 'utf8'));
  console.log(`Loaded ${rows.length} rows from list_prices_v4.json`);

  // Normalize: bools, nulls
  const payload = rows.map(r => ({
    treatment_code: r.treatment_code,
    description: r.description,
    list_price: r.list_price,
    last_changed: r.last_changed,
    months_held: r.months_held,
    confidence: r.confidence,
    tier: r.tier,
    share_pct: r.share_pct,
    charges_in_run: r.charges_in_run,
    alt1_price: r.alt1_price,
    alt1_count: r.alt1_count,
    alt2_price: r.alt2_price,
    alt2_count: r.alt2_count,
    drifting: r.drifting,
    drift_price: r.drift_price,
    drift_months: r.drift_months,
    uses_365d: r.uses_365d,
    revenue_365d: r.revenue_365d,
  }));

  // Delete existing
  console.log('Clearing existing list_prices table...');
  const { error: delErr } = await sb.from('list_prices').delete().not('treatment_code', 'is', null);
  if (delErr) {
    if (delErr.message.includes('does not exist') || delErr.code === '42P01') {
      console.log('\n⚠️  Table does not exist. Run this SQL in Supabase first:\n');
      console.log(`CREATE TABLE list_prices (
  treatment_code text PRIMARY KEY,
  description text,
  list_price numeric,
  last_changed date,
  months_held int,
  confidence int,
  tier text,
  share_pct numeric,
  charges_in_run int,
  alt1_price numeric,
  alt1_count int,
  alt2_price numeric,
  alt2_count int,
  drifting boolean,
  drift_price numeric,
  drift_months int,
  uses_365d int,
  revenue_365d numeric,
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_list_prices_tier ON list_prices(tier);
CREATE INDEX idx_list_prices_revenue ON list_prices(revenue_365d DESC);`);
      return;
    }
    console.error('Delete error:', delErr);
  }

  // Batch upsert
  console.log('Upserting rows in batches of 500...');
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH);
    const { error } = await sb.from('list_prices').upsert(batch, { onConflict: 'treatment_code' });
    if (error) {
      console.error(`  Error at batch ${i}:`, error.message);
      console.error('  Sample row:', JSON.stringify(batch[0], null, 2));
      return;
    }
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${payload.length}\r`);
  }
  console.log(`\n✅ ${inserted} rows upserted to list_prices`);

  // Build spot-check list: 25 items to verify in Avimark UI
  // Mix: top-revenue HIGH + a few drifting + a few LOW to confirm algorithm
  const high = rows.filter(r => r.tier === 'HIGH' && !r.drifting);
  const drifting = rows.filter(r => r.drifting && r.tier === 'HIGH' && r.drift_months >= 2);
  const lows = rows.filter(r => r.tier === 'LOW' && r.revenue_365d > 1000);

  const spotCheck = [];
  // 15 highest-revenue HIGH stable codes
  spotCheck.push(...high.slice(0, 15).map(r => ({ ...r, check_reason: 'TOP_HIGH' })));
  // 7 drifting codes to verify the new price
  spotCheck.push(...drifting.slice(0, 7).map(r => ({ ...r, check_reason: 'DRIFT_CHECK' })));
  // 3 LOW codes to confirm they actually need manual review
  spotCheck.push(...lows.slice(0, 3).map(r => ({ ...r, check_reason: 'LOW_REVIEW' })));

  console.log('\n\n========================================');
  console.log('   25-ITEM SPOT-CHECK LIST (for Avimark UI verification)');
  console.log('========================================\n');

  console.log('## GROUP A: 15 HIGH-CONFIDENCE STABLE PRICES (should match Avimark exactly)\n');
  spotCheck.filter(s => s.check_reason === 'TOP_HIGH').forEach((r, i) => {
    console.log(`${String(i+1).padStart(2)}. ${r.treatment_code.padEnd(10)} $${String(r.list_price).padEnd(7)} — ${r.description}`);
    console.log(`    conf ${r.confidence} | share ${r.share_pct}% | stable for ${r.months_held}mo since ${r.last_changed.substring(0,7)}`);
  });

  console.log('\n## GROUP B: 7 DRIFTING CODES (need to know if NEW price is the real one now)\n');
  spotCheck.filter(s => s.check_reason === 'DRIFT_CHECK').forEach((r, i) => {
    console.log(`${i+16}. ${r.treatment_code.padEnd(10)} OLD $${r.list_price} → NEW $${r.drift_price}  — ${r.description}`);
    console.log(`    What does Avimark show right now? ${r.drift_months} month(s) at new price`);
  });

  console.log('\n## GROUP C: 3 LOW-CONFIDENCE CODES (volatile — need manual price from UI)\n');
  spotCheck.filter(s => s.check_reason === 'LOW_REVIEW').forEach((r, i) => {
    console.log(`${i+23}. ${r.treatment_code.padEnd(10)} guess $${r.list_price} (only ${r.share_pct}% share) — ${r.description}`);
    console.log(`    alts: $${r.alt1_price}×${r.alt1_count}, $${r.alt2_price}×${r.alt2_count}`);
  });

  // Save as CSV for easy printing
  const csv = ['group,code,our_price,drift_price,description,confidence,share_pct,months_held,last_changed,alt1,alt2,avimark_price,notes'];
  for (const r of spotCheck) {
    const desc = (r.description || '').replace(/"/g, '""').replace(/,/g, ' ');
    const group = r.check_reason === 'TOP_HIGH' ? 'A_HIGH' : r.check_reason === 'DRIFT_CHECK' ? 'B_DRIFT' : 'C_LOW';
    csv.push([group, r.treatment_code, r.list_price, r.drift_price || '', `"${desc}"`, r.confidence, r.share_pct, r.months_held, r.last_changed, `$${r.alt1_price}x${r.alt1_count}`, `$${r.alt2_price}x${r.alt2_count}`, '', ''].join(','));
  }
  fs.writeFileSync('spot_check_25.csv', csv.join('\n'));
  console.log('\n\n✅ Saved spot_check_25.csv — fill in `avimark_price` column as you verify');
}

main().catch(e => console.error(e));
