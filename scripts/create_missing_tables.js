import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = [
  {
    name: 'vendors',
    sql: `CREATE TABLE IF NOT EXISTS vendors (
      record_num INTEGER PRIMARY KEY,
      vendor_date TIMESTAMP,
      code TEXT,
      name TEXT,
      account_ref TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'problems',
    sql: `CREATE TABLE IF NOT EXISTS problems (
      record_num INTEGER PRIMARY KEY,
      prob_date TIMESTAMP,
      code TEXT,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'appointments',
    sql: `CREATE TABLE IF NOT EXISTS appointments (
      record_num INTEGER PRIMARY KEY,
      appt_date TIMESTAMP,
      flags INTEGER,
      doctor TEXT,
      reason TEXT,
      field_40 INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'medical',
    sql: `CREATE TABLE IF NOT EXISTS medical (
      record_num INTEGER PRIMARY KEY,
      record_date TIMESTAMP,
      flags INTEGER,
      type_byte INTEGER,
      doctor TEXT,
      service_ref INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'prescriptions',
    sql: `CREATE TABLE IF NOT EXISTS prescriptions (
      record_num INTEGER PRIMARY KEY,
      rx_date TIMESTAMP,
      flags INTEGER,
      type_byte INTEGER,
      ref_id INTEGER,
      field_45 INTEGER,
      field_46 INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'vaccines',
    sql: `CREATE TABLE IF NOT EXISTS vaccines (
      record_num INTEGER PRIMARY KEY,
      vaccine_date TIMESTAMP,
      serial_number TEXT,
      doctor TEXT,
      manufacturer TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'followups',
    sql: `CREATE TABLE IF NOT EXISTS followups (
      record_num INTEGER PRIMARY KEY,
      follow_date TIMESTAMP,
      code TEXT,
      description TEXT,
      doctor TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'diagnoses',
    sql: `CREATE TABLE IF NOT EXISTS diagnoses (
      record_num INTEGER PRIMARY KEY,
      diag_date TIMESTAMP,
      flags INTEGER,
      field_44 INTEGER,
      field_46 INTEGER,
      field_49 INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'usage',
    sql: `CREATE TABLE IF NOT EXISTS "usage" (
      record_num INTEGER PRIMARY KEY,
      usage_date TIMESTAMP,
      flags INTEGER,
      field_40 INTEGER,
      field_44 INTEGER,
      field_48 INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'quotes',
    sql: `CREATE TABLE IF NOT EXISTS quotes (
      record_num INTEGER PRIMARY KEY,
      quote_date TIMESTAMP,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'quote_details',
    sql: `CREATE TABLE IF NOT EXISTS quote_details (
      record_num INTEGER PRIMARY KEY,
      line_date TIMESTAMP,
      code TEXT,
      description TEXT,
      quantity INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
  {
    name: 'prob_history',
    sql: `CREATE TABLE IF NOT EXISTS prob_history (
      record_num INTEGER PRIMARY KEY,
      hist_date TIMESTAMP,
      code TEXT,
      text TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  },
];

for (const t of tables) {
  console.log(`Creating ${t.name}...`);
  const { error } = await supabase.rpc('exec_sql', { sql: t.sql });
  if (error) {
    // rpc may not exist, try raw SQL via REST
    console.log(`  rpc failed: ${error.message}`);
    console.log(`  SQL: ${t.sql.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`);
  } else {
    console.log(`  ✅ Created`);
  }
}
