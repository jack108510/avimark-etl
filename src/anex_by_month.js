import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const all = [];
let page = 0;
while (true) {
  const { data } = await sb.from('services').select('amount, service_date').eq('code', 'ANEX').gt('amount', 0).range(page*1000, page*1000+999);
  if (!data || data.length === 0) break;
  all.push(...data);
  page++;
  if (data.length < 1000) break;
}

console.log('Total ANEX positive records:', all.length);

const byMonth = {};
let skipped = 0;
for (const r of all) {
  if (!r.service_date || r.service_date.startsWith('2019-02-03')) { skipped++; continue; }
  const month = r.service_date.slice(0, 7);
  if (!byMonth[month]) byMonth[month] = {};
  byMonth[month][r.amount] = (byMonth[month][r.amount] || 0) + 1;
}
console.log('Skipped (unreliable dates):', skipped);
console.log();

const months = Object.keys(byMonth).sort();
console.log('ANEX charges by month:');
for (const m of months) {
  const entries = Object.entries(byMonth[m]).sort((a,b) => Number(b[0])-Number(a[0]));
  const summary = entries.map(([amt, cnt]) => `$${amt}x${cnt}`).join('  ');
  console.log(m, '|', summary);
}
