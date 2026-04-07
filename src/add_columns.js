#!/usr/bin/env node
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const ref = url.replace('https://', '').replace('.supabase.co', '');

async function tryManagementAPI(sql) {
  // Supabase Management API
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

async function tryPgMeta(sql) {
  // Try /pg endpoint
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

// Step 1: Create exec_sql function
const createFn = `CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS void AS $fn$ BEGIN EXECUTE query; END; $fn$ LANGUAGE plpgsql SECURITY DEFINER`;

console.log('Trying Management API to create exec_sql...');
let result = await tryManagementAPI(createFn);
console.log('  Status:', result.status, result.body.substring(0, 200));

if (result.status !== 200 && result.status !== 201) {
  console.log('\nTrying pg-meta endpoint...');
  result = await tryPgMeta(createFn);
  console.log('  Status:', result.status, result.body.substring(0, 200));
}

// Step 2: If we got the function, use it via RPC
const alters = [
  'ALTER TABLE prices ADD COLUMN IF NOT EXISTS last_changed text',
  'ALTER TABLE services ADD COLUMN IF NOT EXISTS service_date text',
  'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost double precision',
];

console.log('\nNow trying to run ALTERs via RPC...');
for (const sql of alters) {
  console.log(`\nRunning: ${sql}`);
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  console.log('  Status:', res.status, (await res.text()).substring(0, 200));
}

// Verify
console.log('\nVerifying columns...');
for (const [table, col] of [['prices','last_changed'],['services','service_date'],['purchase_orders','cost']]) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${col}&limit=1`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
  });
  console.log(`  ${table}.${col}: ${res.ok ? '✅ exists' : '❌ missing'}`);
}
