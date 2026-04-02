import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const sql = `
CREATE TABLE IF NOT EXISTS vendors (
  record_num INTEGER PRIMARY KEY,
  vendor_date TIMESTAMP,
  code TEXT,
  name TEXT,
  account_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problems (
  record_num INTEGER PRIMARY KEY,
  prob_date TIMESTAMP,
  code TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  record_num INTEGER PRIMARY KEY,
  appt_date TIMESTAMP,
  flags INTEGER,
  doctor TEXT,
  reason TEXT,
  field_40 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medical (
  record_num INTEGER PRIMARY KEY,
  record_date TIMESTAMP,
  flags INTEGER,
  type_byte INTEGER,
  doctor TEXT,
  service_ref INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescriptions (
  record_num INTEGER PRIMARY KEY,
  rx_date TIMESTAMP,
  flags INTEGER,
  type_byte INTEGER,
  ref_id INTEGER,
  field_45 INTEGER,
  field_46 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vaccines (
  record_num INTEGER PRIMARY KEY,
  vaccine_date TIMESTAMP,
  serial_number TEXT,
  doctor TEXT,
  manufacturer TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followups (
  record_num INTEGER PRIMARY KEY,
  follow_date TIMESTAMP,
  code TEXT,
  description TEXT,
  doctor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnoses (
  record_num INTEGER PRIMARY KEY,
  diag_date TIMESTAMP,
  flags INTEGER,
  field_44 INTEGER,
  field_46 INTEGER,
  field_49 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_records (
  record_num INTEGER PRIMARY KEY,
  usage_date TIMESTAMP,
  flags INTEGER,
  field_40 INTEGER,
  field_44 INTEGER,
  field_48 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  record_num INTEGER PRIMARY KEY,
  quote_date TIMESTAMP,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_details (
  record_num INTEGER PRIMARY KEY,
  line_date TIMESTAMP,
  code TEXT,
  description TEXT,
  quantity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prob_history (
  record_num INTEGER PRIMARY KEY,
  hist_date TIMESTAMP,
  code TEXT,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

// Try using the Supabase REST SQL endpoint
const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
});

console.log('Status:', resp.status);
const text = await resp.text();
console.log('Response:', text.substring(0, 500));

// If that doesn't work, print the SQL for manual execution
console.log('\n\nIf auto-creation failed, run this SQL in the Supabase SQL editor:');
console.log('='.repeat(60));
console.log(sql);
