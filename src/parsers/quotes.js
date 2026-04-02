import { V2Parser } from './base.js';

/**
 * QUOTE.V2$ — Quote/Estimate header records (140 bytes/record, ~16K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @42:     Pascal string: name/description (length at @42, text at @43)
 */
export class QuoteParser extends V2Parser {
  constructor(dataDir) {
    super('QUOTE.V2$', 140, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const quoteDate = this.extractDelphiDate(buf, 21);

    // Name — Pascal string at @40 (length at @40, text at @41)
    const nameLen = Math.min(buf[40] || 0, 40);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    if (!quoteDate && !name) return null;

    return {
      record_num: index,
      quote_date: quoteDate,
      name: name.trim(),
    };
  }

  extractDelphiDate(buf, offset) {
    const d = buf.readDoubleLE(offset);
    if (d < 30000 || d > 55000) return null;
    const epoch = new Date(1899, 11, 30).getTime();
    const ms = epoch + d * 86400000;
    const dt = new Date(ms);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().replace('T', ' ').substring(0, 19);
  }
}
