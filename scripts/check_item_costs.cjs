const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // Get services from 2024-01-07
  const { data: services } = await supabase
    .from('services')
    .select('code, description, quantity, amount')
    .like('service_date', '2024-01-07%')
    .order('service_date');

  console.log('Services from 2024-01-07:');
  services.forEach(r => {
    console.log(r.code, '|', (r.description || '').substring(0, 25), '|', r.quantity, '|', r.amount);
  });

  // Check if these codes exist in items table
  const { data: items } = await supabase
    .from('items')
    .select('code, name')
    .in('code', services.map(r => r.code))
    .limit(10);

  console.log('\nItems for these service codes:');
  items.forEach(i => console.log(i.code, '|', i.name));
})();
