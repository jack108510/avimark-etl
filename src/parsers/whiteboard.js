import { V2Parser } from './base.js';

/**
 * WBOARD.V2$ — Whiteboard entries (256 bytes/record, ~160K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags (0x40=64 common)
 *   @46:     Pascal string: description (length at @46, text at @47)
 *   @89:     doctor initials (2 chars)
 *   @92:     Pascal string: code (length at @92, text at @93)
 */
export class WhiteboardParser extends V2Parser {
  constructor(dataDir) {
    super('WBOARD.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const wbDate = this.extractDelphiDate(buf, 21);

    // Description — Pascal string at @46
    const descLen = Math.min(buf[46] || 0, 40);
    let description = '';
    if (descLen > 0) {
      for (let i = 0; i < descLen; i++) {
        const c = buf[47 + i];
        if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      }
    }

    // Doctor initials at @89
    const docLen = Math.min(buf[88] || 0, 4);
    let doctor = '';
    if (docLen > 0 && docLen <= 4) {
      for (let i = 0; i < docLen; i++) {
        const c = buf[89 + i];
        if (c >= 32 && c <= 126) doctor += String.fromCharCode(c);
      }
    }

    // Code — Pascal string at @92
    const codeLen = Math.min(buf[92] || 0, 10);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[93 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    if (!description && !code && !wbDate) return null;

    return {
      record_num: index,
      entry_date: wbDate,
      code: code.trim(),
      description: [description.trim(), doctor.trim()].filter(Boolean).join(' - ') || null,
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
