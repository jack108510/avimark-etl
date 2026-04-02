import { V2Parser } from './base.js';

/**
 * PROBHIST.V2$ — Problem history records (48 bytes/record, ~19K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     Pascal string: problem code (e.g., "PP8555")
 */
export class ProbHistParser extends V2Parser {
  constructor(dataDir) {
    super('PROBHIST.V2$', 48, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const histDate = this.extractDelphiDate(buf, 21);

    // Code/text — Pascal string at @40
    const codeLen = Math.min(buf[40] || 0, 7);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Also check if there's text visible via raw extraction (seen "Pruritus, Itching" at @21 in rec 2)
    // That was actually a non-date record. Let's extract any ASCII text
    let text = '';
    for (let i = 21; i < 48; i++) {
      const c = buf[i];
      if (c >= 32 && c <= 126) text += String.fromCharCode(c);
      else if (text.length > 0) break;
    }

    if (!histDate && !code && text.length < 3) return null;

    return {
      record_num: index,
      hist_date: histDate,
      code: code.trim(),
      text: (text.length >= 3 && !histDate) ? text.trim() : '',
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
