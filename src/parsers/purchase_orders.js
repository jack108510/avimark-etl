import { V2Parser } from './base.js';

/**
 * PO.V2$ — Purchase Order records (64 bytes/record, ~29K records)
 * 
 * Alternating record types:
 *   EVEN records (headers): @21=TDateTime (order date), @46=PO number (Pascal 8 chars), @56=vendor code (Pascal)
 *   ODD records (line items): @0=quantity text, @13=item code (Pascal), @29=flags
 */
export class PurchaseOrderParser extends V2Parser {
  constructor(dataDir) {
    super('PO.V2$', 64, dataDir);
  }

  parseRecord(buf, index) {
    // Determine record type: even=header, odd=line item
    // Headers have dates at @21, line items have @0 starting with digits and @29=62 or 121

    // Try to read date — if valid, it's a header
    let date = null;
    try {
      const v = buf.readDoubleLE(21);
      if (v > 35000 && v < 47000) {
        const epoch = new Date(1899, 11, 30).getTime();
        date = new Date(epoch + v * 86400000);
        if (!isNaN(date.getTime())) {
          date = date.toISOString().replace('T', ' ').substring(0, 19);
        } else {
          date = null;
        }
      }
    } catch(e) {}

    const flags29 = buf[29];

    if (date && flags29 !== 62 && flags29 !== 121) {
      // HEADER record
      const poNumLen = Math.min(buf[46] || 0, 12);
      const po_number = poNumLen > 0
        ? buf.toString('ascii', 47, 47 + poNumLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
        : '';

      const vendorLen = Math.min(buf[56] || 0, 8);
      const vendor_code = vendorLen > 0
        ? buf.toString('ascii', 57, 57 + vendorLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
        : '';

      return {
        record_num: index,
        record_type: 'header',
        order_date: date,
        po_number,
        vendor_code,
        item_code: null,
        quantity: null,
      };
    } else {
      // LINE ITEM record
      // Quantity is ASCII at start of record
      const qtyStr = buf.toString('ascii', 0, 12).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
      const quantity = parseInt(qtyStr) || 0;

      // Item code is Pascal string around @13
      const codeLen = Math.min(buf[13] || 0, 14);
      const item_code = codeLen > 0
        ? buf.toString('ascii', 14, 14 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
        : '';

      if (!item_code && !quantity) return null;

      return {
        record_num: index,
        record_type: 'line_item',
        order_date: null,
        po_number: null,
        vendor_code: null,
        item_code,
        quantity,
      };
    }
  }
}
