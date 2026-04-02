import { V2Parser } from './base.js';

/**
 * APPOINT.V2$ — Appointments (449 bytes/record, ~106K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (appointment date/time)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @45:     status byte
 *   @55:     doctor initials (2 chars)
 */
export class AppointmentParser extends V2Parser {
  constructor(dataDir) {
    super('APPOINT.V2$', 449, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const apptDate = this.extractDelphiDate(buf, 21);
    if (!apptDate) return null;

    const flags = buf.readUInt16LE(28);

    // Doctor initials at @55 (Pascal string at @54?)
    const docLen = Math.min(buf[54] || 0, 10);
    const doctor = docLen > 0
      ? this.cleanString(buf, 55, docLen)
      : '';

    // Look for description/reason
    const reasonLen = Math.min(buf[44] || 0, 30);
    const reason = reasonLen > 0
      ? this.cleanString(buf, 45, reasonLen)
      : '';

    // Animal/client refs
    const field_40 = buf[40];

    return {
      record_num: index,
      appt_date: apptDate,
      flags,
      doctor,
      reason,
      field_40,
    };
  }

  cleanString(buf, offset, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
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
