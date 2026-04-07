import { V2Parser } from './base.js';

export class PriceParser extends V2Parser {
  constructor(dataDir) {
    super('PRICE.V2$', 108, dataDir);
  }

  parseRecord(buf, index) {
    const code = this.extractString(buf, 43, 8).replace(/[^A-Za-z0-9]/g, '');
    if (!code) return null;

    // Delphi currency at offset 58: int64 / 10000
    const price = this.extractCurrency(buf, 58);

    if (price <= 0 || price > 50000) return null;

    // TDateTime at offset 21 = last changed date
    let last_changed = null;
    try {
      const v = buf.readDoubleLE(21);
      if (v > 35000 && v < 47000) {
        const epoch = new Date(1899, 11, 30).getTime();
        const d = new Date(epoch + v * 86400000);
        if (!isNaN(d.getTime())) {
          last_changed = d.toISOString().replace('T', ' ').substring(0, 19);
        }
      }
    } catch(e) {}

    return {
      record_num: index,
      treatment_code: code,
      price,
      last_changed,
    };
  }
}
