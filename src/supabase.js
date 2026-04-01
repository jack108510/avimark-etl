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
export async function batchUpsertAudit(records, batchSize = 500) {
  const supabase = getSupabase();
  let inserted = 0;
  let errors = 0;

  // Add a hash-based ID for dedup
  for (const rec of records) {
    rec.entry_hash = simpleHash(rec.audit_type + rec.date_text + rec.item_code + rec.description);
  }

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

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
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
