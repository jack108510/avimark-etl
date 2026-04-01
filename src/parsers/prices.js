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

    return {
      record_num: index,
      treatment_code: code,
      price,
    };
  }
}
