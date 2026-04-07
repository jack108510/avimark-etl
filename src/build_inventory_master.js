import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Building inventory master...\n');

  // Load all items
  const allItems = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('items').select('code, name, uom, pack_size, service_code').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allItems.push(...data);
    offset += 1000;
  }
  console.log('Items:', allItems.length);

  // Load inventory costs
  const { data: costs } = await supabase.from('inventory_costs').select('*');
  const costMap = new Map(costs.map(c => [c.item_code, c]));

  // Load recent billing data (past year) for average price
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  
  const services = [];
  let batchOffset = 0;
  while (true) {
    const { data } = await supabase
      .from('services')
      .select('code, amount, quantity')
      .gte('service_date', cutoffStr)
      .gt('amount', 0)
      .gt('quantity', 0)
      .range(batchOffset, batchOffset + 999);
    
    if (!data || data.length === 0) break;
    services.push(...data);
    batchOffset += 1000;
    if (services.length > 50000) {
      console.log('Breaking to avoid memory issues...');
      break;
    }
  }
  console.log('Service records (past year):', services.length);

  // Calculate average unit price per service code
  const priceByCode = new Map();
  services.forEach(s => {
    if (!priceByCode.has(s.code)) {
      priceByCode.set(s.code, { total: 0, units: 0 });
    }
    const entry = priceByCode.get(s.code);
    entry.total += s.amount;
    entry.units += s.quantity;
  });

  // Build master
  const master = allItems.map(item => {
    const poData = costMap.get(item.service_code) || costMap.get(item.code);
    let billingPrice = null;
    if (item.service_code && priceByCode.has(item.service_code)) {
      const p = priceByCode.get(item.service_code);
      billingPrice = p.total / p.units;
    }

    // Calculate margin
    let margin = null;
    if (poData && billingPrice && poData.unit_cost > 0) {
      margin = ((billingPrice - poData.unit_cost) / poData.unit_cost) * 100
    }

    return {
      item_code: item.code,
      item_name: item.name,
      uom: item.uom,
      pack_size: item.pack_size,
      service_code: item.service_code,
      unit_cost: poData?.unit_cost || null,
      billing_price: billingPrice ? Math.round(billingPrice * 100) / 100 : null,
      margin_pct: margin ? Math.round(margin * 10) / 10 : null,
    };
  });

  // Stats
  const withServiceCode = master.filter(i => i.service_code);
  const withCost = master.filter(i => i.unit_cost)
  const withBillingPrice = master.filter(i => i.billing_price)
  const withMargin = master.filter(i => i.margin_pct && i.margin_pct > 0)

  console.log('\n=== Final Stats ===');
  console.log('Total items:', master.length);
  console.log('With service_code:', withServiceCode.length, '(' + ((withServiceCode.length / master.length) * 100).toFixed(1) + '%)');
  console.log('With PO cost link:', withCost.length, '(' + ((withCost.length / master.length) * 100).toFixed(1) + '%)');
  console.log('With billing price:', withBillingPrice.length, '(' + ((withBillingPrice.length / master.length) * 100).toFixed(1) + '%)');
  console.log('With margin data:', withMargin.length, '(' + ((withMargin.length / master.length) * 100).toFixed(1) + '%)');

  // Save
  const outPath = 'C:/Users/Jackwilde/Projects/avimark-etl/inventory_master.json';
  fs.writeFileSync(outPath, JSON.stringify(master, null, 2));
  console.log('Saved to inventory_master.json');
}
main();
