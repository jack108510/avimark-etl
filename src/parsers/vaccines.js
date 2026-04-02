import { V2Parser } from './base.js';

/**
 * VACCINE.V2$ — Vaccine records (152 bytes/record, ~32K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (vaccination date)
 *   @28:     flags
 *   @40:     Pascal string: serial/lot number (length byte + text)
 *   @49:     type marker ('A'=active, 'D'=deleted?)
 *   @54:     Pascal string: doctor initials (length byte, then chars)
 *   @57:     Pascal string: manufacturer (length byte, then chars)
 */
export class VaccineParser extends V2Parser {
  constructor(dataDir) {
    super('VACCINE.V2$', 152, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const vaccDate = this.extractDelphiDate(buf, 21);

    // Serial/lot number — Pascal string at @40
    const serialLen = Math.min(buf[40] || 0, 12);
    let serial = '';
    if (serialLen > 0 && serialLen <= 12) {
      for (let i = 0; i < serialLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) serial += String.fromCharCode(c);
      }
    }

    // Doctor initials — Pascal string at @54
    const docLen = Math.min(buf[54] || 0, 6);
    let doctor = '';
    if (docLen > 0 && docLen <= 6) {
      for (let i = 0; i < docLen; i++) {
        const c = buf[55 + i];
        if (c >= 32 && c <= 126) doctor += String.fromCharCode(c);
      }
    }

    // Manufacturer — Pascal string at @57
    const mfgLen = Math.min(buf[57] || 0, 20);
    let manufacturer = '';
    if (mfgLen > 0 && mfgLen <= 20) {
      for (let i = 0; i < mfgLen; i++) {
        const c = buf[58 + i];
        if (c >= 32 && c <= 126) manufacturer += String.fromCharCode(c);
      }
    }

    if (!vaccDate && !serial) return null;

    return {
      record_num: index,
      vaccine_date: vaccDate,
      serial_number: serial.trim(),
      doctor: doctor.trim(),
      manufacturer: manufacturer.trim(),
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
