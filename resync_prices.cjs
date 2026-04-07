const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const buf = fs.readFileSync('C:/AVImark/PRICE.V2$');
  
  // From the parser: recSize=108, code@43 (8 chars), price@58 (Delphi currency int64/10000)
  const recSize = 108;
  const codeOffset = 43;
  const priceOffset = 58;
  
  const totalRec = Math.floor(buf.length / recSize);
  const prices = [];
  
  console.log('Parsing PRICE.V2$ with recSize=108, code@43, price@58');
  console.log('Total records:', totalRec);
  
  for (let i = 0; i < totalRec; i++) {
    const off = i * recSize;
    if (off + Math.max(codeOffset + 8, priceOffset + 8) > buf.length) break;
    
    // Extract code (8 bytes at offset 43)
    let code = buf.toString('latin1', off + codeOffset, off + codeOffset + 8).trim();
    code = code.replace(/[^A-Za-z0-9]/g, '');
    if (!code || code.length === 0) continue;
    
    // Extract price (int64 at offset 58, divide by 10000)
    const priceDelphi = buf.readBigInt64LE(off + priceOffset);
    const price = Number(priceDelphi) / 10000;
    
    if (price <= 0 || price > 50000) continue;
    
    prices.push({
      treatment_code: code,
      price: parseFloat(price.toFixed(2)),
      record_num: i
    });
  }
  
  console.log(`\nExtracted ${prices.length} prices`);
  console.log('Sample:');
  prices.sort((a, b) => b.price - a.price).slice(0, 20).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.treatment_code.padEnd(10)} $${p.price.toFixed(2)}`);
  });
  
  // Get all treatment_code->id mappings from Supabase
  let allSB = [];
  let from = 0;
  while (true) {
    const { data } = await s.from('prices').select('id,treatment_code').range(from, from + 999);
    if (!data || data.length === 0) break;
    allSB = allSB.concat(data);
    from += 1000;
  }
  const sbMap = {};
  allSB.forEach(p => { sbMap[p.treatment_code] = p.id; });
  console.log(`\nFound ${allSB.length} existing prices in Supabase`);
  
  // Build updates: only update the price column for matching codes
  const updates = prices
    .filter(p => sbMap[p.treatment_code])
    .map(p => ({
      id: sbMap[p.treatment_code],
      price: p.price
    }));
  
  console.log(`Updating ${updates.length} prices that exist in Supabase`);
  
  // Update in batches
  let updated = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500);
    for (const item of batch) {
      const { error } = await s.from('prices').update({ price: item.price }).eq('id', item.id);
      if (error) {
        console.error('Error updating id', item.id, ':', error.message);
      } else {
        updated++;
      }
    }
    process.stderr.write(`${updated}/${updates.length}... `);
  }
  console.log(`\nDone! Updated ${updated} price values`);
  
  // Verify
  const { data: sample } = await s.from('prices').select('treatment_code,price').order('price', { ascending: false }).limit(10);
  console.log('\nTop prices after update:');
  sample.forEach(p => console.log(`  ${p.treatment_code.padEnd(10)} $${p.price.toFixed(2)}`));
}

main().catch(e => console.error(e));
