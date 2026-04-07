const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const targetDate = process.argv[2] || '2024-01-07';

  // Join services with items to get unit_cost
  const { data: services } = await supabase
    .from('services')
    .select(`
      s.code,
      s.description,
      s.quantity,
      s.amount,
      i.unit_cost
    `)
    .like('service_date', targetDate + '%')
    .order('service_date');

  console.log(`\nCOGS for ${targetDate}`);
  console.log('='.repeat(90));
  console.log('Code         Description                       Qty      Charged    Unit Cost   Total Cost     Profit');
  console.log('-'.repeat(90));

  let totalQty = 0, totalCharged = 0, totalCost = 0, missingCost = 0;

  services.forEach(s => {
    const unitCost = s.unit_cost || 0;
    const itemCost = s.quantity * unitCost;
    const profit = s.amount - itemCost;

    totalQty += s.quantity;
    totalCharged += s.amount || 0;
    totalCost += itemCost;

    if (!s.unit_cost) missingCost++;

    const desc = (s.description || '').substring(0, 28);
    console.log(`${s.code.padEnd(12)} ${desc.padEnd(30)} ${String(s.quantity).padStart(5)} ${('$' + s.amount.toFixed(2)).padStart(10)} ${unitCost ? ('$' + unitCost.toFixed(2)).padStart(10) : 'N/A'.padStart(10)} ${('$' + itemCost.toFixed(2)).padStart(10)} ${('$' + profit.toFixed(2)).padStart(10)}`);
  });

  console.log('-'.repeat(90));
  console.log(`\n  Summary:`);
  console.log(`  Items: ${services.length}`);
  console.log(`  Revenue: $${totalCharged.toFixed(2)}`);
  console.log(`  COGS: $${totalCost.toFixed(2)}`);
  console.log(`  Gross Profit: $${(totalCharged - totalCost).toFixed(2)}`);
  if (missingCost > 0) {
    console.log(`  ${missingCost} items missing cost data`);
  }
}

main();
