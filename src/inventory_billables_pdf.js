import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import fs from 'fs';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Loading inventory costs...\n');

  // Get all inventory cost items
  const { data: inventory } = await supabase
    .from('inventory_costs')
    .select('item_code, unit_cost, last_po_cost, last_po_qty')
    .order('item_code');

  console.log(`Loaded ${inventory.length} inventory items`);

  // Get all unique service codes with descriptions
  const { data: services } = await supabase
    .from('services')
    .select('code, description');

  // Build a map of code -> description (take first non-null description)
  const serviceDesc = new Map();
  services?.forEach(s => {
    if (s.description && !serviceDesc.has(s.code)) {
      serviceDesc.set(s.code, s.description);
    }
  });

  console.log(`Loaded ${serviceDesc.size} unique service codes with descriptions`);

  // Split into has/doesn't have billables
  const hasBillables = [];
  const noBillables = [];

  inventory.forEach(item => {
    const desc = serviceDesc.get(item.item_code);
    if (desc) {
      hasBillables.push({ ...item, description: desc });
    } else {
      noBillables.push({ ...item, description: null });
    }
  });

  console.log(`Has billables: ${hasBillables.length}`);
  console.log(`No billables: ${noBillables.length}`);

  // Generate PDF
  console.log('\nGenerating PDF...');

  const doc = new PDFDocument({ 
    size: 'letter',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  const outPath = 'C:/Users/Jackwilde/Projects/avimark-etl/inventory_billables.pdf';
  doc.pipe(fs.createWriteStream(outPath));

  // Title
  doc.fontSize(20).font('Helvetica-Bold').text('Inventory Cost Analysis', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Rosslyn Veterinary Clinic • ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.moveDown(1);

  // Summary
  doc.fontSize(14).font('Helvetica-Bold').text('Summary');
  doc.fontSize(11).font('Helvetica');
  doc.text(`Total PO Items: ${inventory.length}`);
  doc.text(`Items with Billables: ${hasBillables.length}`);
  doc.text(`Items without Billables: ${noBillables.length}`);
  doc.moveDown(1);

  // Section 1: Has Billables
  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').fillColor('green').text(`Items WITH Billables (${hasBillables.length})`);
  doc.moveDown(0.5);

  doc.fontSize(9).font('Helvetica-Bold').fillColor('black');
  doc.text('Code', 50, doc.y, { width: 80, continued: true });
  doc.text('Description', 130, doc.y, { width: 280, continued: true });
  doc.text('Unit Cost', 420, doc.y, { width: 70, continued: true });
  doc.text('Last PO', 500, doc.y, { width: 70 });

  doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();
  doc.moveDown(0.3);

  doc.fontSize(8).font('Helvetica');
  hasBillables.forEach((item, i) => {
    const y = doc.y;
    if (y > 730) {
      doc.addPage();
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Code', 50, doc.y, { width: 80, continued: true });
      doc.text('Description', 130, doc.y, { width: 280, continued: true });
      doc.text('Unit Cost', 420, doc.y, { width: 70, continued: true });
      doc.text('Last PO', 500, doc.y, { width: 70 });
      doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();
      doc.moveDown(0.3);
      doc.fontSize(8).font('Helvetica');
    }

    doc.text(item.item_code, 50, doc.y, { width: 80, continued: true });
    doc.text((item.description || '').substring(0, 45), 130, doc.y, { width: 280, continued: true });
    doc.text(`$${item.unit_cost.toFixed(4)}`, 420, doc.y, { width: 70, continued: true, align: 'right' });
    doc.text(`$${item.last_po_cost.toFixed(2)}`, 500, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.2);
  });

  // Section 2: No Billables
  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').fillColor('red').text(`Items WITHOUT Billables (${noBillables.length})`);
  doc.fontSize(10).font('Helvetica').fillColor('gray').text('(Internal supplies, discontinued items, or bundled services)');
  doc.moveDown(0.5);

  doc.fontSize(9).font('Helvetica-Bold').fillColor('black');
  doc.text('Code', 50, doc.y, { width: 100, continued: true });
  doc.text('Unit Cost', 200, doc.y, { width: 100, continued: true });
  doc.text('Last PO Total', 320, doc.y, { width: 100, continued: true });
  doc.text('Qty', 440, doc.y, { width: 80 });

  doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();
  doc.moveDown(0.3);

  doc.fontSize(8).font('Helvetica');
  noBillables.forEach((item, i) => {
    if (doc.y > 730) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').fillColor('red').text(`Items WITHOUT Billables (${noBillables.length}) (continued)`);
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('black');
      doc.text('Code', 50, doc.y, { width: 100, continued: true });
      doc.text('Unit Cost', 200, doc.y, { width: 100, continued: true });
      doc.text('Last PO Total', 320, doc.y, { width: 100, continued: true });
      doc.text('Qty', 440, doc.y, { width: 80 });
      doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();
      doc.moveDown(0.3);
      doc.fontSize(8).font('Helvetica');
    }

    doc.text(item.item_code, 50, doc.y, { width: 100, continued: true });
    doc.text(`$${item.unit_cost.toFixed(4)}`, 200, doc.y, { width: 100, continued: true, align: 'right' });
    doc.text(`$${item.last_po_cost.toFixed(2)}`, 320, doc.y, { width: 100, continued: true, align: 'right' });
    doc.text(item.last_po_qty.toString(), 440, doc.y, { width: 80, align: 'right' });
    doc.moveDown(0.2);
  });

  doc.end();

  console.log(`\nPDF saved to: ${outPath}`);
}

main().catch(console.error);
