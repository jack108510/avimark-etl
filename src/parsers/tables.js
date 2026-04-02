import { V2Parser } from './base.js';

/**
 * TABLE.V2$ — Lookup table definitions (56 bytes/record, 112 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @41:     Pascal string: table code (e.g., "ZIP")
 *   @50:     Pascal string: table name (e.g., "Zip Code Table")
 */
export class TableParser extends V2Parser {
  constructor(dataDir) {
    super('TABLE.V2$', 128, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const tblDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @41
    const codeLen = Math.min(buf[41] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[42 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Name/description — Pascal string at @50
    const nameLen = Math.min(buf[50] || 0, 40);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[51 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    if (!code) return null;

    return {
      record_num: index,
      name: code.trim(),
      description: name.trim(),
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
