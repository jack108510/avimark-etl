import { V2Parser } from './base.js';

export class ServiceParser extends V2Parser {
  constructor(dataDir) {
    super('SERVICE.V2$', 256, dataDir);
  }

  parseRecord(buf, index) {
    const type = this.extractString(buf, 42, 2); // AS, AI, etc.

    // Pascal-style length-prefixed strings
    const nameLen = Math.min(buf[53] || 0, 50);
    const name = nameLen > 0
      ? buf.toString('ascii', 54, 54 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
      : '';

    const codeLen = Math.min(buf[103] || 0, 12);
    const code = codeLen > 0
      ? buf.toString('ascii', 104, 104 + codeLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
      : '';

    if (!code) return null;

    const amountCents = buf.readInt32LE(112);
    const amount = amountCents / 100;
    const quantity = buf.readInt32LE(116);

    // TDateTime at offset 21 = service date
    let service_date = null;
    try {
      const v = buf.readDoubleLE(21);
      if (v > 35000 && v < 47000) {
        const epoch = new Date(1899, 11, 30).getTime();
        const d = new Date(epoch + v * 86400000);
        if (!isNaN(d.getTime())) {
          service_date = d.toISOString().replace('T', ' ').substring(0, 19);
        }
      }
    } catch(e) {}

    return {
      record_num: index,
      service_type: type,
      code,
      description: name,
      amount,
      quantity: quantity / 100, // stored as qty * 100
      service_date,
    };
  }
}
