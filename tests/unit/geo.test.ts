import { describe, expect, it } from 'vitest';

import { getClosestCity } from '@/lib/utils/geo';

describe('getClosestCity', () => {
  it('returns the city sitting at the given coordinates', () => {
    expect(getClosestCity(14.676, 121.0437)).toBe('Quezon City');
  });

  it('picks Muntinlupa for a point near Alabang', () => {
    expect(getClosestCity(14.4185, 121.0407)).toBe('Muntinlupa');
  });

  it('still returns the nearest entry for coordinates outside Metro Manila', () => {
    expect(getClosestCity(0, 0)).not.toBeNull();
  });
});
