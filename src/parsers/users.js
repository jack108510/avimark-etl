import { V2Parser } from './base.js';

export class UserParser extends V2Parser {
  constructor(dataDir) {
    super('USER.V2$', 6110, dataDir);
  }

  parseRecord(buf, index) {
    const typeFlag = this.extractString(buf, 40, 1); // D=Doctor, A=Admin/Other
    const code = this.extractString(buf, 42, 4);
    const firstName = this.extractString(buf, 46, 30);

    if (!code && !firstName) return null;

    // DVM number is a 4-digit string around offset 87
    const dvmNumber = this.extractString(buf, 87, 4);
    const dvmClean = /^\d{4}$/.test(dvmNumber) ? dvmNumber : '';

    // Title/display name around offset 103
    const displayName = this.extractString(buf, 103, 60);

    // Last name / title appears around offset 166
    const lastNameArea = this.extractString(buf, 166, 40);
    const lastName = this.cleanLastName(lastNameArea);

    // Check for DVM in the last name area
    const isDvm = lastNameArea.includes('DVM') || typeFlag === 'D';

    return {
      record_num: index,
      code: code.trim(),
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      type: typeFlag === 'D' ? 'Doctor' : 'Staff',
      is_dvm: isDvm,
      dvm_number: dvmClean,
    };
  }

  cleanLastName(raw) {
    // Extract the meaningful name from the padded field
    // Examples: "CATARIG, DVM", "Belland", "BARBAZA, DVM"
    const cleaned = raw.replace(/[^A-Za-z, '-]/g, ' ').trim();
    // Take first meaningful segment
    const parts = cleaned.split(/\s{2,}/);
    return parts[0] || '';
  }
}
