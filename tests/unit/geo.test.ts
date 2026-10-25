import { describe, expect, it } from 'vitest';

import { getCityCoords, getClosestCity } from '@/lib/utils/geo';

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

describe('getCityCoords', () => {
  it('returns coordinates for an exact city label', () => {
    expect(getCityCoords('Quezon City')).toEqual([14.676, 121.0437]);
  });

  it('matches the PSA boundary spelling of a city', () => {
    expect(getCityCoords('CITY OF LAS PIÑAS')).toEqual([14.4498, 120.983]);
  });

  it('ignores a province suffix the advisories usually omit', () => {
    expect(getCityCoords('Antipolo, Rizal')).toEqual([14.5888, 121.1768]);
  });

  it('returns undefined for a city it has no coordinates for', () => {
    expect(getCityCoords('Atlantis')).toBeUndefined();
  });
});
