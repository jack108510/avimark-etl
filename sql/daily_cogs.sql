-- Daily Cost of Goods Sold (COGS)
-- Run this in Supabase SQL Editor
-- Calculates inventory cost based on items dispensed per day

WITH item_costs AS (
  -- Get latest unit cost per item from purchase orders
  SELECT DISTINCT ON (i.code)
    i.code,
    i.pack_size,
    po.cost AS po_total,
    ROUND((po.cost::numeric / NULLIF(i.pack_size, 0)), 4) AS cost_per_unit
  FROM items i
  JOIN purchase_orders po ON po.item_code = i.code
  WHERE po.record_type = 'line_item' AND po.cost > 0
  ORDER BY i.code, po.record_num DESC
)
SELECT 
  DATE(s.service_date) as sale_date,
  COUNT(*) as items_sold,
  SUM(s.quantity) as total_units,
  SUM(s.amount) as revenue,
  SUM(s.quantity * ic.cost_per_unit) as inventory_cost,
  SUM(s.amount) - SUM(s.quantity * ic.cost_per_unit) as gross_profit
FROM services s
LEFT JOIN item_costs ic ON ic.code = s.code
WHERE s.service_date IS NOT NULL
  AND s.quantity > 0
GROUP BY DATE(s.service_date)
ORDER BY sale_date DESC
LIMIT 30;

-- For a SPECIFIC DATE:
-- Replace '2019-10-18' with your target date
WITH item_costs AS (
  SELECT DISTINCT ON (i.code)
    i.code,
    i.pack_size,
    po.cost AS po_total,
    ROUND((po.cost::numeric / NULLIF(i.pack_size, 0)), 4) AS cost_per_unit
  FROM items i
  JOIN purchase_orders po ON po.item_code = i.code
  WHERE po.record_type = 'line_item' AND po.cost > 0
  ORDER BY i.code, po.record_num DESC
)
SELECT 
  s.code,
  s.description,
  s.quantity,
  s.amount as charged,
  ic.cost_per_unit,
  ROUND(s.quantity * ic.cost_per_unit, 2) as inventory_cost,
  ROUND(s.amount - (s.quantity * ic.cost_per_unit), 2) as gross_profit
FROM services s
LEFT JOIN item_costs ic ON ic.code = s.code
WHERE DATE(s.service_date) = '2019-10-18'
  AND s.quantity > 0
ORDER BY s.service_date;
