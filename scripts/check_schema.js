import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Test upsert with actual parser output to find column mismatches
const testData = {
  categories: { record_num: -1, cat_date: null, name: 'test' },
  lookup_tables: { record_num: -1, tbl_date: null, code: 'x', name: 'test' },
  resources: { record_num: -1, res_date: null, code: 'x', description: 'test' },
  estimates: { record_num: -1, est_date: null, name: 'test' },
  visits: { record_num: -1, visit_date: null, type_code: 0, ref_id: 0, doctor: '', field_48: 0, field_53: 0 },
  accounts: { record_num: -1, txn_date: null, description: '', entry_type: '', cost: 0, quantity: 0, amount: 0 },
  procedures: { record_num: -1, proc_date: null, code: '', description: '', category: '', species: '' },
  variances: { record_num: -1, var_date: null, code: '', doctor: '', quantity: 0, amount: 0, secondary_code: '' },
  whiteboard: { record_num: -1, wb_date: null, description: '', doctor: '', code: '' },
};

for (const [table, row] of Object.entries(testData)) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'record_num' });
  if (error) {
    console.log(`❌ ${table}: ${error.message}`);
  } else {
    console.log(`✅ ${table}: OK`);
    // Clean up test row
    await supabase.from(table).delete().eq('record_num', -1);
  }
}
