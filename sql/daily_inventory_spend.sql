-- Daily Inventory Spending View
-- Run this in Supabase SQL Editor
-- This joins line items to their preceding header to get the date

CREATE OR REPLACE VIEW daily_inventory_spend AS
WITH ordered_pos AS (
  SELECT 
    record_num,
    record_type,
    order_date,
    item_code,
    quantity,
    cost
  FROM purchase_orders
  ORDER BY record_num ASC
),
header_dates AS (
  SELECT 
    record_num,
    order_date
  FROM ordered_pos
  WHERE record_type = 'header'
    AND order_date IS NOT NULL
)
SELECT 
  li.record_num,
  li.item_code,
  li.quantity,
  li.cost,
  hd.order_date,
  DATE(hd.order_date) as purchase_date
FROM ordered_pos li
CROSS JOIN LATERAL hd ON hd.record_num = (
  SELECT MAX(record_num)
  FROM header_dates
  WHERE record_num < li.record_num
)
WHERE li.record_type = 'line_item'
  AND li.cost > 0
  AND li.cost IS NOT NULL
ORDER BY hd.order_date DESC;

-- Usage: Get spending for a specific date
-- SELECT * FROM daily_inventory_spend WHERE purchase_date = '2024-03-15';

-- Daily totals:
-- SELECT 
--   purchase_date,
--   COUNT(*) as items,
--   SUM(cost) as total_spent
-- FROM daily_inventory_spend
-- GROUP BY purchase_date
-- ORDER BY purchase_date DESC;
