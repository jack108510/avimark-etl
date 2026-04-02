import 'dotenv/config';
import pg from 'pg';

// Supabase direct connection string from the URL
// Format: postgresql://postgres.[ref]:[password]@[host]:6543/postgres
const SUPABASE_URL = process.env.SUPABASE_URL;
const ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// For Supabase, the direct connection is via the pooler
// Connection string: postgres://postgres.ref:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres
// But we need the DB password, which is different from the service key

// Alternative: Use the Supabase JS client to create tables by inserting with UPSERT
// and letting Supabase auto-create... actually that doesn't work.

// Let's try connecting via the Supabase direct connection
// The password for the postgres user is in the Supabase dashboard

// For now, let's try a workaround: use the service key to connect via the connection pooler
const connString = `postgresql://postgres.${ref}:${process.env.SUPABASE_SERVICE_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

console.log('Connecting to Supabase PostgreSQL...');
console.log('Ref:', ref);

const client = new pg.Client({ connectionString: connString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Connected!');
  
  const statements = [
    `CREATE TABLE IF NOT EXISTS vendors (record_num INTEGER PRIMARY KEY, vendor_date TIMESTAMP, code TEXT, name TEXT, account_ref TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS problems (record_num INTEGER PRIMARY KEY, prob_date TIMESTAMP, code TEXT, name TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS appointments (record_num INTEGER PRIMARY KEY, appt_date TIMESTAMP, flags INTEGER, doctor TEXT, reason TEXT, field_40 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS medical (record_num INTEGER PRIMARY KEY, record_date TIMESTAMP, flags INTEGER, type_byte INTEGER, doctor TEXT, service_ref INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS prescriptions (record_num INTEGER PRIMARY KEY, rx_date TIMESTAMP, flags INTEGER, type_byte INTEGER, ref_id INTEGER, field_45 INTEGER, field_46 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS vaccines (record_num INTEGER PRIMARY KEY, vaccine_date TIMESTAMP, serial_number TEXT, doctor TEXT, manufacturer TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS followups (record_num INTEGER PRIMARY KEY, follow_date TIMESTAMP, code TEXT, description TEXT, doctor TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS diagnoses (record_num INTEGER PRIMARY KEY, diag_date TIMESTAMP, flags INTEGER, field_44 INTEGER, field_46 INTEGER, field_49 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS usage_records (record_num INTEGER PRIMARY KEY, usage_date TIMESTAMP, flags INTEGER, field_40 INTEGER, field_44 INTEGER, field_48 INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS quotes (record_num INTEGER PRIMARY KEY, quote_date TIMESTAMP, name TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS quote_details (record_num INTEGER PRIMARY KEY, line_date TIMESTAMP, code TEXT, description TEXT, quantity INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS prob_history (record_num INTEGER PRIMARY KEY, hist_date TIMESTAMP, code TEXT, "text" TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  ];

  for (const sql of statements) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    try {
      await client.query(sql);
      console.log(`✅ ${tableName}`);
    } catch (err) {
      console.log(`❌ ${tableName}: ${err.message}`);
    }
  }
  
  // Also need to alter existing tables to add missing columns
  const alterStatements = [
    // accounts: needs 'amount' column (currently has amount_raw)
    // Actually, we already adapted parsers to match existing schemas, so no alters needed
  ];
  
  console.log('\nDone!');
} catch (err) {
  console.log('Connection failed:', err.message);
  console.log('\nThe service key cannot be used as a DB password.');
  console.log('You need to run the SQL manually in the Supabase SQL editor.');
  console.log('URL: https://supabase.com/dashboard/project/' + ref + '/sql/new');
} finally {
  await client.end();
}
