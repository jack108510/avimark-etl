#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Tables the dashboard queries
const checks = [
  ['services', 'code,amount,quantity,service_type', 3],
  ['services', 'code,description,amount,service_date', 3],
  ['prices', 'treatment_code,price,updated_at', 3],
  ['treatments', 'code,name', 3],
  ['accounts', 'txn_date,amount_raw,type_flag', 3],
  ['list_prices', 'treatment_code,list_price,last_changed,confidence,tier', 3],
  ['clinic_settings', '*', 1],
];

for (const [table, select, limit] of checks) {
  const { data, error } = await sb.from(table).select(select).limit(limit);
  if (error) {
    console.log(`❌ ${table} (${select.substring(0,40)}): ${error.message}`);
  } else {
    console.log(`✅ ${table}: ${data.length} sample rows`);
    if (data[0]) console.log(`   Sample: ${JSON.stringify(data[0]).substring(0, 200)}`);
  }
}
