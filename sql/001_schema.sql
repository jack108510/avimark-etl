-- Avimark ETL Schema for Supabase
-- Run this in Supabase SQL Editor to create the tables

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  record_num INTEGER UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_name ON clients (last_name, first_name);
CREATE INDEX idx_clients_city ON clients (city);
CREATE INDEX idx_clients_phone ON clients (phone);

-- Animals / Patients
CREATE TABLE IF NOT EXISTS animals (
  id BIGSERIAL PRIMARY KEY,
  record_num INTEGER UNIQUE NOT NULL,
  name TEXT,
  species TEXT,
  breed TEXT,
  color TEXT,
  weight NUMERIC(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_animals_name ON animals (name);
CREATE INDEX idx_animals_species ON animals (species);

-- Staff / Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  record_num INTEGER UNIQUE NOT NULL,
  code TEXT,
  first_name TEXT,
  last_name TEXT,
  type TEXT,
  is_dvm BOOLEAN DEFAULT FALSE,
  dvm_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_code ON users (code);

-- Treatments / Services Catalog
CREATE TABLE IF NOT EXISTS treatments (
  id BIGSERIAL PRIMARY KEY,
  record_num INTEGER UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  type_flag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_treatments_code ON treatments (code);

-- Current Prices
CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  record_num INTEGER UNIQUE NOT NULL,
  treatment_code TEXT,
  price NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prices_code ON prices (treatment_code);

-- Audit Log (price changes, service entries)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  entry_hash TEXT UNIQUE,
  audit_type TEXT,
  category TEXT,
  item_code TEXT,
  date_text TEXT,
  old_value NUMERIC(12,2),
  new_value NUMERIC(12,2),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_type ON audit_log (audit_type);
CREATE INDEX idx_audit_code ON audit_log (item_code);
CREATE INDEX idx_audit_date ON audit_log (date_text);
CREATE INDEX idx_audit_category ON audit_log (category);

-- Sync Status
CREATE TABLE IF NOT EXISTS sync_status (
  table_name TEXT PRIMARY KEY,
  last_sync TIMESTAMPTZ,
  record_count INTEGER,
  status TEXT
);

-- Row Level Security (optional - enable if sharing access)
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
-- etc.

-- Useful views

-- Price history for a treatment (join prices + audit)
CREATE OR REPLACE VIEW price_history AS
SELECT
  item_code AS treatment_code,
  date_text AS change_date,
  old_value AS old_price,
  new_value AS new_price,
  new_value - old_value AS price_change,
  description
FROM audit_log
WHERE category = 'price_change'
  AND old_value IS NOT NULL
ORDER BY date_text DESC;

-- Current price list with treatment names
CREATE OR REPLACE VIEW price_list AS
SELECT
  p.treatment_code,
  t.name AS treatment_name,
  p.price
FROM prices p
LEFT JOIN treatments t ON p.treatment_code = t.code
WHERE p.price > 0
ORDER BY t.name;

-- Species summary
CREATE OR REPLACE VIEW species_summary AS
SELECT
  species,
  COUNT(*) AS patient_count,
  ROUND(AVG(weight), 1) AS avg_weight
FROM animals
WHERE species IS NOT NULL AND species != ''
GROUP BY species
ORDER BY patient_count DESC;

-- Client location summary
CREATE OR REPLACE VIEW client_locations AS
SELECT
  city,
  province,
  COUNT(*) AS client_count
FROM clients
WHERE city IS NOT NULL AND city != ''
GROUP BY city, province
ORDER BY client_count DESC;
