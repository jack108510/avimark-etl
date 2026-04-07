const fs=require('fs');
require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);

(async()=>{
  // 1. Read SERVICE.V2$ — get date for ALL records that have one (any offset)
  const buf=fs.readFileSync('C:/AVImark/SERVICE.V2$');
  const recSize=88;
  const totalRec=Math.floor(buf.length/recSize);
  
  // Build date map: record_num -> date (for header records with date @21)
  const svcDateMap={};
  for(let i=0;i<totalRec;i++){
    const off=i*recSize;
    const dt=buf.readDoubleLE(off+21);
    if(dt>38000 && dt<47000){
      const ms=Date.UTC(1899,11,30)+dt*86400000;
      const d=new Date(ms);
      if(!isNaN(d.getTime()) && d.getFullYear()>=2010 && d.getFullYear()<=2026){
        svcDateMap[i]=d.toISOString().slice(0,10);
      }
    }
  }
  console.log('Service header dates found:', Object.keys(svcDateMap).length);

  // 2. Get ALL services from Supabase with record_num
  let allSvc=[];
  let from=0;
  let emptyRetries=0;
  while(from<700000){
    const {data,error}=await s.from('services').select('record_num,code,amount').range(from,from+999);
    if(error){ console.warn('Retry at',from,error.message); await new Promise(r=>setTimeout(r,1000)); emptyRetries++; if(emptyRetries>5) break; continue; }
    if(!data||data.length===0){ emptyRetries++; if(emptyRetries>3){from+=1000; emptyRetries=0; continue;} break; }
    emptyRetries=0;
    allSvc=allSvc.concat(data);
    from+=1000;
    if(from%100000===0) process.stderr.write(from/1000+'k ');
  }
  console.log('\nServices loaded:', allSvc.length);

  // 3. For each code, find the MOST RECENT date it was billed
  // AND the LAST TIME the amount changed
  const codeInfo={};
  for(const svc of allSvc){
    if(!svc.code) continue;
    if(!codeInfo[svc.code]) codeInfo[svc.code]={
      dates:[], amounts:[], count:0, totalRev:0
    };
    codeInfo[svc.code].count++;
    codeInfo[svc.code].totalRev += parseFloat(svc.amount)||0;
    
    const date=svcDateMap[svc.record_num];
    if(date){
      codeInfo[svc.code].dates.push(date);
      codeInfo[svc.code].amounts.push({date, amount: parseFloat(svc.amount)||0});
    }
  }

  // 4. For each code: find last billed date + last price change date
  const codeResults={};
  for(const [code, info] of Object.entries(codeInfo)){
    info.dates.sort();
    info.amounts.sort((a,b)=>a.date.localeCompare(b.date));
    
    const lastBilled = info.dates.length ? info.dates[info.dates.length-1] : null;
    
    // Find last price change: walk backward through dated transactions
    let lastPriceChange = null;
    if(info.amounts.length >= 2){
      const latest = info.amounts[info.amounts.length-1];
      for(let i=info.amounts.length-2; i>=0; i--){
        if(Math.abs(info.amounts[i].amount - latest.amount) > 0.01){
          // Price changed between this record and the next one
          lastPriceChange = info.amounts[i+1].date;
          break;
        }
      }
      // If no change found, price has been the same throughout our data
      if(!lastPriceChange && info.amounts.length > 0){
        lastPriceChange = info.amounts[0].date; // at least this old
      }
    }
    
    codeResults[code] = {
      lastBilled,
      lastPriceChange,
      datedTxns: info.amounts.length,
      totalTxns: info.count,
      annualCount: Math.round(info.count / 5), // ~5 years of data
      annualRevenue: Math.round(info.totalRev / 5 * 100) / 100
    };
  }
  console.log('Codes analyzed:', Object.keys(codeResults).length);
  console.log('With lastBilled:', Object.values(codeResults).filter(x=>x.lastBilled).length);
  console.log('With lastPriceChange:', Object.values(codeResults).filter(x=>x.lastPriceChange).length);

  // 5. Read PRICE.V2$ dates
  const priceBuf=fs.readFileSync('C:/AVImark/PRICE.V2$');
  const priceRecSize=168;
  const priceDateMap={};
  const priceTotalRec=Math.floor(priceBuf.length/priceRecSize);
  for(let i=0;i<priceTotalRec;i++){
    const off=i*priceRecSize;
    const dt=priceBuf.readDoubleLE(off+21);
    if(dt>35000 && dt<50000){
      const ms=Date.UTC(1899,11,30)+dt*86400000;
      const d=new Date(ms);
      if(!isNaN(d.getTime()) && d.getFullYear()>=2005 && d.getFullYear()<=2026) priceDateMap[i]=d.toISOString().slice(0,10);
    }
  }

  // 6. Get prices + names
  let allPrices=[];
  let pfrom=0;
  while(true){
    const {data}=await s.from('prices').select('treatment_code,price,record_num').range(pfrom,pfrom+999);
    if(!data||data.length===0) break;
    allPrices=allPrices.concat(data);
    pfrom+=1000;
  }
  const {data:treats}=await s.from('treatments').select('code,name');
  const treatMap={};
  treats.forEach(t=>{treatMap[t.code]=t.name;});
  const {data:items}=await s.from('items').select('code,name');
  const itemMap={};
  items.forEach(t=>{itemMap[t.code]=t.name;});

  // 7. Build final dataset
  const result = allPrices.filter(p=>p.price>0).map(p=>{
    const code = p.treatment_code;
    const cr = codeResults[code] || {};
    const priceFileDate = priceDateMap[p.record_num] || null;
    
    // Best last_modified: PRICE.V2$ date > service price change > service last billed
    let lastMod = priceFileDate || cr.lastPriceChange || cr.lastBilled || null;
    let dateSource = priceFileDate ? 'price_file' : 
                     cr.lastPriceChange ? 'billing_change' :
                     cr.lastBilled ? 'last_billed' : null;
    
    return {
      code,
      name: treatMap[code] || itemMap[code] || code,
      price: p.price,
      last_modified: lastMod,
      date_source: dateSource,
      last_billed: cr.lastBilled || null,
      last_price_change: cr.lastPriceChange || null,
      price_file_date: priceFileDate,
      annual_count: cr.annualCount || 0,
      annual_revenue: cr.annualRevenue || 0,
      total_txns: cr.totalTxns || 0,
      dated_txns: cr.datedTxns || 0
    };
  });

  const withDate = result.filter(x=>x.last_modified);
  const fromPriceFile = result.filter(x=>x.date_source==='price_file');
  const fromBillingChange = result.filter(x=>x.date_source==='billing_change');
  const fromLastBilled = result.filter(x=>x.date_source==='last_billed');
  
  console.log('\n=== Final Results ===');
  console.log('Total items:', result.length);
  console.log('With any date:', withDate.length, '('+Math.round(withDate.length/result.length*100)+'%)');
  console.log('  From PRICE.V2$ file:', fromPriceFile.length);
  console.log('  From billing price change:', fromBillingChange.length);
  console.log('  From last billed date:', fromLastBilled.length);
  console.log('No date:', result.filter(x=>!x.last_modified).length);
  console.log('With usage:', result.filter(x=>x.annual_count>0).length);

  fs.writeFileSync('../cliniciq-dashboard/prices.json', JSON.stringify(result));
  console.log('\nWritten prices.json');
})();
