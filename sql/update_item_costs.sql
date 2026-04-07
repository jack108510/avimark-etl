-- Update ALL items with unit_cost from purchase_orders
-- Run this in Supabase SQL Editor

UPDATE items i
SET unit_cost = sub.cost / NULLIF(i.pack_size, 0)
FROM items i
JOIN purchase_orders po ON po.item_code = i.code
WHERE po.record_type = 'line_item'
  AND po.cost > 0
ORDER BY i.code, po.record_num DESC;

 -- After running, COGS will work correctly
-- because items.code now matches services.code
SELECT 
  s.code,
  s.description,
  s.quantity,
  s.amount as charged,
  i.unit_cost,
  s.quantity * i.unit_cost as total_cost,
  s.amount - (s.quantity * i.unit_cost) as profit
FROM services s
LEFT JOIN items i ON i.code = s.code
WHERE s.service_date LIKE '2024-01-07%'
ORDER BY s.code;
