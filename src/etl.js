#!/usr/bin/env node
import 'dotenv/config';
import {
  ClientParser,
  AnimalParser,
  UserParser,
  TreatmentParser,
  PriceParser,
  AuditParser,
} from './parsers/index.js';
import { batchUpsert, batchUpsertAudit, updateSyncStatus } from './supabase.js';

// --- CLI Args ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const tableArg = args.find(a => a.startsWith('--table='))?.split('=')[1]
  || (args.includes('--table') ? args[args.indexOf('--table') + 1] : null);
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
  || (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : null);
const limit = limitArg ? parseInt(limitArg) : Infinity;

const DATA_DIR = process.env.AVIMARK_DATA_DIR || 'C:\\AVImark';

const TABLES = {
  clients: { parser: ClientParser, supaTable: 'clients' },
  animals: { parser: AnimalParser, supaTable: 'animals' },
  users: { parser: UserParser, supaTable: 'users' },
  treatments: { parser: TreatmentParser, supaTable: 'treatments' },
  prices: { parser: PriceParser, supaTable: 'prices' },
  audit: { parser: AuditParser, supaTable: 'audit_log', isAudit: true },
};

async function syncTable(name, config) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Syncing: ${name}`);
  console.log(`${'='.repeat(50)}`);

  const parser = new config.parser(DATA_DIR);
  const records = parser.parse(limit);

  if (records.length === 0) {
    console.log(`  No records found for ${name}`);
    return;
  }

  // Show sample in dry-run
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${records.length} records to "${config.supaTable}"`);
    console.log(`\n  Sample records (first 3):`);
    records.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}.`, JSON.stringify(r, null, 2).split('\n').map((l, j) => j ? '     ' + l : l).join('\n'));
    });
    if (records.length > 3) {
      console.log(`  ... and ${records.length - 3} more`);
    }
    return;
  }

  // Real upsert
  let result;
  if (config.isAudit) {
    result = await batchUpsertAudit(records);
  } else {
    result = await batchUpsert(config.supaTable, records);
  }

  console.log(`  ✅ Inserted: ${result.inserted}, Errors: ${result.errors}`);
  await updateSyncStatus(config.supaTable, result.inserted);
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     Avimark ETL — V2$ Parser         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (parse only)' : '🚀 LIVE (writing to Supabase)'}`);
  if (limit < Infinity) console.log(`Limit: ${limit} records per table`);

  if (!all && !tableArg) {
    console.log('\nUsage:');
    console.log('  node src/etl.js --dry-run --all              Parse all tables (no write)');
    console.log('  node src/etl.js --dry-run --table clients    Parse one table');
    console.log('  node src/etl.js --all                        Sync all to Supabase');
    console.log('  node src/etl.js --table prices --limit 100   Sync 100 prices');
    console.log('\nAvailable tables:', Object.keys(TABLES).join(', '));
    process.exit(0);
  }

  const tablesToSync = all
    ? Object.entries(TABLES)
    : [[tableArg, TABLES[tableArg]]];

  for (const [name, config] of tablesToSync) {
    if (!config) {
      console.error(`Unknown table: ${name}. Available: ${Object.keys(TABLES).join(', ')}`);
      continue;
    }
    await syncTable(name, config);
  }

  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
