-- Item Unit Costs View
-- Run this in Supabase SQL Editor
-- Joins items (with pack_size) to purchase_orders (with cost)
-- to calculate cost per unit

-- Also tracks latest purchase date per item

CREATE OR REPLACE VIEW item_unit_costs AS
SELECT DISTINCT ON (i.code)
  i.code,
  i.name,
  i.uom,
  i.pack_size,
  po.cost AS latest_po_total,
  po.quantity AS units_ordered,
  ROUND((po.cost::numeric / NULLIF(i.pack_size, 0)), 2) AS cost_per_unit,
FROM items i
JOIN purchase_orders po ON po.item_code = i.code
WHERE po.record_type = 'line_item'
 
 AND po.cost > 0
ORDER BY i.code, po.record_num DESC;

-- Usage example:
-- SELECT * FROM item_unit_costs WHERE code = 'HEARTGARD';
-- This gives you:
--   code: HEARTGARD
--   name: Heartgard Plus Chew 11-22 kg (Green)
--   uom: ChewZZ
--   pack_size: 12
--   latest_po_total: 155.65
--   units_ordered: 832
--   cost_per_unit: 12.97 (155.65 / 12)
