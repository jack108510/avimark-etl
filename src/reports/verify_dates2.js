import fs from 'fs';

// AUD01 regex didn't match anything. Let me look at what AUD01 records actually look like raw.
const fd = fs.openSync('C:\\AVImark\\AUDIT.V2$', 'r');
const stat = fs.statSync('C:\\AVImark\\AUDIT.V2$');
const chunkSize = 500000;
let offset = 0;
let found = 0;

console.log('=== Searching for AUD01 patterns in AUDIT.V2$ ===\n');

while (offset < stat.size && found < 20) {
  const readSize = Math.min(chunkSize, stat.size - offset);
  const buf = Buffer.alloc(readSize);
  fs.readSync(fd, buf, 0, readSize, offset);
  const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

  let idx = 0;
  while ((idx = text.indexOf('AUD01', idx)) !== -1 && found < 20) {
    // Extract context around AUD01
    const start = Math.max(0, idx - 10);
    const end = Math.min(text.length, idx + 200);
    const context = text.substring(start, end);
    console.log(`Found AUD01 at offset ${offset + idx}:`);
    console.log(`  ${context}\n`);
    found++;
    idx += 5;
  }

  offset += chunkSize - 500;
}
fs.closeSync(fd);

console.log(`\nTotal AUD01 found: ${found}`);

// Also look at what price_change records look like in Supabase
console.log('\n=== Checking Supabase price_change records ===');
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: samples } = await sb
  .from('audit_log')
  .select('*')
  .eq('category', 'price_change')
  .limit(10);

for (const s of samples || []) {
  console.log(JSON.stringify(s));
}

// Get date range of price changes
const { data: earliest } = await sb
  .from('audit_log')
  .select('date_text')
  .eq('category', 'price_change')
  .order('date_text', { ascending: true })
  .limit(5);
console.log('\nEarliest price changes:', earliest?.map(e => e.date_text));

const { data: latest } = await sb
  .from('audit_log')
  .select('date_text')
  .eq('category', 'price_change')
  .order('date_text', { ascending: false })
  .limit(5);
console.log('Latest price changes:', latest?.map(e => e.date_text));

// Check for ANEX specifically
const { data: anexChanges } = await sb
  .from('audit_log')
  .select('*')
  .eq('category', 'price_change')
  .eq('item_code', 'ANEX')
  .order('date_text', { ascending: false })
  .limit(10);
console.log('\nANEX price changes:');
for (const a of anexChanges || []) {
  console.log(`  ${a.date_text}: old=${a.old_value} new=${a.new_value}`);
}
