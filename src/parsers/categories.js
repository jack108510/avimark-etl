import { V2Parser } from './base.js';

/**
 * CATEGORY.V2$ — Category records (72 bytes/record, 69 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @49:     type marker ('D')
 *   @50:     Pascal string: category name (length at @50, text at @51)
 */
export class CategoryParser extends V2Parser {
  constructor(dataDir) {
    super('CATEGORY.V2$', 184, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const catDate = this.extractDelphiDate(buf, 21);

    // Name — Pascal string at @50
    const nameLen = Math.min(buf[50] || 0, 60);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[51 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    if (!name) return null;

    return {
      record_num: index,
      name: name.trim(),
      description: catDate || null,
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
