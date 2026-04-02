import { V2Parser } from './base.js';

/**
 * VISIT.V2$ — Visit records (256 bytes/record, ~46K records)
 * 
 * Structure:
 *   @0:     status byte (0=active)
 *   @1-20:  hash/checksum
 *   @21-28: TDateTime double (visit date)
 *   @29-39: reserved/flags
 *   @40:    type byte (0x44='D' common)
 *   @41-42: ref_id (uint16LE — likely links to service/treatment)
 *   @43-44: padding
 *   @45:    doctor initials length (Pascal string)
 *   @46+:   doctor initials (2 chars typically)
 *   @48:    field_48 byte
 *   @49-50: field_49 (often 0xBF9F)
 *   @51-52: field_51 (often 0xBF9F)
 *   @53-56: field_53 (int32LE)
 */
export class VisitParser extends V2Parser {
  constructor(dataDir) {
    super('VISIT.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    // Skip deleted records
    if (buf[0] === 0xFF) return null;

    const visitDate = this.extractDelphiDate(buf, 21);
    if (!visitDate) return null;

    const typeByte = buf[40];
    const refId = buf.readUInt16LE(41);
    
    // Doctor initials — Pascal string at @45
    const docLen = Math.min(buf[45] || 0, 10);
    const doctor = docLen > 0
      ? buf.toString('ascii', 46, 46 + docLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
      : '';

    const field_48 = buf[48];
    const field_53 = buf.readInt32LE(53);

    return {
      record_num: index,
      visit_date: visitDate,
      type_code: typeByte,
      ref_id: refId,
      doctor,
      field_48,
      field_53,
    };
  }

  extractDelphiDate(buf, offset) {
    const d = buf.readDoubleLE(offset);
    if (d < 30000 || d > 55000) return null;
    // Delphi TDateTime: days since 1899-12-30
    const epoch = new Date(1899, 11, 30).getTime();
    const ms = epoch + d * 86400000;
    const dt = new Date(ms);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().replace('T', ' ').substring(0, 19);
  }
}
