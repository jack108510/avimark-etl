import { V2Parser } from './base.js';

/**
 * PRESCRIP.V2$ — Prescription records (310 bytes/record, ~75K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (rx date)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @41-44:  reference fields (int32)
 *   @45:     secondary type/count
 */
export class PrescriptionParser extends V2Parser {
  constructor(dataDir) {
    super('PRESCRIP.V2$', 310, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const rxDate = this.extractDelphiDate(buf, 21);
    if (!rxDate) return null;

    const flags = buf.readUInt16LE(28);
    const typeByte = buf[40];
    const refId = buf.readInt32LE(41);
    const field_45 = buf[45];
    const field_46 = buf.readInt32LE(46);

    return {
      record_num: index,
      rx_date: rxDate,
      flags,
      type_byte: typeByte,
      ref_id: refId,
      field_45,
      field_46,
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
