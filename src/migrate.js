#!/usr/bin/env node
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const statements = [
  'ALTER TABLE prices ADD COLUMN IF NOT EXISTS last_changed text',
  'ALTER TABLE services ADD COLUMN IF NOT EXISTS service_date text',
  'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost double precision',
];

async function runSQL(sql) {
  console.log(`Running: ${sql}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({}),
  });
  // PostgREST doesn't do raw SQL. Try pg-meta endpoint instead.
  return res;
}

// Supabase doesn't expose raw SQL via PostgREST. 
// We'll try to upsert a record with the new columns to see if they exist,
// and if not, output the SQL to run manually.
async function checkAndAddColumns() {
  // Try prices
  console.log('\nChecking if columns exist...\n');
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  // Test prices.last_changed
  let res = await fetch(`${SUPABASE_URL}/rest/v1/prices?select=last_changed&limit=1`, { headers });
  if (res.ok) {
    console.log('✅ prices.last_changed already exists');
  } else {
    console.log('❌ prices.last_changed missing — need ALTER TABLE');
  }

  // Test services.service_date
  res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=service_date&limit=1`, { headers });
  if (res.ok) {
    console.log('✅ services.service_date already exists');
  } else {
    console.log('❌ services.service_date missing — need ALTER TABLE');
  }

  // Test purchase_orders.cost
  res = await fetch(`${SUPABASE_URL}/rest/v1/purchase_orders?select=cost&limit=1`, { headers });
  if (res.ok) {
    console.log('✅ purchase_orders.cost already exists');
  } else {
    console.log('❌ purchase_orders.cost missing — need ALTER TABLE');
  }

  console.log('\n--- Run these in Supabase SQL Editor if columns are missing ---');
  for (const s of statements) {
    console.log(s + ';');
  }
}

checkAndAddColumns().catch(console.error);
