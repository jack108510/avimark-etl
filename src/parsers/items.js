import { V2Parser } from './base.js';

export class ItemParser extends V2Parser {
  constructor(dataDir) {
    super('ITEM.V2$', 549, dataDir);
  }

  parseRecord(buf, index) {
    // Code at offset 40 (Pascal string: length byte + chars)
    const code = this.extractString(buf, 40, 10);
    if (!code) return null;

    // Name: length at 51, text at 52
    const nameLen = Math.min(buf[51] || 0, 50);
    const name = nameLen > 0
      ? buf.toString('ascii', 52, 52 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
      : '';

    // UOM at @123 (Pascal string) — confirmed: "TAB", "ML", "BOT", "patch", etc.
    const uom = this.extractString(buf, 123, 20);

    // Pack size at @154 (int16LE) — units per package purchased
    // e.g. 500 for a bottle of 500 tabs, 4000 for a 4L bottle of liquid
    // Value of 1 = sold as individual units (no conversion needed)
    const pack_size = buf.readInt16LE(154) || 1;

    // Service code link @261 (Pascal string) — links inventory to billing code
    // When present, this code matches services.code for COGS calculations
    const service_code = this.extractString(buf, 261, 20) || null;

    if (!name) return null;

    return {
      record_num: index,
      code: code.trim(),
      name,
      uom: uom || null,
      pack_size: pack_size > 0 ? pack_size : 1,
      service_code,
    };
  }
}
