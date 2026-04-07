const fs=require('fs');
require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);

(async()=>{
  // Read SERVICE.V2$ dates
  const buf=fs.readFileSync('C:/AVImark/SERVICE.V2$');
  const recSize=88;
  const totalRec=Math.floor(buf.length/recSize);
  const dateMap={};
  let validDates=0;
  for(let i=0;i<totalRec;i++){
    const off=i*recSize;
    const dt=buf.readDoubleLE(off+21);
    if(dt>35000 && dt<50000){
      const ms=Date.UTC(1899,11,30)+dt*86400000;
      const d=new Date(ms);
      if(!isNaN(d.getTime()) && d.getFullYear()>=2005 && d.getFullYear()<=2026){
        dateMap[i]=d.toISOString().slice(0,10);
        validDates++;
      }
    }
  }
  console.log('Service records with valid dates:', validDates, 'of', totalRec);

  // Get all services from Supabase
  let allSvc=[];
  let from=0;
  while(true){
    const {data}=await s.from('services').select('record_num,code,amount').range(from,from+999);
    if(!data||data.length===0) break;
    allSvc=allSvc.concat(data);
    from+=1000;
    if(from%100000===0) process.stderr.write(from/1000+'k ');
  }
  console.log('\nServices loaded:', allSvc.length);

  // For each code, collect (date, amount) pairs
  const byCode={};
  for(const svc of allSvc){
    if(!svc.code || !svc.amount) continue;
    const date=dateMap[svc.record_num];
    if(!date) continue;
    if(!byCode[svc.code]) byCode[svc.code]=[];
    byCode[svc.code].push({date, amount: parseFloat(svc.amount)});
  }
  console.log('Codes with dated transactions:', Object.keys(byCode).length);

  // Find last price change per code
  const lastChangeMap={};
  for(const [code, txns] of Object.entries(byCode)){
    txns.sort((a,b)=>a.date.localeCompare(b.date));
    const latestAmount=txns[txns.length-1].amount;
    let firstSeen=txns[txns.length-1].date;
    for(let i=txns.length-2;i>=0;i--){
      if(Math.abs(txns[i].amount-latestAmount)<0.01){
        firstSeen=txns[i].date;
      } else {
        break;
      }
    }
    lastChangeMap[code]={
      lastChange: firstSeen,
      currentAmount: latestAmount,
      txnCount: txns.length
    };
  }
  console.log('Codes with price change detection:', Object.keys(lastChangeMap).length);

  // Read PRICE.V2$ dates
  const priceBuf=fs.readFileSync('C:/AVImark/PRICE.V2$');
  const priceRecSize=168;
  const priceTotalRec=Math.floor(priceBuf.length/priceRecSize);
  const priceDateMap={};
  for(let i=0;i<priceTotalRec;i++){
    const off=i*priceRecSize;
    const dt=priceBuf.readDoubleLE(off+21);
    if(dt>35000 && dt<50000){
      const ms=Date.UTC(1899,11,30)+dt*86400000;
      const d=new Date(ms);
      if(!isNaN(d.getTime()) && d.getFullYear()>=2005 && d.getFullYear()<=2026) priceDateMap[i]=d.toISOString().slice(0,10);
    }
  }

  // Get all prices
  let allPrices=[];
  let pfrom=0;
  while(true){
    const {data}=await s.from('prices').select('treatment_code,price,record_num').range(pfrom,pfrom+999);
    if(!data||data.length===0) break;
    allPrices=allPrices.concat(data);
    pfrom+=1000;
  }

  // Names
  const {data:treats}=await s.from('treatments').select('code,name');
  const treatMap={};
  treats.forEach(t=>{treatMap[t.code]=t.name;});
  const {data:items}=await s.from('items').select('code,name');
  const itemMap={};
  items.forEach(t=>{itemMap[t.code]=t.name;});

  // Usage
  const usage=JSON.parse(fs.readFileSync('../cliniciq-dashboard/usage.json','utf-8'));
  const usageMap={};
  usage.forEach(u=>{usageMap[u.code]=u;});

  // Build final
  const result=allPrices.filter(p=>p.price>0).map(p=>{
    const code=p.treatment_code;
    const u=usageMap[code]||{};
    const priceDate=priceDateMap[p.record_num]||null;
    const svcChange=lastChangeMap[code]||null;
    let lastMod=priceDate;
    if(!lastMod && svcChange) lastMod=svcChange.lastChange;

    return {
      code,
      name: treatMap[code] || itemMap[code] || code,
      price: p.price,
      last_modified: lastMod,
      price_file_date: priceDate,
      service_last_change: svcChange ? svcChange.lastChange : null,
      annual_count: u.annual_count || 0,
      annual_revenue: u.annual_revenue || 0,
      txn_count: svcChange ? svcChange.txnCount : 0
    };
  });

  const withDate=result.filter(x=>x.last_modified);
  console.log('Final:', result.length, 'items,', withDate.length, 'with dates ('+Math.round(withDate.length/result.length*100)+'%)');
  console.log('  From PRICE.V2$ file:', result.filter(x=>x.price_file_date).length);
  console.log('  From service history:', result.filter(x=>!x.price_file_date && x.service_last_change).length);
  console.log('  No date:', result.filter(x=>!x.last_modified).length);

  fs.writeFileSync('../cliniciq-dashboard/prices.json', JSON.stringify(result));
  console.log('Written prices.json');
})();
