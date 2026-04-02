import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const allTables = [
  // Original 8
  'clients', 'animals', 'users', 'treatments', 'prices', 'audit_log', 'services', 'items',
  // New - existing in Supabase
  'visits', 'accounts', 'procedures', 'variances', 'whiteboard', 'categories', 'lookup_tables', 'resources', 'estimates',
  // New - need tables created  
  'vendors', 'problems', 'appointments', 'medical', 'prescriptions', 'vaccines', 'followups', 'diagnoses', 'usage_records', 'quotes', 'quote_details', 'prob_history',
];

console.log('Table Status Report');
console.log('='.repeat(60));

let totalRows = 0;
let tablesOk = 0;
let tablesMissing = 0;

for (const t of allTables) {
  const { data, error } = await supabase.from(t).select('record_num').limit(1);
  if (error && error.message.includes('schema cache')) {
    console.log(`  ❌ ${t.padEnd(20)} TABLE NOT CREATED`);
    tablesMissing++;
  } else if (error) {
    console.log(`  ⚠️  ${t.padEnd(20)} ERROR: ${error.message}`);
    tablesMissing++;
  } else {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ✅ ${t.padEnd(20)} ${(count || 0).toLocaleString()} rows`);
    totalRows += count || 0;
    tablesOk++;
  }
}

console.log('='.repeat(60));
console.log(`Total: ${tablesOk} tables OK (${totalRows.toLocaleString()} rows), ${tablesMissing} tables missing`);
