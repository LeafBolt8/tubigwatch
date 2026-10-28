import { describe, expect, test } from 'vitest';

import {
  canonicalCityName,
  citySlug,
  isProvinceOnly,
  splitCityLabels,
} from '@/lib/utils/city-name';
import { deslugify, slugify } from '@/lib/utils/slugify';

describe('slugify', () => {
  test('lowercases and hyphenates multi-word city names', () => {
    expect(slugify('Quezon City')).toBe('quezon-city');
  });

  test('strips diacritics so the slug stays URL-safe', () => {
    expect(slugify('Las Piñas')).toBe('las-pinas');
    expect(slugify('Parañaque')).toBe('paranaque');
  });

  test('collapses punctuation and trims separators', () => {
    expect(slugify('  San Juan! ')).toBe('san-juan');
    expect(slugify('Sto. Niño')).toBe('sto-nino');
  });
});

describe('deslugify', () => {
  test('turns a slug back into a readable label', () => {
    expect(deslugify('quezon-city')).toBe('Quezon City');
    expect(deslugify('las-pinas')).toBe('Las Pinas');
  });
});

describe('canonicalCityName', () => {
  test('restores diacritics that the slug dropped', () => {
    expect(canonicalCityName('las-pinas')).toBe('Las Piñas');
    expect(canonicalCityName('paranaque')).toBe('Parañaque');
  });

  test('accepts a city-only slug when the label carries its province', () => {
    expect(canonicalCityName('binangonan', ['Binangonan, Rizal'])).toBe('Binangonan, Rizal');
  });

  test('returns null for a slug no known city matches', () => {
    expect(canonicalCityName('atlantis')).toBeNull();
  });
});

describe('splitCityLabels', () => {
  test('keeps a province inside one city label', () => {
    expect(splitCityLabels('Binangonan, Rizal')).toEqual(['Binangonan, Rizal']);
  });

  test('splits a row that names several cities', () => {
    expect(splitCityLabels('Quezon City; Caloocan City')).toEqual([
      'Quezon City',
      'Caloocan City',
    ]);
  });

  test('splits an ampersand compound', () => {
    expect(splitCityLabels('Pasig & Taguig City')).toEqual(['Pasig', 'Taguig City']);
  });

  test('splits a conjunction compound only when both sides are cities', () => {
    expect(splitCityLabels('Antipolo and Cainta, Rizal')).toEqual(['Antipolo', 'Cainta, Rizal']);
  });

  test('leaves prose containing "and" intact', () => {
    expect(splitCityLabels('Portions of Brgy. X and Y')).toEqual(['Portions of Brgy. X and Y']);
  });

  test('passes a province-only label through for the consumer to drop', () => {
    expect(splitCityLabels('Rizal')).toEqual(['Rizal']);
  });

  test('drops blank and placeholder labels', () => {
    expect(splitCityLabels('')).toEqual([]);
    expect(splitCityLabels('   ')).toEqual([]);
    expect(splitCityLabels('N/A')).toEqual([]);
    expect(splitCityLabels('Unknown')).toEqual([]);
  });

  test('dedupes case-insensitively and preserves order', () => {
    expect(splitCityLabels('Pasig; pasig; Taguig')).toEqual(['Pasig', 'Taguig']);
  });
});

describe('citySlug', () => {
  test('drops the comma province', () => {
    expect(citySlug('Antipolo, Rizal')).toBe('antipolo');
    expect(citySlug('Cainta, Rizal')).toBe('cainta');
    expect(citySlug('Binangonan, Rizal')).toBe('binangonan');
  });

  test('keeps a bare city label as-is', () => {
    expect(citySlug('Antipolo')).toBe('antipolo');
  });

  test('keeps the trailing "City" so Quezon City is not confused with the province', () => {
    expect(citySlug('Quezon City')).toBe('quezon-city');
    expect(citySlug('Quezon')).toBe('quezon');
  });

  test('strips diacritics', () => {
    expect(citySlug('Las Piñas')).toBe('las-pinas');
  });
});

describe('isProvinceOnly', () => {
  test('recognises the six provinces that appear as a bare label', () => {
    for (const province of ['Rizal', 'Cavite', 'Laguna', 'Bulacan', 'Batangas', 'Pampanga']) {
      expect(isProvinceOnly(province)).toBe(true);
      expect(isProvinceOnly(`  ${province.toUpperCase()} `)).toBe(true);
    }
  });

  test('does not treat a city, a region, or a city-with-province label as a province', () => {
    expect(isProvinceOnly('Antipolo')).toBe(false);
    expect(isProvinceOnly('Antipolo, Rizal')).toBe(false);
    expect(isProvinceOnly('Metro Manila')).toBe(false);
  });
});
