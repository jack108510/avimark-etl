#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';

// Try to connect to Supabase Postgres directly via the pooler
// Connection string format: postgresql://postgres.[ref]:[password]@[region].pooler.supabase.com:6543/postgres
const ref = process.env.SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// The DB password is typically set by the user during project creation
// We'll try common approaches and the service key
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;

if (!dbPassword) {
  console.log('No SUPABASE_DB_PASSWORD in .env');
  console.log('');
  console.log('To find your DB password:');
  console.log('1. Go to https://supabase.com/dashboard/project/' + ref + '/settings/database');
  console.log('2. Copy the connection string or password');
  console.log('3. Add to .env: SUPABASE_DB_PASSWORD=your_password');
  console.log('');
  console.log('Or just paste this SQL in the SQL Editor:');
  console.log('---');
  
  // Output the view SQL
  const sql = `
CREATE OR REPLACE VIEW pricing_dashboard AS
WITH 
desc_counts AS (
  SELECT code, description, COUNT(*) AS cnt
  FROM services
  WHERE description IS NOT NULL AND description != ''
  GROUP BY code, description
),
descriptions AS (
  SELECT code, description
  FROM (
    SELECT code, description, cnt, ROW_NUMBER() OVER (PARTITION BY code ORDER BY cnt DESC) AS rn
    FROM desc_counts
  ) sub
  WHERE rn = 1
),
current_prices AS (
  SELECT DISTINCT ON (treatment_code)
    treatment_code,
    price AS current_price,
    last_changed
  FROM prices
  ORDER BY treatment_code, last_changed DESC NULLS LAST, price DESC
),
usage_365 AS (
  SELECT 
    code,
    COUNT(*) AS usage_365d,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS annual_revenue
  FROM services
  WHERE service_date IS NOT NULL 
    AND service_date::timestamp > (NOW() - INTERVAL '365 days')
  GROUP BY code
),
po_costs AS (
  SELECT 
    item_code,
    AVG(cost) AS avg_cost
  FROM purchase_orders
  WHERE record_type = 'line_item'
    AND cost IS NOT NULL
    AND cost > 0
    AND item_code IS NOT NULL
    AND item_code != ''
  GROUP BY item_code
)
SELECT
  cp.treatment_code,
  d.description,
  cp.current_price,
  cp.last_changed,
  pc.avg_cost,
  CASE 
    WHEN pc.avg_cost IS NOT NULL AND pc.avg_cost > 0 
    THEN ROUND(((cp.current_price - pc.avg_cost) / pc.avg_cost * 100)::numeric, 1)
    ELSE NULL
  END AS markup_pct,
  ROUND((cp.current_price * 1.05)::numeric, 2) AS price_with_5pct_increase,
  COALESCE(u.usage_365d, 0) AS usage_365d,
  COALESCE(u.annual_revenue, 0) AS annual_revenue
FROM current_prices cp
LEFT JOIN descriptions d ON d.code = cp.treatment_code
LEFT JOIN usage_365 u ON u.code = cp.treatment_code
LEFT JOIN po_costs pc ON pc.item_code = cp.treatment_code
ORDER BY COALESCE(u.annual_revenue, 0) DESC;
`;
  console.log(sql);
  process.exit(1);
}

// Connect and create the view
const connectionString = `postgresql://postgres.${ref}:${dbPassword}@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  console.log('Connected to Supabase Postgres!');
  
  const sql = `...`; // same as above
  await client.query(sql);
  console.log('✅ View created successfully!');
  
  const result = await client.query('SELECT * FROM pricing_dashboard LIMIT 5');
  console.log('Sample data:', JSON.stringify(result.rows, null, 2));
} catch(err) {
  console.error('Error:', err.message);
} finally {
  await client.end();
}
