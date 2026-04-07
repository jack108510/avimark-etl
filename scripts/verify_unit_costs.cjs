const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // Get PO items with costs
  const { data: poItems } = await supabase
    .from('purchase_orders')
    .select('item_code, cost')
    .eq('record_type', 'line_item')
    .gt('cost', 0)
    .not('item_code', 'is', null)
    .order('record_num', { ascending: false })
    .limit(20);
  
  console.log('PO items with costs:');
  poItems.forEach(p => console.log(p.item_code, '|', p.cost));
  
  // Get items table for those codes
  const { data: items } = await supabase
    .from('items')
    .select('code, pack_size, unit_cost')
    .in('code', ...poItems.map(p => p.item_code));
  
  console.log('\nComparing unit_cost in items vs calculated from PO:');
  items.forEach(i => {
    const po = poItems.find(p => p.item_code === i.code);
    if (po) {
      const expectedUnitCost = po.cost / (i.pack_size || 1);
      if (i.unit_cost === expectedUnitCost) {
        console.log(i.code, '✓ MATCH');
      } else {
        console.log(i.code, '| pack_size=' + i.pack_size + '| po_cost=' + po.cost + '| expected=' + expectedUnitCost.toFixed(2) + '| actual=' + i.unit_cost);
      }
    }
  });
})();
