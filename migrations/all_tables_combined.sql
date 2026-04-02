-- ============================================================
-- Avimark V2$ â†’ Supabase Migration
-- Creates all tables for fixed-record V2$ files
-- Run in Supabase SQL Editor
-- ============================================================

-- Already exist: clients, animals, users, treatments, prices, audit_log, services, items

-- ============================================================
-- TIER 1: Core Clinical & Financial (high-value)
-- ============================================================

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
COMMENT ON TABLE visits IS 'VISIT.V2$ â€” 46K records, 256 bytes/rec. Visit records with dates and doctor initials.';

CREATE TABLE IF NOT EXISTS accounts (
  record_num INTEGER PRIMARY KEY,
  txn_date TIMESTAMP,
  type_flag INTEGER,
  description TEXT,
  amount_raw INTEGER,
  field_122 INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE accounts IS 'ACCOUNT.V2$ â€” 527K records, 256 bytes/rec. Financial account/transaction entries.';

CREATE TABLE IF NOT EXISTS procedures (
  record_num INTEGER PRIMARY KEY,
  procedure_date TIMESTAMP,
  code TEXT,
  description TEXT,
  amount NUMERIC,
  field_type INTEGER,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE procedures IS 'PROC.V2$ â€” 1.6M records, 64 bytes/rec. Procedure records.';

CREATE TABLE IF NOT EXISTS medical_records (
  record_num INTEGER PRIMARY KEY,
  record_date TIMESTAMP,
  code TEXT,
  description TEXT,
  field_type INTEGER,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE medical_records IS 'MEDICAL.V2$ â€” 211K records, 64 bytes/rec. Medical history entries.';

CREATE TABLE IF NOT EXISTS service_extended (
  record_num INTEGER PRIMARY KEY,
  code TEXT,
  description TEXT,
  amount NUMERIC,
  field_type INTEGER,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE service_extended IS 'SERVICEX.V2$ â€” 454K records, 80 bytes/rec. Extended service data.';

-- ============================================================
-- TIER 2: Supporting Clinical
-- ============================================================

CREATE TABLE IF NOT EXISTS variances (
  record_num INTEGER PRIMARY KEY,
  variance_date TIMESTAMP,
  code TEXT,
  description TEXT,
  amount NUMERIC,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE variances IS 'VARIANCE.V2$ â€” 269K records, 96 bytes/rec. Price variance records.';

CREATE TABLE IF NOT EXISTS tests (
  record_num INTEGER PRIMARY KEY,
  test_date TIMESTAMP,
  code TEXT,
  description TEXT,
  result TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE tests IS 'TEST.V2$ â€” 50K records, 80 bytes/rec. Lab test records.';

CREATE TABLE IF NOT EXISTS whiteboard (
  record_num INTEGER PRIMARY KEY,
  entry_date TIMESTAMP,
  code TEXT,
  description TEXT,
  status INTEGER,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE whiteboard IS 'WBOARD.V2$ â€” 642K records, 64 bytes/rec. Whiteboard/status board entries.';

CREATE TABLE IF NOT EXISTS problem_history (
  record_num INTEGER PRIMARY KEY,
  history_date TIMESTAMP,
  code TEXT,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE problem_history IS 'PROBHIST.V2$ â€” 14.6K records, 64 bytes/rec. Problem history log.';

CREATE TABLE IF NOT EXISTS block_off_extended (
  record_num INTEGER PRIMARY KEY,
  block_date TIMESTAMP,
  description TEXT,
  field_type INTEGER,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE block_off_extended IS 'BLKOFFEX.V2$ â€” 15.3K records, 108 bytes/rec. Extended block-off schedule entries.';

-- ============================================================
-- TIER 3: Purchase Orders, Estimates, Tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  record_num INTEGER PRIMARY KEY,
  po_date TIMESTAMP,
  vendor TEXT,
  description TEXT,
  amount NUMERIC,
  status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE purchase_orders IS 'PO.V2$ â€” 29K records, 64 bytes/rec. Purchase orders.';

CREATE TABLE IF NOT EXISTS estimates (
  record_num INTEGER PRIMARY KEY,
  estimate_date TIMESTAMP,
  description TEXT,
  amount NUMERIC,
  status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE estimates IS 'ESTIMATE.V2$ â€” 244 records, 64 bytes/rec. Estimate/quote headers.';

CREATE TABLE IF NOT EXISTS tasks (
  record_num INTEGER PRIMARY KEY,
  task_date TIMESTAMP,
  description TEXT,
  status INTEGER,
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE tasks IS 'TASK.V2$ â€” 4.8K records, 64 bytes/rec. Task/to-do entries.';

CREATE TABLE IF NOT EXISTS splits (
  record_num INTEGER PRIMARY KEY,
  split_date TIMESTAMP,
  description TEXT,
  amount NUMERIC,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE splits IS 'SPLIT.V2$ â€” 792 records, 64 bytes/rec. Payment split records.';

-- ============================================================
-- TIER 4: Reference/Lookup Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS resources (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE resources IS 'RESOURCE.V2$ â€” 262 records, 80 bytes/rec. Resource definitions (rooms, equipment).';

CREATE TABLE IF NOT EXISTS hospitals (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  field_type INTEGER,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE hospitals IS 'HOSPITAL.V2$ â€” 83 records, 112 bytes/rec. Hospital/ward definitions.';

CREATE TABLE IF NOT EXISTS reminder_assignments (
  record_num INTEGER PRIMARY KEY,
  reminder_date TIMESTAMP,
  code TEXT,
  description TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE reminder_assignments IS 'REMINDAS.V2$ â€” 632 records, 64 bytes/rec. Reminder assignment records.';

CREATE TABLE IF NOT EXISTS qa_records (
  record_num INTEGER PRIMARY KEY,
  qa_date TIMESTAMP,
  description TEXT,
  result TEXT,
  status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE qa_records IS 'QA.V2$ â€” 560 records, 64 bytes/rec. Quality assurance records.';

CREATE TABLE IF NOT EXISTS qa_headers (
  record_num INTEGER PRIMARY KEY,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE qa_headers IS 'QAHDR.V2$ â€” 44 records, 64 bytes/rec. QA header definitions.';

CREATE TABLE IF NOT EXISTS categories (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE categories IS 'CATEGORY.V2$ â€” 46 records, 108 bytes/rec. Category definitions.';

CREATE TABLE IF NOT EXISTS glossary_categories (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE glossary_categories IS 'GLOSSCAT.V2$ â€” 49 records, 80 bytes/rec. Glossary category definitions.';

CREATE TABLE IF NOT EXISTS groups (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE groups IS 'GROUP.V2$ â€” 18 records, 64 bytes/rec. Group definitions.';

CREATE TABLE IF NOT EXISTS headers (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE headers IS 'HEADER.V2$ â€” 144 records, 64 bytes/rec. Report/section header definitions.';

CREATE TABLE IF NOT EXISTS lookup_tables (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  field_type INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE lookup_tables IS 'TABLE.V2$ â€” 98 records, 64 bytes/rec. Lookup table definitions (species, breeds, etc).';

CREATE TABLE IF NOT EXISTS dicmm_headers (
  record_num INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE dicmm_headers IS 'DICMMHDR.V2$ â€” 21 records, 96 bytes/rec. DICOM modality headers.';

CREATE TABLE IF NOT EXISTS item_specs (
  record_num INTEGER PRIMARY KEY,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE item_specs IS 'ITMSPEC.V2$ â€” 13 records, 32 bytes/rec. Item specification definitions.';

-- ============================================================
-- MEMO TABLES (variable-length, 64-byte block based)
-- These store text blobs linked to other records
-- ============================================================

CREATE TABLE IF NOT EXISTS service_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE service_memos IS 'SERVMEMO.V2$ â€” 6M blocks Ã— 64 bytes. Service notes/memos (variable-length text).';

CREATE TABLE IF NOT EXISTS medical_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE medical_memos IS 'MDCLMEMO.V2$ â€” 1.6M blocks Ã— 64 bytes. Medical record memos.';

CREATE TABLE IF NOT EXISTS animal_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE animal_memos IS 'ANMLMEMO.V2$ â€” 609K blocks Ã— 64 bytes. Animal notes/memos.';

CREATE TABLE IF NOT EXISTS followup_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE followup_memos IS 'FLWUMEMO.V2$ â€” 129K blocks Ã— 64 bytes. Follow-up memos.';

CREATE TABLE IF NOT EXISTS glossary_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE glossary_memos IS 'GLOSMEMO.V2$ â€” 6K blocks Ã— 64 bytes. Glossary entry memos.';

CREATE TABLE IF NOT EXISTS lists_memos (
  record_num INTEGER PRIMARY KEY,
  content TEXT,
  ref_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE lists_memos IS 'LSTSMEMO.V2$ â€” 24K blocks Ã— 64 bytes. List memos.';

-- ============================================================
-- Indexes for common queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_visits_date ON visits (visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits (doctor);
CREATE INDEX IF NOT EXISTS idx_accounts_date ON accounts (txn_date);
CREATE INDEX IF NOT EXISTS idx_procedures_date ON procedures (procedure_date);
CREATE INDEX IF NOT EXISTS idx_medical_date ON medical_records (record_date);
CREATE INDEX IF NOT EXISTS idx_whiteboard_date ON whiteboard (entry_date);
-- Migration 002: Create missing tables for new V2$ parsers
-- Run this in Supabase SQL editor: 
-- https://supabase.com/dashboard/project/rnqhhzatlxmyvccdvqkr/sql/new

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
  "text" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
