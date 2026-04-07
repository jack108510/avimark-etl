#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ['services', 'prices', 'list_prices', 'pricing_dashboard', 'purchase_orders', 'items', 'clients', 'patients'];
for (const t of tables) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(`${t}: ${error ? 'MISSING (' + error.message + ')' : count + ' rows'}`);
}
