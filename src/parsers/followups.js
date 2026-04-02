import { V2Parser } from './base.js';

/**
 * FOLLOW.V2$ — Follow-up records (142 bytes/record, ~25.7K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (follow-up date)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @41:     Pascal string: code (length byte at @41, text at @42)
 *   @55:     Pascal string: description (length at @55, text at @56, up to 30 chars)
 *   @86:     Pascal string: doctor initials (length at @86, text at @87)
 *   @89-96:  additional int32 fields (possible refs)
 */
export class FollowUpParser extends V2Parser {
  constructor(dataDir) {
    super('FOLLOW.V2$', 142, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const followDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @41
    const codeLen = Math.min(buf[41] || 0, 10);
    let code = '';
    if (codeLen > 0 && codeLen <= 10) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[42 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Description — Pascal string at @55
    const descLen = Math.min(buf[55] || 0, 30);
    let description = '';
    if (descLen > 0) {
      for (let i = 0; i < descLen; i++) {
        const c = buf[56 + i];
        if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      }
    }

    // Doctor initials — Pascal string at @86
    const docLen = Math.min(buf[86] || 0, 4);
    let doctor = '';
    if (docLen > 0 && docLen <= 4) {
      for (let i = 0; i < docLen; i++) {
        const c = buf[87 + i];
        if (c >= 32 && c <= 126) doctor += String.fromCharCode(c);
      }
    }

    if (!followDate && !code && !description) return null;

    return {
      record_num: index,
      follow_date: followDate,
      code: code.trim(),
      description: description.trim(),
      doctor: doctor.trim(),
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
