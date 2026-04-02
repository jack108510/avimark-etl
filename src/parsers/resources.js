import { V2Parser } from './base.js';

/**
 * RESOURCE.V2$ — Security resource definitions (160 bytes/record, 131 records)
 * 
 * Structure:
 *   @0:      status byte
 *   @1-20:   hash/checksum
 *   @21-28:  TDateTime double (date)
 *   @28:     flags
 *   @40:     type marker ('A')
 *   @41:     Pascal string: resource code+description
 *            Format: code (5 chars) + '*' + description
 */
export class ResourceParser extends V2Parser {
  constructor(dataDir) {
    super('RESOURCE.V2$', 160, dataDir);
  }

  parseRecord(buf, index) {
    if (buf[0] === 0xFF) return null;

    const resDate = this.extractDelphiDate(buf, 21);

    // Code — Pascal string at @41 (5 chars)
    const codeLen = Math.min(buf[41] || 0, 8);
    let code = '';
    if (codeLen > 0) {
      for (let i = 0; i < codeLen; i++) {
        const c = buf[42 + i];
        if (c >= 32 && c <= 126) code += String.fromCharCode(c);
      }
    }

    // Description starts after code. Scan from @47 for text  
    let description = '';
    // It's at a fixed offset after the code + separator
    const descStart = 42 + codeLen + 1; // +1 for '*' separator
    for (let i = descStart; i < Math.min(descStart + 80, 160); i++) {
      const c = buf[i];
      if (c >= 32 && c <= 126) description += String.fromCharCode(c);
      else if (description.length > 0) break;
    }

    if (!code) return null;

    return {
      record_num: index,
      name: code.trim(),
      description: description.trim(),
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
