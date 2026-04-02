import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ['categories','lookup_tables','resources','estimates','visits','accounts','procedures','variances','whiteboard'];

for (const t of tables) {
  // Insert a row with just record_num to see what comes back
  const { data, error } = await supabase.from(t).select('*').limit(1);
  if (error) {
    console.log(`${t}: ERROR - ${error.message}`);
  } else if (data && data.length > 0) {
    console.log(`${t}: columns = ${Object.keys(data[0]).join(', ')}`);
  } else {
    // Empty table, try inserting to discover columns from error
    const { data: d2, error: e2 } = await supabase.from(t).insert({ record_num: -999 }).select();
    if (e2) {
      console.log(`${t}: (empty) insert error = ${e2.message}`);
    } else {
      console.log(`${t}: (empty) columns = ${Object.keys(d2[0]).join(', ')}`);
      await supabase.from(t).delete().eq('record_num', -999);
    }
  }
}
