import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
});

// Strategy: We can't run DDL via PostgREST.
// But we CAN create tables by using the Supabase client to insert rows
// into tables that already exist, and for tables that don't exist,
// we need to find a workaround.

// Let's try: create an RPC function using a migration workaround
// First check if we can use the pg_catalog to create functions

// Actually, the simplest approach: use supabase-js to call the raw HTTP endpoint
// with a trusted role that supports DDL

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Supabase recently added /pg/query for trusted service role connections
const endpoints = [
  `${SUPABASE_URL}/pg/query`,
  `${SUPABASE_URL}/rest/v1/query`,
];

const statements = [
  `CREATE TABLE IF NOT EXISTS vendors (record_num INTEGER PRIMARY KEY, vendor_date TIMESTAMP, code TEXT, name TEXT, account_ref TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS problems (record_num INTEGER PRIMARY KEY, prob_date TIMESTAMP, code TEXT, name TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS appointments (record_num INTEGER PRIMARY KEY, appt_date TIMESTAMP, flags INTEGER, doctor TEXT, reason TEXT, field_40 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS medical (record_num INTEGER PRIMARY KEY, record_date TIMESTAMP, flags INTEGER, type_byte INTEGER, doctor TEXT, service_ref INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS prescriptions (record_num INTEGER PRIMARY KEY, rx_date TIMESTAMP, flags INTEGER, type_byte INTEGER, ref_id INTEGER, field_45 INTEGER, field_46 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS vaccines (record_num INTEGER PRIMARY KEY, vaccine_date TIMESTAMP, serial_number TEXT, doctor TEXT, manufacturer TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS followups (record_num INTEGER PRIMARY KEY, follow_date TIMESTAMP, code TEXT, description TEXT, doctor TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS diagnoses (record_num INTEGER PRIMARY KEY, diag_date TIMESTAMP, flags INTEGER, field_44 INTEGER, field_46 INTEGER, field_49 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS usage_records (record_num INTEGER PRIMARY KEY, usage_date TIMESTAMP, flags INTEGER, field_40 INTEGER, field_44 INTEGER, field_48 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotes (record_num INTEGER PRIMARY KEY, quote_date TIMESTAMP, name TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quote_details (record_num INTEGER PRIMARY KEY, line_date TIMESTAMP, code TEXT, description TEXT, quantity INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS prob_history (record_num INTEGER PRIMARY KEY, hist_date TIMESTAMP, code TEXT, "text" TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
];

let success = false;

for (const endpoint of endpoints) {
  console.log(`Trying ${endpoint}...`);
  for (const sql of statements) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS "?(\w+)/)?.[1];
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (resp.ok) {
        console.log(`  ✅ ${tableName}`);
        success = true;
      } else {
        const body = await resp.text();
        console.log(`  ❌ ${tableName}: ${resp.status}`);
        break; // This endpoint doesn't work
      }
    } catch (err) {
      console.log(`  ❌ ${tableName}: ${err.message}`);
      break;
    }
  }
  if (success) break;
}

if (!success) {
  console.log('\n❌ Could not create tables automatically.');
  console.log('Please run the following SQL in the Supabase SQL editor:');
  console.log('https://supabase.com/dashboard/project/rnqhhzatlxmyvccdvqkr/sql/new\n');
  console.log(statements.join(';\n\n') + ';');
}
