import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Test categories with different field_type values
const tests = [
  { record_num: -1, name: 'test1', description: 'test desc', field_type: 'text value' },
  { record_num: -2, name: 'test2', description: 'test desc', field_type: 42 },
  { record_num: -3, name: 'test3', description: 'test desc', field_type: null },
];

for (const t of tests) {
  const { error } = await supabase.from('categories').upsert(t, { onConflict: 'record_num' });
  console.log(`field_type=${JSON.stringify(t.field_type)}: ${error ? '❌ ' + error.message : '✅ OK'}`);
}

// Also test estimates
const estTests = [
  { record_num: -1, estimate_date: '2024-01-01 12:00:00', description: 'test' },
  { record_num: -2, estimate_date: null, description: 'test', amount: 123.45 },
  { record_num: -3, estimate_date: null, description: 'test', status: 'active' },
];
for (const t of estTests) {
  const { error } = await supabase.from('estimates').upsert(t, { onConflict: 'record_num' });
  console.log(`estimates ${JSON.stringify(t)}: ${error ? '❌ ' + error.message : '✅ OK'}`);
}

// Clean up
await supabase.from('categories').delete().lt('record_num', 0);
await supabase.from('estimates').delete().lt('record_num', 0);
