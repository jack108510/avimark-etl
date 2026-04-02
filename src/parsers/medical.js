import { V2Parser } from './base.js';

/**
 * MEDICAL.V2$ — Medical records (256 bytes/record, ~53K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (record date)
 *   @28:     flags (0x0440 = 1088 common)
 *   @40:     type byte
 *   @41-44:  ref codes
 *   @117:    service link (int32)
 *   @210:    doctor initials
 */
export class MedicalParser extends V2Parser {
  constructor(dataDir) {
    super('MEDICAL.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const recordDate = this.extractDelphiDate(buf, 21);
    if (!recordDate) return null;

    const flags = buf.readUInt16LE(28);
    const typeByte = buf[40];

    // Doctor initials around @210 (seen "NB", "AC" in analysis)
    const docLen = Math.min(buf[209] || 0, 10);
    const doctor = docLen > 0 && docLen < 10
      ? this.cleanString(buf, 210, docLen)
      : this.cleanString(buf, 210, 4);

    // Service/procedure link
    const serviceRef = buf.readInt32LE(117);

    return {
      record_num: index,
      record_date: recordDate,
      flags,
      type_byte: typeByte,
      doctor: doctor || '',
      service_ref: serviceRef !== 0 ? serviceRef : null,
    };
  }

  cleanString(buf, offset, len) {
    let s = '';
    for (let i = 0; i < len && offset + i < buf.length; i++) {
      const c = buf[offset + i];
      if (c >= 32 && c <= 126) s += String.fromCharCode(c);
    }
    return s.trim();
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
