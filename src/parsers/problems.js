import { V2Parser } from './base.js';

/**
 * PROBLEM.V2$ — Problem list entries (167 bytes/record, ~799 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     Pascal string: code (length at @40, text at @41, e.g., "PA6406")
 *   @49:     type marker ('A')
 *   @50:     Pascal string: name (length at @50, text at @51, e.g., "Aggression")
 */
export class ProblemParser extends V2Parser {
  constructor(dataDir) {
    super('PROBLEM.V2$', 167, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const probDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @40
    const codeLen = Math.min(buf[40] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Name — Pascal string at @50
    const nameLen = Math.min(buf[50] || 0, 40);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[51 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    if (!code && !name) return null;

    return {
      record_num: index,
      prob_date: probDate,
      code: code.trim(),
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
