import { V2Parser } from './base.js';

export class AnimalParser extends V2Parser {
  constructor(dataDir) {
    super('ANIMAL.V2$', 392, dataDir);
  }

  parseRecord(buf, index) {
    const name = this.extractString(buf, 41, 20);
    if (!name) return null;

    // Species field contains "Feline", "Canine" etc. around offset 115
    const speciesRaw = this.extractString(buf, 100, 30);
    const species = this.extractSpecies(speciesRaw);
    const breed = this.extractBreed(speciesRaw);
    const color = this.extractString(buf, 166, 16);
    const weightStr = this.extractString(buf, 148, 12);
    const weight = parseFloat(weightStr) || 0;

    return {
      record_num: index,
      name,
      species,
      breed,
      color,
      weight,
    };
  }

  extractSpecies(raw) {
    if (raw.includes('Feline')) return 'Feline';
    if (raw.includes('Canine')) return 'Canine';
    if (raw.includes('Avian')) return 'Avian';
    if (raw.includes('Reptile')) return 'Reptile';
    if (raw.includes('Equine')) return 'Equine';
    if (raw.includes('Rabbit')) return 'Rabbit';
    if (raw.includes('Rodent')) return 'Rodent';
    if (raw.includes('Pocket')) return 'Pocket Pet';
    return raw.substring(0, 20).trim();
  }

  extractBreed(raw) {
    // Breed comes before the species keyword
    // e.g., "DSH......Feline" -> breed = "DSH"
    const speciesKeywords = ['Feline', 'Canine', 'Avian', 'Reptile', 'Equine', 'Rabbit', 'Rodent'];
    for (const kw of speciesKeywords) {
      const idx = raw.indexOf(kw);
      if (idx > 0) {
        return raw.substring(0, idx).trim();
      }
    }
    return '';
  }
}
