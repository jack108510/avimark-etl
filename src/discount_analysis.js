import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DISCOUNT_CODES = new Set(['DISCOUNT', 'DISC', 'STAFF', 'PROF', 'REFER', 'REFCRED', 'PETDESK', 'HILLSFEL', 'HILLSK9', 'HILLSK9L', 'SIMPREVD']);

async function main() {
  // Get ANEX at $79 records
  const { data: anex79 } = await supabase.from('services')
    .select('record_num, code, amount')
    .eq('code', 'ANEX')
    .eq('amount', 79)
    .limit(20);

  const recNums = (anex79 || []).map(r => r.record_num).slice(0, 5);
  console.log('Checking invoice windows around ANEX@$79 records:', recNums);

  let discountNearby = 0;
  let noDiscountNearby = 0;

  for (const recNum of recNums) {
    const { data } = await supabase.from('services')
      .select('record_num, code, description, amount, service_type')
      .gte('record_num', recNum - 30)
      .lte('record_num', recNum + 30)
      .order('record_num');

    const hasDiscount = (data || []).some(r => DISCOUNT_CODES.has((r.code || '').trim().toUpperCase()));
    if (hasDiscount) discountNearby++;
    else noDiscountNearby++;

    console.log('\n--- Invoice window around ANEX@$79 rec#' + recNum + ' (discount nearby: ' + hasDiscount + ') ---');
    for (const r of data || []) {
      const marker = r.record_num === recNum ? ' <<< ANEX$79' : '';
      const isDisc = DISCOUNT_CODES.has((r.code || '').trim().toUpperCase()) ? ' [DISCOUNT]' : '';
      console.log('  rec#' + r.record_num + ' code=' + (r.code||'').padEnd(12) + ' amt=' + String(r.amount).padStart(10) + ' type=' + r.service_type + marker + isDisc);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('ANEX@$79 with discount code nearby:', discountNearby, '/', recNums.length);
  console.log('ANEX@$79 with NO discount nearby:', noDiscountNearby, '/', recNums.length);

  // Also check: are $79 ANEX charges on same service_type as $80?
  console.log('\n=== ANEX price distribution ===');
  const { data: allAnex } = await supabase.from('services')
    .select('amount, service_type')
    .eq('code', 'ANEX')
    .gt('amount', 0)
    .limit(5000);

  const dist = {};
  for (const r of allAnex || []) {
    const key = r.amount;
    dist[key] = (dist[key] || 0) + 1;
  }
  const sorted = Object.entries(dist).sort((a,b) => b[1]-a[1]).slice(0,10);
  for (const [amt, cnt] of sorted) {
    console.log('  $' + amt + ' x' + cnt);
  }
}

main().catch(console.error);
