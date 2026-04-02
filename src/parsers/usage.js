import { V2Parser } from './base.js';

/**
 * USAGE.V2$ — Inventory usage records (63 bytes/record, ~177K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40-44:  type/ref fields
 *   @48:     quantity (int16)
 *   @50-62:  additional fields
 */
export class UsageParser extends V2Parser {
  constructor(dataDir) {
    super('USAGE.V2$', 63, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const usageDate = this.extractDelphiDate(buf, 21);
    if (!usageDate) return null;

    const flags = buf.readUInt16LE(28);
    const field_40 = buf.readInt32LE(40);
    const field_44 = buf.readInt16LE(44);
    const field_48 = buf.readInt16LE(48);

    return {
      record_num: index,
      usage_date: usageDate,
      flags,
      field_40,
      field_44,
      field_48,
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
