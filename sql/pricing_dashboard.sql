-- Pricing Dashboard View
-- Combines prices, service usage (365d), and purchase order costs
-- Run in Supabase SQL Editor

DROP VIEW IF EXISTS pricing_dashboard;

CREATE VIEW pricing_dashboard AS
WITH 
-- Current price per treatment code (deduplicated: pick most recent last_changed)
current_prices AS (
  SELECT DISTINCT ON (treatment_code)
    treatment_code,
    price AS current_price,
    last_changed
  FROM prices
  ORDER BY treatment_code, last_changed DESC NULLS LAST, price DESC
),

-- Most common description per code from services
descriptions AS (
  SELECT code, description, cnt
  FROM (
    SELECT 
      code,
      description,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY COUNT(*) DESC) AS rn
    FROM services
    WHERE description IS NOT NULL AND description != ''
    GROUP BY code, description
  ) sub
  WHERE rn = 1
),

-- Usage in last 365 days from services
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

-- Average cost from purchase orders (line items only)
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
