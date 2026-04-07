import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/**
 * Build inventory cost master from latest PO data
 * 
 * PO codes match services.code (billing codes), not items.code (inventory codes)
 * So we build from PO data directly, using quantity as units ordered
 * 
 * Logic:
 * 1. Get all PO line items with costs (most recent first)
 * 2. Keep only the latest PO per item_code
 * 3. Calculate unit_cost = po_cost / quantity
 */

async function main() {
  console.log('Building inventory cost master from PO data...\n');

  // Get all PO line items with costs
  const { data: poLines, error: poError } = await supabase
    .from('purchase_orders')
    .select('record_num, item_code, quantity, cost')
    .eq('record_type', 'line_item')
    .not('cost', 'is', null)
    .not('item_code', 'is', null)
    .gt('cost', 0)
    .gt('quantity', 0)
    .order('record_num', { ascending: false });

  if (poError) {
    console.error('Error fetching PO lines:', poError);
    return;
  }

  console.log(`Loaded ${poLines.length} PO line items with costs`);

  // Keep most recent PO per item
  const latestPO = new Map();
  poLines.forEach(row => {
    if (!latestPO.has(row.item_code)) {
      latestPO.set(row.item_code, row);
    }
  });

  console.log(`Found ${latestPO.size} unique items in PO history\n`);

  // Build inventory cost master
  const inventoryCosts = [];

  for (const [code, po] of latestPO) {
    const unitCost = po.quantity > 0 ? po.cost / po.quantity : 0;

    inventoryCosts.push({
      item_code: code,
      last_po_qty: po.quantity,
      last_po_cost: Math.round(po.cost * 100) / 100,
      last_po_record: po.record_num,
      unit_cost: Math.round(unitCost * 10000) / 10000
    });
  }

  console.log(`Built ${inventoryCosts.length} inventory cost records\n`);

  // Step 5: Create table via direct insert (table should exist)
  console.log('Syncing to inventory_costs table...');

  // Try upsert in batches of 100
  let inserted = 0;
  for (let i = 0; i < inventoryCosts.length; i += 100) {
    const batch = inventoryCosts.slice(i, i + 100);
    const { error } = await supabase.from('inventory_costs').upsert(batch, { onConflict: 'item_code' });
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  // Verify
  const { count } = await supabase.from('inventory_costs').select('*', { count: 'exact', head: true });
  console.log(`\ninventory_costs table: ${count} rows`);

  // Sample output
  console.log('\nSample (top 10 by unit_cost):');
  const { data: sample } = await supabase
    .from('inventory_costs')
    .select('*')
    .order('unit_cost', { ascending: false })
    .limit(10);

  sample.forEach(row => {
    console.log(`${row.item_code.padEnd(12)} | qty=${String(row.last_po_qty).padStart(6)} | total=$${String(row.last_po_cost.toFixed(2)).padStart(9)} | unit=$${row.unit_cost.toFixed(4)}`);
  });

  console.log('\nDone!');
}

main().catch(console.error);
