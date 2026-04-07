#!/usr/bin/env node
const dotenv = require('dotenv');
dotenv.config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const targetDate = process.argv[2]; // YYYY-MM-DD format
  
  if (targetDate) {
    // Get spending for specific date
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_date, cost, item_code, quantity')
      .eq('record_type', 'line_item')
      .gt('cost', 0)
      .gte('order_date', targetDate + 'T00:00:00')
      .lt('order_date', targetDate + 'T23:59:59')
      .order('order_date', { ascending: true });
    
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    
    const total = data.reduce((sum, r) => sum + (r.cost || 0), 0);
    console.log(`\nInventory spending for ${targetDate}:`);
    console.log('='.repeat(60));
    console.log(`Items purchased: ${data.length}`);
    console.log(`Total spent: $${total.toFixed(2)}`);
    console.log(`\nLine items:`);
    data.forEach(r => {
      console.log(`  ${r.item_code}: ${r.quantity} units @ $${(r.cost || 0).toFixed(2)}`);
    });
  } else {
    // Get daily totals for last 30 days
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_date, cost, item_code')
      .eq('record_type', 'line_item')
      .gt('cost', 0)
      .not('order_date', 'is', null)
      .order('order_date', { ascending: false })
      .limit(500);
    
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    
    // Group by date
    const byDate = {};
    data.forEach(r => {
      const date = r.order_date?.substring(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { count: 0, total: 0 };
      byDate[date].count++;
      byDate[date].total += r.cost || 0;
    });
    
    console.log('\nDaily Inventory Spending (last 30 days with data):');
    console.log('='.repeat(60));
    console.log(`${'Date'.padEnd(12)} | ${'Items'.padEnd(8)} | ${'Total Spent'.padEnd(12)}`);
    console.log('-'.repeat(60));
    
    Object.keys(byDate).sort().reverse().slice(0, 30).forEach(date => {
      const d = byDate[date];
      console.log(`${date.padEnd(12)} | ${String(d.count).padEnd(8)} | $${d.total.toFixed(2).padEnd(11)}`);
    });
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
