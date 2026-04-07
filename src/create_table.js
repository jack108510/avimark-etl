#!/usr/bin/env node
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

const sql = `
CREATE TABLE IF NOT EXISTS list_prices (
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
CREATE INDEX IF NOT EXISTS idx_list_prices_tier ON list_prices(tier);
CREATE INDEX IF NOT EXISTS idx_list_prices_revenue ON list_prices(revenue_365d DESC);
`;

// Use Supabase's SQL endpoint via pg-meta
const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql }),
});
const txt = await res.text();
console.log('Status:', res.status);
console.log('Body:', txt);
