import { describe, expect, test } from 'vitest';

import { deriveProvince } from '@/lib/utils/province';

describe('deriveProvince', () => {
  test('maps Rizal municipalities', () => {
    expect(deriveProvince('Antipolo, Rizal')).toBe('Rizal');
    expect(deriveProvince('Taytay, Rizal')).toBe('Rizal');
    expect(deriveProvince('Rodriguez, Rizal')).toBe('Rizal');
  });

  test('maps Cavite cities, including the ones without "Cavite" in the name', () => {
    expect(deriveProvince('Imus City')).toBe('Cavite');
    expect(deriveProvince('Bacoor')).toBe('Cavite');
    expect(deriveProvince('Kawit')).toBe('Cavite');
    expect(deriveProvince('Noveleta')).toBe('Cavite');
    expect(deriveProvince('Dasmariñas')).toBe('Cavite');
    expect(deriveProvince('Dasmarinas')).toBe('Cavite');
  });

  test('maps Laguna and Bulacan', () => {
    expect(deriveProvince('Calamba')).toBe('Laguna');
    expect(deriveProvince('Meycauayan')).toBe('Bulacan');
  });

  test('defaults to Metro Manila for the capital region and unknown names', () => {
    expect(deriveProvince('Pasig & Taguig City')).toBe('Metro Manila');
    expect(deriveProvince('Quezon City')).toBe('Metro Manila');
    expect(deriveProvince('Unknown')).toBe('Metro Manila');
  });
});
