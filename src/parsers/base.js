import fs from 'fs';
import path from 'path';

/**
 * Base parser for Avimark V2$ binary flat files.
 * Opens files with shared read access (server keeps them locked).
 */
export class V2Parser {
  constructor(filename, recordSize, dataDir) {
    this.filename = filename;
    this.recordSize = recordSize;
    this.filePath = path.join(dataDir, filename);
  }

  /**
   * Read the raw binary file into a Buffer.
   * Uses fs.openSync which defaults to FILE_SHARE_READ on Windows.
   */
  readFile(maxRecords = Infinity) {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const stat = fs.statSync(this.filePath);
    const totalRecords = Math.floor(stat.size / this.recordSize);
    const recordsToRead = Math.min(totalRecords, maxRecords);
    const bytesToRead = recordsToRead * this.recordSize;

    const fd = fs.openSync(this.filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, 0);
    fs.closeSync(fd);

    return { buffer, totalRecords, recordsRead: recordsToRead };
  }

  /**
   * Extract a trimmed ASCII string from a buffer at given offset/length.
   * Strips null bytes, non-printable chars, and trims whitespace.
   */
  extractString(buffer, offset, length) {
    if (offset + length > buffer.length) return '';
    const raw = buffer.subarray(offset, offset + length);
    let str = '';
    for (let i = 0; i < raw.length; i++) {
      const b = raw[i];
      if (b >= 32 && b <= 126) {
        str += String.fromCharCode(b);
      }
    }
    return str.trim();
  }

  /**
   * Extract a Delphi currency value (int64 / 10000).
   */
  extractCurrency(buffer, offset) {
    if (offset + 8 > buffer.length) return 0;
    const lo = buffer.readUInt32LE(offset);
    const hi = buffer.readInt32LE(offset + 4);
    const raw = hi * 0x100000000 + lo;
    return Math.round(raw / 100) / 100; // Delphi currency = int64/10000
  }

  /**
   * Extract an IEEE 754 double.
   */
  extractDouble(buffer, offset) {
    if (offset + 8 > buffer.length) return 0;
    return buffer.readDoubleLE(offset);
  }

  /**
   * Parse all records. Override parseRecord() in subclasses.
   */
  parse(maxRecords = Infinity) {
    const { buffer, totalRecords, recordsRead } = this.readFile(maxRecords);
    const records = [];

    for (let i = 0; i < recordsRead; i++) {
      const offset = i * this.recordSize;
      const recBuf = buffer.subarray(offset, offset + this.recordSize);
      try {
        const record = this.parseRecord(recBuf, i);
        if (record && !this.isEmpty(record)) {
          records.push(record);
        }
      } catch (err) {
        console.error(`Error parsing record ${i} in ${this.filename}: ${err.message}`);
      }
    }

    console.log(`[${this.filename}] Parsed ${records.length} valid records of ${totalRecords} total`);
    return records;
  }

  /**
   * Override in subclass to parse a single record buffer.
   */
  parseRecord(buffer, index) {
    throw new Error('parseRecord() must be implemented by subclass');
  }

  /**
   * Check if a parsed record is empty (all fields blank).
   */
  isEmpty(record) {
    return Object.values(record).every(v =>
      v === '' || v === 0 || v === null || v === undefined
    );
  }
}
