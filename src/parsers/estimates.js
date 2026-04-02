import { V2Parser } from './base.js';

/**
 * ESTIMATE.V2$ — Estimate template records (128 bytes/record, 122 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @42:     Pascal string: estimate name (length at @42, text at @43)
 */
export class EstimateParser extends V2Parser {
  constructor(dataDir) {
    super('ESTIMATE.V2$', 128, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const estDate = this.extractDelphiDate(buf, 21);

    // Name — Pascal string at @42
    const nameLen = Math.min(buf[42] || 0, 40);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[43 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    if (!name) return null;

    return {
      record_num: index,
      estimate_date: estDate,
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
