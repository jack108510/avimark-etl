const fs = require('fs');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  // Create table via Supabase Management API (SQL)
  const createSQL = `
    DROP TABLE IF EXISTS price_analytics;
    CREATE TABLE price_analytics (
      code TEXT PRIMARY KEY,
      name TEXT,
      price NUMERIC,
      last_modified TEXT,
      date_source TEXT,
      last_billed TEXT,
      last_price_change TEXT,
      price_file_date TEXT,
      annual_count INTEGER DEFAULT 0,
      annual_revenue NUMERIC DEFAULT 0,
      total_txns INTEGER DEFAULT 0,
      dated_txns INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE price_analytics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow anon read" ON price_analytics FOR SELECT TO anon USING (true);
  `;

  // Try via pg directly
  const { Client } = require('pg');
  // Extract connection string from Supabase URL
  const ref = url.replace('https://','').replace('.supabase.co','');
  const connStr = `postgresql://postgres.${ref}:${key}@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`;
  
  // Actually, just use the service key to insert. Let me try creating via REST first.
  const { createClient } = require('@supabase/supabase-js');
  const s = createClient(url, key);

  // Check if table exists
  const { data, error } = await s.from('price_analytics').select('code').limit(1);
  if (error && error.message.includes('does not exist')) {
    console.log('Table does not exist. Creating via Supabase SQL...');
    
    // Use the Supabase SQL endpoint
    const sqlRes = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    console.log('REST root:', sqlRes.status);
    
    console.log('\n*** Please run this SQL in Supabase SQL Editor: ***\n');
    console.log(createSQL);
    console.log('\n*** Then re-run this script to populate data ***');
    return;
  }
  
  console.log('Table exists! Populating...');
  
  // Load the prices.json we already built
  const prices = JSON.parse(fs.readFileSync('../cliniciq-dashboard/prices.json', 'utf-8'));
  console.log('Loaded', prices.length, 'price items');
  
  // Upsert in batches
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < prices.length; i += batchSize) {
    const batch = prices.slice(i, i + batchSize).map(p => ({
      code: p.code,
      name: p.name,
      price: p.price,
      last_modified: p.last_modified || null,
      date_source: p.date_source || null,
      last_billed: p.last_billed || null,
      last_price_change: p.last_price_change || null,
      price_file_date: p.price_file_date || null,
      annual_count: p.annual_count || 0,
      annual_revenue: p.annual_revenue || 0,
      total_txns: p.total_txns || 0,
      dated_txns: p.dated_txns || 0,
      updated_at: new Date().toISOString()
    }));
    
    const { error: upsertErr } = await s.from('price_analytics').upsert(batch, { onConflict: 'code' });
    if (upsertErr) {
      console.error('Upsert error at batch', i, ':', upsertErr.message);
      return;
    }
    inserted += batch.length;
  }
  console.log('Upserted', inserted, 'records');
  
  // Verify
  const { count } = await s.from('price_analytics').select('*', { count: 'exact', head: true });
  console.log('Total in table:', count);
  
  // Test anon access
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJucWhoemF0bHhteXZjY2R2cWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMTQ5ODUsImV4cCI6MjA5MDU5MDk4NX0.zokle21pVEPG5bIOFiyZIWYkYIwhkolWNOhJ7Cbub30';
  const anonRes = await fetch(`${url}/rest/v1/price_analytics?select=code,price,annual_count&limit=3`, {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey }
  });
  console.log('Anon access test:', anonRes.status);
  if (anonRes.ok) {
    const sample = await anonRes.json();
    console.log('Sample:', JSON.stringify(sample));
  }
}

main();
