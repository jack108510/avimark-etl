const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const targetDate = process.argv[2] || '2024-01-07';

// Get items with unit costs first
(async () => {
  try {
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('code, unit_cost');
    
    if (itemsError) throw itemsError;
    
    // Build cost lookup
    var costLookup = {};
    items.forEach(function(item) {
      if (item.unit_cost) {
        costLookup[item.code] = item.unit_cost;
      }
    });
    
    // Now get services
    var { data: services, error: svcError } = await supabase
      .from('services')
      .select('code, description, quantity, amount')
      .like('service_date', targetDate + '%')
      .order('service_date');
    
    if (svcError) throw svcError;
    if (!services || services.length === 0) {
      console.log('No services found for ' + targetDate);
      return;
    }
    
    console.log('\nCOGS for ' + targetDate);
    console.log('='.repeat(90));
    console.log('Code         Description                       Qty      Charged    Unit Cost    Total Cost      Profit');
    console.log('-'.repeat(90));
    
    var totalQty = 0, totalCharged = 0, totalCost = 0, missingCost = 0;
    
    services.forEach(function(s) {
      var unitCost = costLookup[s.code] || 0;
      var itemCost = s.quantity * unitCost;
      var profit = s.amount - itemCost;
      
      totalQty += s.quantity;
      totalCharged += s.amount || 0;
      totalCost += itemCost;
      
      if (!costLookup[s.code]) missingCost++;
      
      var desc = (s.description || '').substring(0, 28);
      var unitCostStr = unitCost ? '$' + unitCost.toFixed(2) : 'N/A';
      var costStr = '$' + itemCost.toFixed(2);
      var profitStr = '$' + profit.toFixed(2);
      
      console.log(s.code.padEnd(12) + ' ' + desc.padEnd(30) + ' ' +
        String(s.quantity).padStart(5) + ' ' +
        ('$' + s.amount.toFixed(2)).padStart(10) + ' ' +
        unitCostStr.padStart(10) + ' ' +
        costStr.padStart(10) + ' ' +
        profitStr.padStart(10));
    });
    
    console.log('-'.repeat(90));
    console.log('\n  Summary:');
    console.log('  Items: ' + services.length);
    console.log('  Revenue: $' + totalCharged.toFixed(2));
    console.log('  COGS: $' + totalCost.toFixed(2));
    console.log('  Gross Profit: $' + (totalCharged - totalCost).toFixed(2));
    console.log('  Margin: ' + (totalCharged > 0 ? ((totalCharged - totalCost) / totalCharged * 100).toFixed(1) : 0) + '%');
    if (missingCost > 0) {
      console.log('  ⚠️  ' + missingCost + ' items missing cost data (likely services codes, not inventory items)');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
