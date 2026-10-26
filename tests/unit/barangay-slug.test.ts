import { describe, expect, test } from 'vitest';

import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { barangaySlug, findBarangayBySlug, listBarangayLocations } from '@/lib/utils/barangay-slug';

describe('barangaySlug', () => {
  test('includes the city so duplicate barangay names stay distinct', () => {
    expect(barangaySlug('Poblacion', 'Makati')).toBe('poblacion-makati');
    expect(barangaySlug('Poblacion', 'Pasig')).not.toBe(barangaySlug('Poblacion', 'Makati'));
  });

  test('keeps the barangay number readable', () => {
    expect(barangaySlug('Barangay 176', 'Caloocan')).toBe('barangay-176-caloocan');
  });
});

describe('findBarangayBySlug', () => {
  test('resolves a fixture barangay and its city', () => {
    expect(findBarangayBySlug('kalusugan-quezon-city', outageFixtures)).toEqual({
      name: 'Kalusugan',
      city: 'Quezon City',
      slug: 'kalusugan-quezon-city',
    });
  });

  test('returns null for an unknown slug', () => {
    expect(findBarangayBySlug('not-a-barangay', outageFixtures)).toBeNull();
  });

  test('lists each barangay-city pair once', () => {
    const locations = listBarangayLocations(outageFixtures);
    const slugs = locations.map((location) => location.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('poblacion-makati');
    expect(slugs.filter((slug) => slug === 'poblacion-makati')).toHaveLength(1);
  });
});
