import { V2Parser } from './base.js';

/**
 * ACCOUNT.V2$ — Financial account entries (256 bytes/record, ~527K records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum  
 *   @21-28:  TDateTime double (transaction date)
 *   @28:     flags (0x40=64 common)
 *   @49:     type marker ('A')
 *   @57:     Pascal string length for description
 *   @58+:    description text
 *   @98:     cost (int32, cents)
 *   @110:    entry type byte ('S'=service, 'T'=tax, etc.)
 *   @114:    quantity (int16, hundredths)
 *   @118:    amount (int32, cents)
 *   @122:    flags/ref
 */
export class AccountParser extends V2Parser {
  constructor(dataDir) {
    super('ACCOUNT.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const txnDate = this.extractDelphiDate(buf, 21);

    // Pascal-style description at @57
    const descLen = Math.min(buf[57] || 0, 50);
    let description = '';
    if (descLen > 0) {
      for (let i = 0; i < descLen; i++) {
        const c = buf[58 + i];
        if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      }
      description = description.trim();
    }

    if (!description && !txnDate) return null;

    const entryType = buf[110];
    const entryTypeChar = (entryType >= 32 && entryType <= 126) ? String.fromCharCode(entryType) : '';
    const costCents = buf.readInt32LE(98);
    const quantity = buf.readInt16LE(114);
    const amountCents = buf.readInt32LE(118);

    return {
      record_num: index,
      txn_date: txnDate,
      type_flag: entryType || null,
      description,
      amount_raw: amountCents,
      field_122: costCents,
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
