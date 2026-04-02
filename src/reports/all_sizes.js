import fs from 'fs';

const dataDir = 'C:\\AVImark';
const sizes = [32, 48, 64, 80, 96, 108, 112, 128, 160, 192, 224, 256, 320, 384, 392, 512, 549, 1024, 2048, 4096, 6110];

const existing = new Set(['CLIENT.V2$','ANIMAL.V2$','USER.V2$','TREAT.V2$','PRICE.V2$','AUDIT.V2$','SERVICE.V2$','ITEM.V2$','VISIT.V2$','ACCOUNT.V2$']);

const files = fs.readdirSync(dataDir)
  .filter(f => f.endsWith('.V2$') && !f.startsWith('LOG') && !f.startsWith('L0') && !f.startsWith('L1'))
  .filter(f => {
    const s = fs.statSync(dataDir + '\\' + f);
    return s.size > 0;
  })
  .filter(f => !existing.has(f));

const results = [];

for (const f of files) {
  const stat = fs.statSync(dataDir + '\\' + f);
  const matches = sizes.filter(s => stat.size % s === 0).map(s => ({ size: s, recs: stat.size / s }));
  
  // Also try to find the best match by reading some records
  const status = existing.has(f) ? 'DONE' : 'TODO';
  
  results.push({
    file: f,
    bytes: stat.size,
    mb: (stat.size / 1024 / 1024).toFixed(2),
    matches: matches.map(m => `${m.size}b→${m.recs}r`).join(', '),
    bestSize: matches.length > 0 ? matches.find(m => m.size >= 64 && m.size <= 1024)?.size || matches[0]?.size : 'VARIABLE',
    bestRecs: matches.length > 0 ? (matches.find(m => m.size >= 64 && m.size <= 1024)?.recs || matches[0]?.recs) : '?',
  });
}

results.sort((a, b) => b.bytes - a.bytes);

console.log('FILE'.padEnd(20) + 'SIZE_MB'.padStart(10) + '  RECORD_SIZE  RECORDS  CANDIDATES');
console.log('-'.repeat(90));
for (const r of results) {
  console.log(
    r.file.padEnd(20) +
    r.mb.padStart(10) +
    ('  ' + String(r.bestSize)).padEnd(14) +
    String(r.bestRecs).padStart(8) +
    '  ' + r.matches
  );
}

// Count
const fixed = results.filter(r => r.bestSize !== 'VARIABLE');
const variable = results.filter(r => r.bestSize === 'VARIABLE');
console.log(`\nFixed-record files: ${fixed.length}`);
console.log(`Variable-length files: ${variable.length}`);
console.log(`Total new tables needed: ${fixed.length}`);
