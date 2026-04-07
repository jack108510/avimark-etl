#!/usr/bin/env node
/**
 * Generate a price audit PDF — 25 items to verify in Avimark UI.
 */
import fs from 'fs';
import PDFDocument from 'pdfkit';

const rows = JSON.parse(fs.readFileSync('list_prices_v6.json', 'utf8'));

const sorted = [...rows].sort((a, b) => b.revenue_365d - a.revenue_365d);
const high = sorted.filter(r => r.tier === 'HIGH' && r.days_held >= 180 && !r.drifting).slice(0, 10);
const recent = sorted.filter(r => r.tier === 'HIGH' && r.days_held < 180 && r.previous_price).slice(0, 8);
const unsure = sorted.filter(r => (r.tier === 'LOW' || r.tier === 'MEDIUM') && r.revenue_365d > 1000).slice(0, 7);

const selection = [
  ...high.map(r => ({ ...r, group: 'A', groupLabel: 'HIGH CONFIDENCE — should match Avimark exactly' })),
  ...recent.map(r => ({ ...r, group: 'B', groupLabel: 'RECENT CHANGES — verify new price is correct' })),
  ...unsure.map(r => ({ ...r, group: 'C', groupLabel: 'UNSURE — possible receptionist errors' })),
];

console.log(`Selected ${selection.length} items`);

const doc = new PDFDocument({ size: 'LETTER', margin: 36, bufferPages: true });
doc.pipe(fs.createWriteStream('price_audit_25.pdf'));

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOX_H = 88;
const GROUP_HEADER_H = 28;

function checkPage(needed) {
  if (doc.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
  }
}

// Header
doc.fontSize(18).font('Helvetica-Bold').fillColor('#000');
doc.text('Rosslyn Veterinary — Price Audit', MARGIN, MARGIN, { align: 'center', width: CONTENT_W });
doc.fontSize(9).font('Helvetica').fillColor('#666');
doc.text(`Generated ${new Date().toLocaleString('en-CA', { timeZone: 'America/Denver' })}  |  Algorithm v6 (daily resolution)  |  ${rows.length} codes scored`, { align: 'center', width: CONTENT_W });
doc.moveDown(0.4);
doc.fontSize(9).fillColor('#333').text(
  'Open Avimark, look up each code, write the UI price in the box, and add any notes. Group C items are our weakest guesses — your input corrects the model.',
  { align: 'center', width: CONTENT_W }
);
doc.moveDown(0.8);

let currentGroup = '';
let itemNumber = 0;

for (const r of selection) {
  // Group header
  if (r.group !== currentGroup) {
    checkPage(GROUP_HEADER_H + BOX_H);
    currentGroup = r.group;
    const colors = { A: '#1a7f37', B: '#9a6700', C: '#cf222e' };
    doc.fontSize(11).font('Helvetica-Bold').fillColor(colors[r.group]);
    doc.text(`GROUP ${r.group}: ${r.groupLabel}`, MARGIN, doc.y);
    doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + CONTENT_W, doc.y + 2).strokeColor(colors[r.group]).lineWidth(1).stroke();
    doc.moveDown(0.6);
  }

  checkPage(BOX_H + 4);

  itemNumber++;
  const y = doc.y;
  const x = MARGIN;

  // Box outline
  doc.lineWidth(0.5).strokeColor('#ccc').rect(x, y, CONTENT_W, BOX_H).stroke();

  // --- Left side: code + description
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#000');
  doc.text(`${itemNumber}. ${r.treatment_code}`, x + 8, y + 6);

  doc.fontSize(9).font('Helvetica').fillColor('#333');
  doc.text(r.description || '(no description)', x + 8, y + 25, { width: 340, ellipsis: true });

  // --- Price / change info block
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
  doc.text(`Our price: $${r.list_price}`, x + 8, y + 45);

  doc.fontSize(8).font('Helvetica').fillColor('#555');
  doc.text(`Changed: ${r.last_changed}  (${r.days_held} days ago)`, x + 8, y + 60);

  if (r.previous_price !== null && r.previous_price !== undefined) {
    doc.text(`Previous: $${r.previous_price}${r.last_old_price_date ? ` — last seen ${r.last_old_price_date}` : ''}`, x + 8, y + 72);
  } else {
    doc.text(`No prior price found in billing history`, x + 8, y + 72);
  }

  // --- Confidence badge
  const tierColor = r.tier === 'HIGH' ? '#1a7f37' : r.tier === 'MEDIUM' ? '#9a6700' : '#cf222e';
  doc.fontSize(8).font('Helvetica-Bold').fillColor(tierColor);
  doc.text(`${r.tier} · ${r.confidence}`, x + 215, y + 45);
  doc.fontSize(7).font('Helvetica').fillColor('#777');
  doc.text(`share ${r.share_pct}%`, x + 215, y + 58);
  doc.text(`${r.charges_in_run} chgs in run`, x + 215, y + 68);

  // --- Usage stats
  doc.fontSize(7).font('Helvetica').fillColor('#777');
  doc.text(`${r.uses_365d} uses / 365d`, x + 300, y + 45);
  doc.text(`$${r.revenue_365d.toLocaleString()} rev`, x + 300, y + 55);

  // --- Avimark price entry box
  doc.lineWidth(1).strokeColor('#000').rect(x + 395, y + 6, 90, 32).stroke();
  doc.fontSize(7).font('Helvetica').fillColor('#888');
  doc.text('AVIMARK UI:', x + 398, y + 8);

  // --- Match checkboxes
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
  doc.rect(x + 395, y + 44, 10, 10).stroke();
  doc.text('matches', x + 409, y + 46);
  doc.rect(x + 452, y + 44, 10, 10).stroke();
  doc.text('wrong', x + 466, y + 46);

  // --- Notes line
  doc.fontSize(7).font('Helvetica').fillColor('#888');
  doc.text('Notes:', x + 395, y + 62);
  doc.moveTo(x + 395, y + 78).lineTo(x + CONTENT_W - 8, y + 78).strokeColor('#999').lineWidth(0.5).stroke();

  doc.y = y + BOX_H + 4;
}

// Summary at end
doc.moveDown(1);
checkPage(120);
doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
doc.text('Summary', MARGIN, doc.y);
doc.fontSize(8).font('Helvetica').fillColor('#333');
doc.text(`Total codes analyzed: ${rows.length}  |  HIGH: ${rows.filter(r => r.tier === 'HIGH').length}  |  MEDIUM: ${rows.filter(r => r.tier === 'MEDIUM').length}  |  LOW: ${rows.filter(r => r.tier === 'LOW').length}`);
doc.moveDown(0.3);
doc.text('Formula v6: finds stable monthly price runs (3+ consecutive months), then pinpoints the exact first day inside that run when the new price appeared in billing.');

doc.end();
console.log('✅ Saved price_audit_25.pdf');
