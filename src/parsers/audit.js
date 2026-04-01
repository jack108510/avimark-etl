import fs from 'fs';
import path from 'path';

/**
 * Audit log parser — different from other V2$ files.
 * Records are variable-ish with text-based audit entries.
 * We scan the entire file for AUD01 patterns (price/treatment changes).
 */
export class AuditParser {
  constructor(dataDir) {
    this.filePath = path.join(dataDir, 'AUDIT.V2$');
  }

  parse(maxRecords = Infinity) {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const stat = fs.statSync(this.filePath);
    const fileSize = stat.size;
    const chunkSize = 200000;
    const records = [];
    let offset = 0;

    const fd = fs.openSync(this.filePath, 'r');

    while (offset < fileSize && records.length < maxRecords) {
      const readSize = Math.min(chunkSize, fileSize - offset);
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, offset);

      const text = buf.toString('ascii').replace(/[\x00-\x1F\x7F-\xFF]/g, '|');

      // Find AUD01 entries (price/treatment changes)
      const aud01Regex = /AUD01\|{1,6}([0-9A-Za-z][^|]{5,150})/g;
      let match;
      while ((match = aud01Regex.exec(text)) !== null && records.length < maxRecords) {
        const entry = match[1];
        const parsed = this.parseAud01Entry(entry);
        if (parsed) {
          records.push(parsed);
        }
      }

      // Find AUD02 entries (service/charge entries)
      const aud02Regex = /AUD02\|{1,6}([0-9>A-Za-z][^|]{5,150})/g;
      while ((match = aud02Regex.exec(text)) !== null && records.length < maxRecords) {
        const entry = match[1];
        const parsed = this.parseAud02Entry(entry);
        if (parsed) {
          records.push(parsed);
        }
      }

      offset += chunkSize - 200; // overlap to avoid split records
    }

    fs.closeSync(fd);
    console.log(`[AUDIT.V2$] Parsed ${records.length} audit entries from ${fileSize} bytes`);
    return records;
  }

  parseAud01Entry(entry) {
    // Pattern: "Item/Treatment: CODE, MM-DD-YY, Old: X.XX, New: Y.YY"
    const treatMatch = entry.match(
      /Item\/Treatment:\s*([A-Za-z0-9 ]+),\s*([\d/-]+),\s*Old:\s*([-\d.]+),\s*New:\s*([-\d.]+)/
    );
    if (treatMatch) {
      return {
        audit_type: 'AUD01',
        category: 'price_change',
        item_code: treatMatch[1].trim(),
        date_text: treatMatch[2].trim(),
        old_value: parseFloat(treatMatch[3]),
        new_value: parseFloat(treatMatch[4]),
        description: entry.trim(),
      };
    }

    // Pattern: "Date: MM-DD-YY, description, Old: X.XX, New: Y.YY"
    const dateMatch = entry.match(
      /Date:\s*([\d/-]+),\s*(.+?),\s*Old:\s*([-\d.]+),\s*New:\s*([-\d.]+)/
    );
    if (dateMatch) {
      return {
        audit_type: 'AUD01',
        category: 'adjustment',
        item_code: '',
        date_text: dateMatch[1].trim(),
        old_value: parseFloat(dateMatch[3]),
        new_value: parseFloat(dateMatch[4]),
        description: entry.trim(),
      };
    }

    return null;
  }

  parseAud02Entry(entry) {
    // Pattern: "MM-DD-YY,Amount:X.XX,Code:CODE,Description"
    // or "DD/MM/YYYY,Amount:X.XX,Code:CODE,Description"
    const chargeMatch = entry.match(
      /[>]?([\d/-]+),Amount:([-\d.]+),Code:([A-Za-z0-9$]+),(.+)/
    );
    if (chargeMatch) {
      return {
        audit_type: 'AUD02',
        category: 'charge',
        item_code: chargeMatch[3].trim(),
        date_text: chargeMatch[1].trim(),
        old_value: 0,
        new_value: parseFloat(chargeMatch[2]),
        description: chargeMatch[4].trim(),
      };
    }

    return null;
  }
}
