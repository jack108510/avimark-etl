import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ['categories','lookup_tables','resources','estimates','visits','accounts','procedures','variances','whiteboard'];

for (const t of tables) {
  // Insert test data with only record_num to see defaults
  const { data, error } = await supabase.from(t).insert({ record_num: -99999 }).select();
  if (error) {
    console.log(`${t}: INSERT error - ${error.message}`);
  } else {
    // Show column names and types from returned data
    const row = data[0];
    const cols = Object.entries(row).map(([k, v]) => `${k}(${v === null ? 'null' : typeof v})`);
    console.log(`${t}: ${cols.join(', ')}`);
    // Clean up
    await supabase.from(t).delete().eq('record_num', -99999);
  }
}
