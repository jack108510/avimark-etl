import { V2Parser } from './base.js';

export class ItemParser extends V2Parser {
  constructor(dataDir) {
    super('ITEM.V2$', 549, dataDir);
  }

  parseRecord(buf, index) {
    // Code at offset 41, 6 chars
    const code = this.extractString(buf, 41, 8);
    if (!code) return null;

    // Name: length at 51, text at 52
    const nameLen = Math.min(buf[51] || 0, 50);
    const name = nameLen > 0
      ? buf.toString('ascii', 52, 52 + nameLen).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim()
      : '';

    // Dosage form around 124
    const dosageForm = this.extractString(buf, 120, 20);

    if (!name) return null;

    return {
      record_num: index,
      code: code.trim(),
      name,
      dosage_form: dosageForm,
    };
  }
}
