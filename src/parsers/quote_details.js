import { V2Parser } from './base.js';

/**
 * QUOTAIL.V2$ — Quote detail/line item records (255 bytes/record, ~124K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @56:     quantity (int32 at @56)
 *   @60:     Pascal string: description (length at @60, text at @61)
 *   @103:    Pascal string: code (length at @102, text at @103)
 */
export class QuoteDetailParser extends V2Parser {
  constructor(dataDir) {
    super('QUOTAIL.V2$', 255, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const lineDate = this.extractDelphiDate(buf, 21);

    // Description — Pascal string around @60
    const descLen = Math.min(buf[60] || 0, 40);
    let description = '';
    if (descLen > 0) {
      for (let i = 0; i < descLen; i++) {
        const c = buf[61 + i];
        if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      }
    }

    // Code — Pascal string at @102
    const codeLen = Math.min(buf[102] || 0, 10);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[103 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    const quantity = buf.readInt32LE(56);

    if (!description && !code) return null;

    return {
      record_num: index,
      line_date: lineDate,
      code: code.trim(),
      description: description.trim(),
      quantity,
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
