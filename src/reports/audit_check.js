import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function parseDate(s) {
  if (!s) return null;
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  // MM-DD-YY
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) { let y = +m[3]; y = y >= 50 ? 1900+y : 2000+y; return new Date(y, +m[1]-1, +m[2]); }
  // DD/MM/YYYY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

// Get all AUD01 price_change entries where both values are meaningful
let all = [];
let from = 0;
while (true) {
  const { data } = await sb.from('audit_log')
    .select('item_code, date_text, old_value, new_value')
    .eq('category', 'price_change')
    .neq('new_value', 0)
    .gt('old_value', 0)
    .range(from, from + 999);
  if (!data || data.length === 0) break;
  all = all.concat(data);
  from += data.length;
  if (data.length < 1000) break;
}

console.log('Total REAL price changes (old>0, new!=0): ' + all.length);

// Find the most recent REAL change per code
const lastReal = {};
for (const a of all) {
  if (!a.item_code) continue;
  if (a.old_value === a.new_value) continue;
  if (a.new_value < 0) continue; // credits/reversals
  const d = parseDate(a.date_text);
  if (!d || isNaN(d.getTime())) continue;
  if (!lastReal[a.item_code] || d > lastReal[a.item_code].date) {
    lastReal[a.item_code] = { date: d, old: a.old_value, new: a.new_value, dateStr: a.date_text };
  }
}

console.log('Codes with real price changes: ' + Object.keys(lastReal).length);
console.log('\nVerified last REAL price changes:');
const testCodes = ['ANEX', 'FLU', '100', 'BL', 'HN', '2VW', 'VACC9', 'GERI', 'REEX', 'PROF', 'V3', 'PRE', 'MISC', 'CS', 'CS1', 'CS2', 'NAILT', 'INJ3'];
for (const code of testCodes) {
  const r = lastReal[code];
  if (r) {
    console.log('  ' + code.padEnd(10) + r.date.toISOString().split('T')[0] + '  $' + r.old + ' -> $' + r.new);
  } else {
    console.log('  ' + code.padEnd(10) + 'NO REAL CHANGES FOUND');
  }
}

// Show year distribution of last changes
const yearDist = {};
for (const [code, r] of Object.entries(lastReal)) {
  const y = r.date.getFullYear();
  yearDist[y] = (yearDist[y] || 0) + 1;
}
console.log('\nLast-change year distribution:');
for (const [y, count] of Object.entries(yearDist).sort()) {
  console.log('  ' + y + ': ' + count + ' codes');
}
