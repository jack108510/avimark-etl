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

    return {
      record_num: index,
      service_type: type,
      code,
      description: name,
      amount,
      quantity: quantity / 100, // stored as qty * 100
    };
  }
}
