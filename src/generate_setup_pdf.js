#!/usr/bin/env node
import fs from 'fs';
import PDFDocument from 'pdfkit';

const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
doc.pipe(fs.createWriteStream('setup_guide.pdf'));

const PAGE_W = 612, MARGIN = 40, CONTENT_W = PAGE_W - MARGIN * 2;

function h1(text) { doc.moveDown(0.5); doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(text); doc.moveDown(0.3); }
function h2(text) { doc.moveDown(0.4); doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a4480').text(text); doc.moveDown(0.2); }
function p(text) { doc.fontSize(10).font('Helvetica').fillColor('#222').text(text, { width: CONTENT_W }); doc.moveDown(0.2); }
function code(text) {
  doc.moveDown(0.15);
  const y = doc.y;
  const lines = text.split('\n');
  const blockH = lines.length * 12 + 12;
  doc.rect(MARGIN, y, CONTENT_W, blockH).fill('#f4f4f4').stroke('#ccc');
  doc.fillColor('#0b3d0b').font('Courier').fontSize(9);
  doc.text(text, MARGIN + 8, y + 6, { width: CONTENT_W - 16 });
  doc.y = y + blockH + 4;
  doc.fillColor('#222');
}

// COVER
doc.fontSize(22).font('Helvetica-Bold').fillColor('#000').text('Avimark Price ETL', { align: 'center' });
doc.fontSize(12).font('Helvetica').fillColor('#666').text('Supabase setup + Windows scheduled task', { align: 'center' });
doc.fontSize(9).text(`Generated ${new Date().toLocaleString('en-CA', { timeZone: 'America/Denver' })}`, { align: 'center' });
doc.moveDown(1.5);

h1('1. Tables in Supabase (current state)');
p('These tables already exist and are populated:');
code(
  '  services              622,881 rows  (billing history from SERVICE.V2$)\n' +
  '  prices                  4,681 rows  (fee schedule from PRICE.V2$, stale — do not trust)\n' +
  '  purchase_orders        28,886 rows  (PO.V2$)\n' +
  '  items                   4,998 rows  (ITEM.V2$)\n' +
  '  clients                13,967 rows\n' +
  '  pricing_dashboard       3,462 rows  (older dashboard)\n' +
  '  list_prices             3,810 rows  (NEW — v6 billing-derived list prices) ✓'
);

h2('list_prices schema');
p('Already created. Schema:');
code(
`CREATE TABLE list_prices (
  treatment_code text PRIMARY KEY,
  description text,
  list_price numeric,
  last_changed date,
  months_held int,
  confidence int,
  tier text,              -- HIGH | MEDIUM | LOW
  share_pct numeric,
  charges_in_run int,
  alt1_price numeric,     -- previous price before change
  alt1_count int,
  alt2_price numeric,
  alt2_count int,
  drifting boolean,       -- newer run detected (possible new change)
  drift_price numeric,
  drift_months int,
  uses_365d int,
  revenue_365d numeric,
  updated_at timestamptz DEFAULT now()
);`
);

doc.addPage();
h1('2. Refresh script');
p('Nightly ETL re-runs the v6 algorithm and upserts list_prices.');
p('Location:');
code('C:\\Users\\Jackwilde\\Projects\\avimark-etl\\src\\refresh_list_prices.js');

h2('Run once manually (smoke test)');
code('cd C:\\Users\\Jackwilde\\Projects\\avimark-etl\nnode src\\refresh_list_prices.js');
p('Expected output:');
code(
`[2026-04-05T...] Refreshing list_prices...
  Loaded 322000 positive charges
  Computed 3810 list prices
[2026-04-05T...] ✅ Wrote 3810 rows to list_prices in 58.3s`
);

h1('3. Install as Windows Scheduled Task');
p('Run this ONCE, as Administrator (right-click PowerShell → Run as Admin):');
code('cd C:\\Users\\Jackwilde\\Projects\\avimark-etl\\scripts\n.\\install_list_prices_task.ps1');
p('This creates a task named "Avimark-RefreshListPrices" that runs nightly at 2:30 AM as SYSTEM.');

h2('Verify installation');
code('Get-ScheduledTask -TaskName "Avimark-RefreshListPrices"\nGet-ScheduledTask -TaskName "Avimark-RefreshListPrices" | Get-ScheduledTaskInfo');

h2('Run the task manually (test)');
code('Start-ScheduledTask -TaskName "Avimark-RefreshListPrices"');

h2('Check last result');
code('Get-ScheduledTask -TaskName "Avimark-RefreshListPrices" | Get-ScheduledTaskInfo | \n  Select LastRunTime, LastTaskResult, NextRunTime');
p('LastTaskResult = 0 means success. Anything else = check logs.');

h2('View logs');
code('Get-Content C:\\Users\\Jackwilde\\Projects\\avimark-etl\\logs\\list_prices_refresh.log -Tail 50');
p('(Note: scheduled task captures stdout to Event Viewer → Task Scheduler → Avimark-RefreshListPrices)');

h2('Uninstall (if needed)');
code('.\\uninstall_list_prices_task.ps1');

doc.addPage();
h1('4. Querying list_prices');
p('From Supabase SQL editor or anywhere with service key:');
code(
`-- All high-confidence prices
SELECT treatment_code, list_price, last_changed, days_held, confidence
FROM list_prices
WHERE tier = 'HIGH'
ORDER BY revenue_365d DESC;

-- Codes that changed recently (last 90 days)
SELECT treatment_code, description, list_price, alt1_price AS old_price, last_changed
FROM list_prices
WHERE last_changed >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY last_changed DESC;

-- Codes potentially changing right now (drift flag)
SELECT treatment_code, description, list_price, drift_price, drift_months
FROM list_prices
WHERE drifting = true AND drift_months >= 2
ORDER BY revenue_365d DESC;

-- Low-confidence codes that need manual review
SELECT treatment_code, description, list_price, share_pct, charges_in_run
FROM list_prices
WHERE tier = 'LOW' AND revenue_365d > 1000
ORDER BY revenue_365d DESC;`
);

h1('5. File layout');
code(
`C:\\Users\\Jackwilde\\Projects\\avimark-etl\\
├── .env                        (SUPABASE_URL, SUPABASE_SERVICE_KEY)
├── src\\
│   ├── refresh_list_prices.js  ← the nightly ETL
│   ├── build_list_prices_v6.js ← one-shot rebuild w/ CSV export
│   ├── generate_audit_pdf.js
│   └── generate_setup_pdf.js   (this file's generator)
├── scripts\\
│   ├── install_list_prices_task.ps1
│   └── uninstall_list_prices_task.ps1
├── logs\\                       (created on first run)
├── list_prices_v6.csv          (snapshot)
├── list_prices_v6.json         (snapshot)
└── price_audit_25.pdf          (audit sheet)`
);

h1('6. TL;DR — install now');
code(
`# 1. Test the script
cd C:\\Users\\Jackwilde\\Projects\\avimark-etl
node src\\refresh_list_prices.js

# 2. Open PowerShell AS ADMIN, then:
cd C:\\Users\\Jackwilde\\Projects\\avimark-etl\\scripts
.\\install_list_prices_task.ps1

# 3. Verify
Get-ScheduledTask -TaskName "Avimark-RefreshListPrices" | Get-ScheduledTaskInfo`
);

doc.end();
console.log('✅ Saved setup_guide.pdf');
