const fs = require('fs');
const billing = JSON.parse(fs.readFileSync('prices_from_billing.json', 'utf-8'));

// Deduplicate by code
const seen = {};
const unique = [];
for (const p of billing) {
  if (!seen[p.code]) {
    seen[p.code] = true;
    unique.push(p);
  }
}

console.log('Total unique codes:', unique.length);

// Sort by frequency
unique.sort((a, b) => b.frequency - a.frequency);

// Export as CSV
const csv = ['code,price,frequency,name'];
unique.forEach(p => {
  const name = p.name.replace(/,/g, ' ').replace(/"/g, '""');
  csv.push(`"${p.code}","${p.price}","${p.frequency}","${name}"`);
});
fs.writeFileSync('PRICE_LIST.csv', csv.join('\n'));

console.log('\nWrote PRICE_LIST.csv with', unique.length, 'items\n');
console.log('Top 30:');
unique.slice(0, 30).forEach((p, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${p.code.padEnd(10)} $${p.price.toFixed(2).padStart(7)} (${p.frequency} uses) ${p.name.slice(0, 30)}`);
});

// Check target codes
console.log('\nYour codes:');
['HC', 'BL', 'ANEX'].forEach(code => {
  const found = unique.find(p => p.code === code);
  if (found) {
    console.log(`${code.padEnd(10)} $${found.price.toFixed(2).padStart(7)} (${found.frequency} uses) ${found.name}`);
  } else {
    console.log(`${code.padEnd(10)} NOT FOUND`);
  }
});
