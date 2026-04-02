import { V2Parser } from './base.js';

/**
 * PROC.V2$ — Procedure/Treatment template records (256 bytes/record, ~408K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags (0x0240 = 576 common)
 *   @40:     Pascal string: code (length byte at @40, text at @41)
 *   @49:     type marker ('A')
 *   @50:     Pascal string: description (length at @50, text at @51)
 *   @85-90:  sub-type flags
 *   @91:     Pascal string: short name / category
 *   @143:    Pascal string: species name
 *   @168:    Pascal string: secondary species
 */
export class ProcedureParser extends V2Parser {
  constructor(dataDir) {
    super('PROC.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const procDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @40
    const codeLen = Math.min(buf[40] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Description — Pascal string at @50
    const descLen = Math.min(buf[50] || 0, 40);
    let description = '';
    if (descLen > 0) {
      for (let i = 0; i < descLen; i++) {
        const c = buf[51 + i];
        if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      }
    }

    // Short name/category — Pascal string at @90 (len at @90, text at @91)
    const catLen = Math.min(buf[90] || 0, 20);
    let category = '';
    if (catLen > 0) {
      for (let i = 0; i < catLen; i++) {
        const c = buf[91 + i];
        if (c >= 32 && c <= 126) category += String.fromCharCode(c);
      }
    }

    // Species — Pascal string at @142 (len at @142, text at @143)
    const specLen = Math.min(buf[142] || 0, 20);
    let species = '';
    if (specLen > 0) {
      for (let i = 0; i < specLen; i++) {
        const c = buf[143 + i];
        if (c >= 32 && c <= 126) species += String.fromCharCode(c);
      }
    }

    if (!code && !description) return null;

    return {
      record_num: index,
      procedure_date: procDate,
      code: code.trim(),
      description: [description.trim(), category.trim(), species.trim()].filter(Boolean).join(' | '),
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
