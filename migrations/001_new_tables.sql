-- Migration: Create new Avimark V2$ tables
-- Run via Supabase SQL editor or migrate.js

-- Visits (VISIT.V2$ — 256 bytes/rec, ~46K records)
CREATE TABLE IF NOT EXISTS visits (
  record_num INTEGER PRIMARY KEY,
  visit_date TIMESTAMP,
  type_code INTEGER,
  ref_id INTEGER,
  doctor TEXT,
  field_48 INTEGER,
  field_53 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Accounts (ACCOUNT.V2$ — 256 bytes/rec, ~527K records)
CREATE TABLE IF NOT EXISTS accounts (
  record_num INTEGER PRIMARY KEY,
  txn_date TIMESTAMP,
  description TEXT,
  entry_type TEXT,
  cost NUMERIC(12,2),
  quantity NUMERIC(10,2),
  amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Appointments (APPOINT.V2$ — 449 bytes/rec, ~106K records)
CREATE TABLE IF NOT EXISTS appointments (
  record_num INTEGER PRIMARY KEY,
  appt_date TIMESTAMP,
  flags INTEGER,
  doctor TEXT,
  reason TEXT,
  field_40 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Medical Records (MEDICAL.V2$ — 256 bytes/rec, ~53K records)
CREATE TABLE IF NOT EXISTS medical (
  record_num INTEGER PRIMARY KEY,
  record_date TIMESTAMP,
  flags INTEGER,
  type_byte INTEGER,
  doctor TEXT,
  service_ref INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prescriptions (PRESCRIP.V2$ — 310 bytes/rec, ~75K records)
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

-- Vaccines (VACCINE.V2$ — 152 bytes/rec, ~32K records)
CREATE TABLE IF NOT EXISTS vaccines (
  record_num INTEGER PRIMARY KEY,
  vaccine_date TIMESTAMP,
  serial_number TEXT,
  doctor TEXT,
  manufacturer TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-ups (FOLLOW.V2$ — 142 bytes/rec, ~26K records)
CREATE TABLE IF NOT EXISTS followups (
  record_num INTEGER PRIMARY KEY,
  follow_date TIMESTAMP,
  code TEXT,
  description TEXT,
  doctor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Diagnoses (DIAGNOSE.V2$ — 85 bytes/rec, ~6K records)
CREATE TABLE IF NOT EXISTS diagnoses (
  record_num INTEGER PRIMARY KEY,
  diag_date TIMESTAMP,
  flags INTEGER,
  field_44 INTEGER,
  field_46 INTEGER,
  field_49 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Problems (PROBLEM.V2$ — 167 bytes/rec, ~800 records)
CREATE TABLE IF NOT EXISTS problems (
  record_num INTEGER PRIMARY KEY,
  prob_date TIMESTAMP,
  code TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vendors (VENDOR.V2$ — 377 bytes/rec, ~391 records)
CREATE TABLE IF NOT EXISTS vendors (
  record_num INTEGER PRIMARY KEY,
  vendor_date TIMESTAMP,
  code TEXT,
  name TEXT,
  account_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Procedures (PROC.V2$ — 256 bytes/rec, ~408K records)
CREATE TABLE IF NOT EXISTS procedures (
  record_num INTEGER PRIMARY KEY,
  proc_date TIMESTAMP,
  code TEXT,
  description TEXT,
  category TEXT,
  species TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usage (USAGE.V2$ — 63 bytes/rec, ~177K records)
CREATE TABLE IF NOT EXISTS usage (
  record_num INTEGER PRIMARY KEY,
  usage_date TIMESTAMP,
  flags INTEGER,
  field_40 INTEGER,
  field_44 INTEGER,
  field_48 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quotes (QUOTE.V2$ — 140 bytes/rec, ~17K records)
CREATE TABLE IF NOT EXISTS quotes (
  record_num INTEGER PRIMARY KEY,
  quote_date TIMESTAMP,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quote Details (QUOTAIL.V2$ — 255 bytes/rec, ~124K records)
CREATE TABLE IF NOT EXISTS quote_details (
  record_num INTEGER PRIMARY KEY,
  line_date TIMESTAMP,
  code TEXT,
  description TEXT,
  quantity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Variances (VARIANCE.V2$ — 108 bytes/rec, ~239K records)
CREATE TABLE IF NOT EXISTS variances (
  record_num INTEGER PRIMARY KEY,
  var_date TIMESTAMP,
  code TEXT,
  doctor TEXT,
  quantity INTEGER,
  amount NUMERIC(12,2),
  secondary_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Whiteboard (WBOARD.V2$ — 256 bytes/rec, ~160K records)
CREATE TABLE IF NOT EXISTS whiteboard (
  record_num INTEGER PRIMARY KEY,
  wb_date TIMESTAMP,
  description TEXT,
  doctor TEXT,
  code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Problem History (PROBHIST.V2$ — 48 bytes/rec, ~19K records)
CREATE TABLE IF NOT EXISTS prob_history (
  record_num INTEGER PRIMARY KEY,
  hist_date TIMESTAMP,
  code TEXT,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Resources (RESOURCE.V2$ — 160 bytes/rec, 131 records)
CREATE TABLE IF NOT EXISTS resources (
  record_num INTEGER PRIMARY KEY,
  res_date TIMESTAMP,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Estimates (ESTIMATE.V2$ — 128 bytes/rec, 122 records)
CREATE TABLE IF NOT EXISTS estimates (
  record_num INTEGER PRIMARY KEY,
  est_date TIMESTAMP,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (CATEGORY.V2$ — 184 bytes/rec, 27 records)
CREATE TABLE IF NOT EXISTS categories (
  record_num INTEGER PRIMARY KEY,
  cat_date TIMESTAMP,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lookup Tables (TABLE.V2$ — 128 bytes/rec, 49 records)
CREATE TABLE IF NOT EXISTS lookup_tables (
  record_num INTEGER PRIMARY KEY,
  tbl_date TIMESTAMP,
  code TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
