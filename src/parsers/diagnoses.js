import { V2Parser } from './base.js';

/**
 * DIAGNOSE.V2$ — Diagnosis records (85 bytes/record, ~6K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @44:     order1 (int16)
 *   @46:     order2 (int16)
 *   @49:     type/link (int32)
 */
export class DiagnoseParser extends V2Parser {
  constructor(dataDir) {
    super('DIAGNOSE.V2$', 85, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const diagDate = this.extractDelphiDate(buf, 21);

    const flags = buf.readUInt16LE(28);
    const field_44 = buf.readInt16LE(44);
    const field_46 = buf.readInt16LE(46);
    const field_49 = buf.readInt32LE(49);

    // Not much visible text in this file. Most data is numeric references.
    if (!diagDate && field_44 === 0 && field_46 === 0) return null;

    return {
      record_num: index,
      diag_date: diagDate,
      flags,
      field_44,
      field_46,
      field_49,
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
