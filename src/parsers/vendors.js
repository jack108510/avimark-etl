import { V2Parser } from './base.js';

/**
 * VENDOR.V2$ — Vendor records (377 bytes/record, ~391 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     Pascal string: vendor code (length at @40, text at @41, e.g., "V0001")
 *   @49:     type marker ('D' = 0x44)
 *   @50:     Pascal string: vendor name (length at @50, text at @51, e.g., "Pfizer")
 *   @262:    Pascal string: account number / reference
 */
export class VendorParser extends V2Parser {
  constructor(dataDir) {
    super('VENDOR.V2$', 377, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const vendorDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @40
    const codeLen = Math.min(buf[40] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[41 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Name — Pascal string at @50
    const nameLen = Math.min(buf[50] || 0, 50);
    let name = '';
    if (nameLen > 0) {
      for (let i = 0; i < nameLen; i++) {
        const c = buf[51 + i];
        if (c >= 32 && c <= 126) name += String.fromCharCode(c);
      }
    }

    // Account/reference at @262
    const acctLen = Math.min(buf[261] || 0, 30);
    let accountRef = '';
    if (acctLen > 0 && acctLen < 30) {
      for (let i = 0; i < acctLen; i++) {
        const c = buf[262 + i];
        if (c >= 32 && c <= 126) accountRef += String.fromCharCode(c);
      }
    }

    if (!code && !name) return null;

    return {
      record_num: index,
      vendor_date: vendorDate,
      code: code.trim(),
      name: name.trim(),
      account_ref: accountRef.trim(),
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
