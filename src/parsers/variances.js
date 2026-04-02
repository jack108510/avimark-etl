import { V2Parser } from './base.js';

/**
 * VARIANCE.V2$ — Price variance records (96 bytes/record, ~269K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags (0x40=64 common)
 *   @40:     Pascal string: item code (length at @40, text at @41, e.g., "PILL 2")
 *   @49:     type marker ('A')
 *   @59:     doctor initials (2 chars, e.g., "CC")
 *   @64-67:  quantity (int32)
 *   @68-71:  amount/price (int32)
 *   @77:     Pascal string: secondary code (e.g., "ZA")
 *   @81:     flag byte
 */
export class VarianceParser extends V2Parser {
  constructor(dataDir) {
    super('VARIANCE.V2$', 108, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const varDate = this.extractDelphiDate(buf, 21);

    // Item code — Pascal string at @40
    const codeLen = Math.min(buf[40] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Doctor initials at @59
    const docLen = Math.min(buf[58] || 0, 4);
    let doctor = '';
    if (docLen > 0 && docLen <= 4) {
      for (let i = 0; i < docLen; i++) {
        const c = buf[59 + i];
        if (c >= 32 && c <= 126) doctor += String.fromCharCode(c);
      }
    }

    // Quantity and amounts
    const quantity = buf.readInt32LE(64);
    const amount = buf.readInt32LE(68);

    // Secondary code at @77
    const secLen = Math.min(buf[77] || 0, 8);
    let secondaryCode = '';
    if (secLen > 0 && secLen <= 8) {
      for (let i = 0; i < secLen; i++) {
        const c = buf[78 + i];
        if (c >= 32 && c <= 126) secondaryCode += String.fromCharCode(c);
      }
    }

    if (!varDate && !code) return null;

    return {
      record_num: index,
      variance_date: varDate,
      code: code.trim(),
      description: [doctor.trim(), secondaryCode.trim()].filter(Boolean).join(' / ') || null,
      amount: amount / 100,
      field_type: quantity || null,
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
