import { V2Parser } from './base.js';

export class TreatmentParser extends V2Parser {
  constructor(dataDir) {
    super('TREAT.V2$', 1024, dataDir);
  }

  parseRecord(buf, index) {
    // Code at offset 41, ~8 chars
    const code = this.extractString(buf, 41, 8);
    if (!code) return null;

    // Type flag at offset 49 (A=Active, D=Deleted?)
    const typeFlag = this.extractString(buf, 49, 1);

    // Name at offset 52, ~60 chars
    const name = this.extractString(buf, 52, 70);

    if (!name || name.length < 2) return null;

    return {
      record_num: index,
      code: code.trim(),
      name: name.trim(),
      type_flag: typeFlag,
    };
  }
}
