#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // Get items with pack_size
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('code, name, uom, pack_size')
    .not('pack_size', 0)
    .limit(100);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return;
  }

  console.log(`Found ${items.length} items with pack_size`);

  // Get PO line items with costs
  const { data: poItems, error: poError } = await supabase
    .from('purchase_orders')
    .select('item_code, cost, quantity')
    .eq('record_type', 'line_item')
    .not('cost', null)
    .gt('cost', 0)
    .order('record_num', 'desc')
    .limit(200);

  if (poError) {
    console.error('Error fetching PO items:', poError);
    return;
  }

  console.log(`Found ${poItems.length} PO line items with costs`);

  // Build lookup map: item_code -> latest cost
  const costMap = {};
  for (const po of poItems) {
    if (!costMap[po.item_code]) {
      costMap[po.item_code] = {
        cost: po.cost,
        quantity: po.quantity,
        unit_cost: po.cost / po.quantity
      };
    }
  }

  // Join and calculate
  const results = [];
  for (const item of items) {
    const po = costMap[item.code];
    if (po) {
      const unitCost = po.cost / item.pack_size;
      results.push({
        code: item.code,
        name: item.name,
        uom: item.uom,
        pack_size: item.pack_size,
        po_total: po.cost,
        po_quantity: po.quantity,
        cost_per_unit: Math.round(unitCost * 100) / 100
      });
    }
  }

  // Output results
  console.log('\nItem Unit Costs:');
  console.log('='.repeat(80));
  console.log(`${'Code'.padEnd(12)} | ${'Name'.padEnd(40)} | ${'UOM'.padEnd(8)} | ${'Pack'.padEnd(6)} | ${'PO Total'.padEnd(10)} | ${'Unit Cost'.padEnd(10)}`);
  console.log('-'.repeat(80));
  
  for (const r of results.slice(0, 20)) {
    console.log(
      `${r.code.padEnd(12)} | ${r.name.padEnd(40).substring(0, 40)} | ${r.uom.padEnd(8)} | ${String(r.pack_size).padEnd(6)} | $${r.po_total.toFixed(2).padEnd(10)} | $${r.cost_per_unit.toFixed(2).padEnd(10)}`
    );
  }

  console.log('\n'='.repeat(80));
  console.log(`Total: ${results.length} items with unit costs calculated`);
}

 
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
