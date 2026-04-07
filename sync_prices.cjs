const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const buf = fs.readFileSync('C:/AVImark/PRICE.V2$');
  
  // PRICE.V2$ structure: record_num points to the file
  // Find correct record size by checking against known record_num values
  const recSizes = [168, 176, 184, 192, 200, 208];
  let correctSize = null;
  let codeOffset = null;
  let priceOffset = null;
  
  // Get a sample of known record_nums from Supabase
  const { data: sample } = await s.from('prices').select('record_num, treatment_code, price').limit(20);
  
  console.log('Finding correct record structure...');
  for (const recSize of recSizes) {
    let matches = 0;
    for (const { record_num, treatment_code } of sample) {
      const off = record_num * recSize;
      if (off + 20 > buf.length) continue;
      const code = buf.toString('latin1', off, off + 20).split('\x00')[0].trim();
      if (code === treatment_code) matches++;
    }
    if (matches >= sample.length * 0.5) {
      correctSize = recSize;
      codeOffset = 0;
      console.log(`Found: recSize=${recSize}, codeOffset=${codeOffset}`);
      break;
    }
  }
  
  if (!correctSize) {
    console.log('Could not determine record size. Trying recSize=184, codeOffset=0');
    correctSize = 184;
    codeOffset = 0;
  }
  
  // Now find price offset by testing known prices
  console.log('\nFinding price offset...');
  const { record_num: testRec, treatment_code: testCode, price: testPrice } = sample[0];
  const off = testRec * correctSize;
  
  for (let offset = 0; offset < correctSize; offset += 8) {
    const d = buf.readDoubleLE(off + offset);
    if (Math.abs(d - testPrice) < 0.01) {
      priceOffset = offset;
      console.log(`Price offset: @${offset} = ${d.toFixed(2)} (expected ${testPrice.toFixed(2)})`);
      break;
    }
  }
  
  if (!priceOffset) {
    // Try other interpretations
    console.log('Trying integer price (divided by 100)...');
    for (let offset = 0; offset < correctSize - 4; offset += 4) {
      const i = buf.readUInt32LE(off + offset);
      if (Math.abs(i / 100 - testPrice) < 0.01) {
        priceOffset = offset;
        console.log(`Price offset (UInt32/100): @${offset} = ${(i/100).toFixed(2)}`);
        break;
      }
    }
  }
  
  if (!priceOffset) {
    console.error('Could not find price offset. Using @16 as fallback');
    priceOffset = 16;
  }
  
  // Extract all prices from file
  const totalRec = Math.floor(buf.length / correctSize);
  const prices = [];
  
  for (let i = 0; i < totalRec; i++) {
    const off = i * correctSize;
    if (off + Math.max(codeOffset + 20, priceOffset + 8) > buf.length) break;
    
    const code = buf.toString('latin1', off + codeOffset, off + codeOffset + 20).split('\x00')[0].trim();
    if (!code || code.length === 0) continue;
    
    let price = null;
    if (priceOffset !== null) {
      const d = buf.readDoubleLE(off + priceOffset);
      if (d > 0 && d < 1000000) {
        price = d;
      } else {
        // Try as integer/100
        const i = buf.readUInt32LE(off + priceOffset);
        if (i > 0 && i < 100000000) price = i / 100;
      }
    }
    
    if (price === null || price <= 0) continue;
    
    prices.push({
      treatment_code: code,
      price: parseFloat(price.toFixed(2)),
      record_num: i,
      updated_at: new Date().toISOString()
    });
  }
  
  console.log(`\nExtracted ${prices.length} prices from PRICE.V2$`);
  
  // Sample
  console.log('Sample:');
  prices.slice(0, 10).forEach(p => console.log(`  ${p.treatment_code.padEnd(10)} $${p.price.toFixed(2)}`));
  
  // Update Supabase - upsert by treatment_code
  console.log('\nUpserting to Supabase...');
  let updated = 0;
  for (let i = 0; i < prices.length; i += 500) {
    const batch = prices.slice(i, i + 500);
    const { error } = await s.from('prices').upsert(batch, { onConflict: 'treatment_code' });
    if (error) {
      console.error('Upsert error at batch', i, ':', error.message);
      return;
    }
    updated += batch.length;
    process.stderr.write(`${updated}/${prices.length}... `);
  }
  console.log(`\nDone! Updated ${updated} prices`);
  
  // Verify
  const { count } = await s.from('prices').select('*', { count: 'exact', head: true });
  console.log('Total prices in Supabase:', count);
}

main().catch(e => console.error(e));
