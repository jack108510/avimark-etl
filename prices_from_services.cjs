require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Building current prices from actual service charges...\n');
  
  // Get all services
  let allServices = [];
  let from = 0;
  while (true) {
    const { data } = await s.from('services').select('code, amount').range(from, from + 999);
    if (!data || data.length === 0) break;
    allServices = allServices.concat(data);
    from += 1000;
    if (from % 100000 === 0) process.stderr.write(from / 1000 + 'k ');
  }
  console.log(`\nLoaded ${allServices.length} services`);

  // For each code, find the MOST COMMON charge amount (likely the current price)
  const codeStats = {};
  for (const svc of allServices) {
    if (!svc.code || svc.amount <= 0) continue;
    if (!codeStats[svc.code]) codeStats[svc.code] = { amounts: {} };
    const key = svc.amount.toFixed(2);
    codeStats[svc.code].amounts[key] = (codeStats[svc.code].amounts[key] || 0) + 1;
  }

  // Get treatment names
  const { data: treats } = await s.from('treatments').select('code, name');
  const treatMap = {};
  treats.forEach(t => { treatMap[t.code] = t.name; });

  // Build result
  const results = [];
  for (const [code, stats] of Object.entries(codeStats)) {
    // Find most common amount
    const amounts = Object.entries(stats.amounts).sort((a, b) => b[1] - a[1]);
    if (amounts.length === 0) continue;

    const mostCommonPrice = parseFloat(amounts[0][0]);
    const frequency = amounts[0][1];
    const name = treatMap[code] || code;

    // Skip if used less than 3 times (likely errors/adjustments)
    if (frequency < 3) continue;

    results.push({
      code,
      name,
      price: mostCommonPrice,
      frequency,
      variants: amounts.length
    });
  }

  console.log(`\nBuilt ${results.length} codes with current prices`);
  console.log('\nTop 30 by frequency:');
  results.sort((a, b) => b.frequency - a.frequency).slice(0, 30).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.code.padEnd(10)} ${r.name.slice(0, 35).padEnd(35)} $${r.price.toFixed(2)} (${r.frequency}x)`);
  });

  console.log('\nLooking for HC, BL, and your specific codes:');
  const target = results.filter(r => ['HC', 'BL', '0032', '408'].includes(r.code));
  target.forEach(r => console.log(`  ${r.code.padEnd(10)} ${r.name.padEnd(35)} $${r.price.toFixed(2)} (${r.frequency}x, ${r.variants} variants)`));

  // Write JSON
  const fs = require('fs');
  fs.writeFileSync('prices_from_billing.json', JSON.stringify(results.sort((a, b) => b.frequency - a.frequency), null, 2));
  console.log('\nWrote prices_from_billing.json');
}

main().catch(e => console.error(e));
