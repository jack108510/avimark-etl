import fs from 'fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DELPHI_EPOCH = new Date(1899, 11, 30).getTime();

// Check PO.V2$ (purchase orders)
const poFd = fs.openSync('C:\\AVImark\\PO.V2$', 'r');
const poStat = fs.statSync('C:\\AVImark\\PO.V2$');
const recSize = 64;
const totalRecs = Math.floor(poStat.size / recSize);
console.log(`PO.V2$ — ${totalRecs} records @ ${recSize} bytes\n`);

// Sample from various positions
for (const pos of [0, 1, 100, 1000, 10000, totalRecs-5, totalRecs-1]) {
  if (pos >= totalRecs) continue;
  const buf = Buffer.alloc(recSize);
  fs.readSync(poFd, buf, 0, recSize, pos * recSize);
  
  let ascii = '';
  for (let i = 0; i < recSize; i++) {
    const b = buf[i];
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
  }
  
  const dates = [];
  for (let off = 0; off + 8 <= recSize; off++) {
    try {
      const v = buf.readDoubleLE(off);
      if (v > 35000 && v < 47000) {
        const dt = new Date(DELPHI_EPOCH + v * 86400000);
        dates.push(`@${off}=${dt.toISOString().split('T')[0]}`);
      }
    } catch(e) {}
  }
  
  console.log(`Rec ${pos}: ${ascii}`);
  if (dates.length) console.log(`  DATES: ${dates.join(', ')}`);
}
fs.closeSync(poFd);

// Check ITEM.V2$ for on-hand / reorder
console.log('\n\n--- ITEM.V2$ inventory fields ---');
const iFd = fs.openSync('C:\\AVImark\\ITEM.V2$', 'r');
for (let r = 0; r < 5; r++) {
  const buf = Buffer.alloc(549);
  fs.readSync(iFd, buf, 0, 549, r * 549);
  const codeLen = Math.min(buf[41] || 0, 12);
  const code = codeLen > 0 ? buf.toString('ascii', 42, 42 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  const nameLen = Math.min(buf[51] || 0, 40);
  const name = nameLen > 0 ? buf.toString('ascii', 52, 52 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() : '';
  
  // Scan for int32 fields that look like quantities
  const fields = [];
  for (let off = 100; off < 250; off += 4) {
    const v = buf.readInt32LE(off);
    if (v !== 0) fields.push(`@${off}=${v}`);
  }
  console.log(`${code.padEnd(12)} ${name.substring(0,35).padEnd(37)} ${fields.slice(0,8).join(', ')}`);
}
fs.closeSync(iFd);

// Check related V2$ files
console.log('\n\n--- Inventory-related V2$ files ---');
const allFiles = fs.readdirSync('C:\\AVImark').filter(f => f.endsWith('.V2$'));
const inventoryFiles = allFiles.filter(f => /ITEM|PO|USAGE|VENDOR|RECV|STOCK|INVEN|REORD/i.test(f));
for (const f of inventoryFiles) {
  const s = fs.statSync('C:\\AVImark\\' + f);
  if (s.size > 0) console.log(`${f.padEnd(20)} ${(s.size/1024/1024).toFixed(2)} MB`);
}

// Check usage_records for what it tracks
console.log('\n\n--- Usage records sample ---');
const { data: usage } = await sb.from('usage_records').select('*').order('usage_date', { ascending: false }).limit(10);
for (const u of usage || []) {
  console.log(`  ${u.usage_date?.substring(0,10)}  flags=${u.flags}  f40=${u.field_40}  f44=${u.field_44}  f48=${u.field_48}`);
}
