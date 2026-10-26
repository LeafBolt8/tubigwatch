import { describe, expect, test } from 'vitest';

import { canonicalCityName } from '@/lib/utils/city-name';
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

  test('returns null for a slug no known city matches', () => {
    expect(canonicalCityName('atlantis')).toBeNull();
  });
});
