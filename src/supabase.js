import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file.\n' +
      'Copy .env.example to .env and fill in your Supabase credentials.'
    );
  }

  client = createClient(url, key);
  return client;
}

/**
 * Upsert records in batches to avoid hitting Supabase limits.
 */
export async function batchUpsert(tableName, records, batchSize = 500) {
  const supabase = getSupabase();
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'record_num' });

    if (error) {
      console.error(`  Error upserting batch ${i}-${i + batch.length} to ${tableName}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

/**
 * Upsert audit records (different conflict key).
 */
export async function batchUpsertAudit(inputRecords, batchSize = 500) {
  let records = [...inputRecords];
  const supabase = getSupabase();
  let inserted = 0;
  let errors = 0;

  // Add a hash-based ID for dedup
  for (let i = 0; i < records.length; i++) {
    records[i].entry_hash = simpleHash(
      records[i].audit_type + records[i].date_text + records[i].item_code + records[i].description, i
    );
  }

  // Deduplicate by entry_hash within the batch
  const seen = new Set();
  const deduped = [];
  for (const rec of records) {
    if (!seen.has(rec.entry_hash)) {
      seen.add(rec.entry_hash);
      deduped.push(rec);
    }
  }
  records = deduped;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('audit_log')
      .upsert(batch, { onConflict: 'entry_hash' });

    if (error) {
      console.error(`  Error upserting audit batch ${i}-${i + batch.length}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

function simpleHash(str, index) {
  // Include index to guarantee uniqueness even for similar entries
  const input = str + '::' + index;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36);
}

/**
 * Update sync status table.
 */
export async function updateSyncStatus(tableName, recordCount) {
  const supabase = getSupabase();
  await supabase
    .from('sync_status')
    .upsert({
      table_name: tableName,
      last_sync: new Date().toISOString(),
      record_count: recordCount,
      status: 'ok',
    }, { onConflict: 'table_name' });
}
