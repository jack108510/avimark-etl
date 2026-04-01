import { V2Parser } from './base.js';

export class ClientParser extends V2Parser {
  constructor(dataDir) {
    super('CLIENT.V2$', 512, dataDir);
  }

  parseRecord(buf, index) {
    const lastName = this.extractString(buf, 51, 25);
    const address = this.extractString(buf, 77, 50);
    const city = this.extractString(buf, 129, 20);
    const province = this.extractString(buf, 150, 2);
    const postalCode = this.extractString(buf, 153, 10);
    const phone = this.extractString(buf, 164, 12);
    const firstName = this.extractString(buf, 177, 25);
    const phone2 = this.extractString(buf, 202, 12);

    // Skip empty records
    if (!lastName && !firstName) return null;

    return {
      record_num: index,
      first_name: firstName,
      last_name: lastName,
      address,
      city,
      province,
      postal_code: postalCode,
      phone: this.normalizePhone(phone),
      phone2: this.normalizePhone(phone2),
    };
  }

  normalizePhone(phone) {
    if (!phone) return '';
    // Clean up phone format: "780.779-7350" -> "780-779-7350"
    return phone.replace(/\./g, '-');
  }
}
