import { describe, expect, it } from 'vitest';

import { normalizeOutages } from '@/lib/utils/normalize-outages';
import type { Outage } from '@/lib/schemas/outage';

describe('normalizeOutages', () => {
  it('corrects a misplaced city for Brgy. BF Homes', () => {
    const input: Outage[] = [
      {
        id: 'test-1',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [{ name: 'Brgy. BF Homes', city: 'Pasay City', province: 'Metro Manila' }],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const normalized = normalizeOutages(input);
    const barangayCity = normalized[0]?.affectedAreas[0]?.barangays[0]?.city;

    expect(barangayCity).toBe('Parañaque');
  });

  it('splits semicolon-separated barangay names into separate barangays', () => {
    const input: Outage[] = [
      {
        id: 'test-2',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Almanza Uno; Brgy. Sucat; Brgys. BF Homes', city: 'Muntinlupa', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const names = normalizeOutages(input).flatMap((outage) =>
      outage.affectedAreas.flatMap((area) => area.barangays.map((b) => b.name)),
    );

    expect(names).toEqual(['Almanza Uno', 'Brgy. Sucat', 'Brgys. BF Homes']);
  });

  it('maps the Sto. Niño abbreviation to Parañaque', () => {
    const input: Outage[] = [
      {
        id: 'test-3',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [{ name: 'Sto. Niño', city: 'Unknown', province: 'Metro Manila' }],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const normalized = normalizeOutages(input);
    const barangayCity = normalized[0]?.affectedAreas[0]?.barangays[0]?.city;

    expect(barangayCity).toBe('Parañaque');
  });

  it('strips the Brgy. prefix per segment so inner names still hit the city map', () => {
    const input: Outage[] = [
      {
        id: 'test-4',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Almanza Uno; Brgy. Sucat; Brgys. BF Homes', city: 'Las Piñas', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const cityByName = new Map<string, string>();
    for (const outage of normalizeOutages(input)) {
      for (const area of outage.affectedAreas) {
        for (const b of area.barangays) {
          cityByName.set(b.name, b.city);
        }
      }
    }

    expect(cityByName.get('Brgy. Sucat')).toBe('Muntinlupa');
    expect(cityByName.get('Brgys. BF Homes')).toBe('Parañaque');
  });

  it('unifies an unaccented "Las Pinas" fallback city', () => {
    const input: Outage[] = [
      {
        id: 'test-5',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [{ name: 'Barangay Not In Map', city: 'Las Pinas', province: 'Metro Manila' }],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    expect(normalizeOutages(input)[0]?.city).toBe('Las Piñas');
  });

  it('unifies a semicolon-separated city fallback to its first city', () => {
    const input: Outage[] = [
      {
        id: 'test-6',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              {
                name: 'Barangay Not In Map',
                city: 'Las Pinas City; Muntinlupa City; Paranaque City',
                province: 'Metro Manila',
              },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    expect(normalizeOutages(input)[0]?.city).toBe('Las Piñas');
  });

  it('keeps an ambiguous barangay in the row city when the row names one city', () => {
    const input: Outage[] = [
      {
        id: 'test-7',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'San Antonio', city: 'Makati', province: 'Metro Manila' },
              { name: 'San Isidro', city: 'Pasig', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const cityByName = new Map<string, string>();
    for (const outage of normalizeOutages(input)) {
      for (const area of outage.affectedAreas) {
        for (const b of area.barangays) {
          cityByName.set(b.name, b.city);
        }
      }
    }

    expect(cityByName.get('San Antonio')).toBe('Makati');
    expect(cityByName.get('San Isidro')).toBe('Pasig');
  });

  it('trusts the dictionary for an ambiguous barangay in a multi-city row', () => {
    const input: Outage[] = [
      {
        id: 'test-7b',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'San Antonio', city: 'Las Pinas City; Paranaque City', province: 'Metro Manila' },
              { name: 'San Isidro', city: 'Las Pinas City; Paranaque City', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const cityByName = new Map<string, string>();
    for (const outage of normalizeOutages(input)) {
      for (const area of outage.affectedAreas) {
        for (const b of area.barangays) {
          cityByName.set(b.name, b.city);
        }
      }
    }

    expect(cityByName.get('San Antonio')).toBe('Parañaque');
    expect(cityByName.get('San Isidro')).toBe('Parañaque');
  });

  it('still resolves punctuated barangay names after aggressive cleaning', () => {
    const input: Outage[] = [
      {
        id: 'test-8',
        concessionaire: 'maynilad',
        status: 'active',
        reason: 'Water Service Interruption',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Bel-Air', city: 'Unknown', province: 'Metro Manila' },
              { name: 'Doña Aurora', city: 'Unknown', province: 'Metro Manila' },
              { name: 'Sto. Niño', city: 'Unknown', province: 'Metro Manila' },
              { name: 'U.P. Campus', city: 'Unknown', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const cityByName = new Map<string, string>();
    for (const outage of normalizeOutages(input)) {
      for (const area of outage.affectedAreas) {
        for (const b of area.barangays) {
          cityByName.set(b.name, b.city);
        }
      }
    }

    expect(cityByName.get('Bel-Air')).toBe('Makati');
    expect(cityByName.get('Doña Aurora')).toBe('Quezon City');
    expect(cityByName.get('Sto. Niño')).toBe('Parañaque');
    expect(cityByName.get('U.P. Campus')).toBe('Quezon City');
  });

  it('splits an ampersand-separated city string on the first city', () => {
    const input: Outage[] = [
      {
        id: 'test-9',
        concessionaire: 'manila-water',
        status: 'active',
        reason: 'Supply Augmentation',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Barangay Not In Map', city: 'Pasig & Taguig City', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    expect(normalizeOutages(input)[0]?.city).toBe('Pasig');
  });

  it('strips a "Portions of" prefix before looking the barangay up', () => {
    const input: Outage[] = [
      {
        id: 'test-10',
        concessionaire: 'manila-water',
        status: 'active',
        reason: 'Leak Repair',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Portions of Brgy. Bel-Air', city: 'Pasay City', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const cityByName = new Map<string, string>();
    for (const outage of normalizeOutages(input)) {
      for (const area of outage.affectedAreas) {
        for (const b of area.barangays) {
          cityByName.set(b.name, b.city);
        }
      }
    }

    expect(cityByName.get('Portions of Brgy. Bel-Air')).toBe('Makati');
  });

  it('dedupes barangay spellings that differ only by punctuation or casing', () => {
    const input: Outage[] = [
      {
        id: 'test-11',
        concessionaire: 'manila-water',
        status: 'active',
        reason: 'Declogging and flushing',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [
              { name: 'Sta. Ana', city: 'Taytay, Rizal', province: 'Rizal' },
              { name: 'Sta Ana', city: 'Taytay, Rizal', province: 'Rizal' },
              { name: 'Pinagbuhatan', city: 'Pasig', province: 'Metro Manila' },
              { name: 'PInagbuhatan', city: 'Pasig', province: 'Metro Manila' },
            ],
            streets: [],
            notes: '',
          },
        ],
        source: {
          url: 'https://example.com/advisories',
          fetchedAt: new Date(),
        },
        confidence: 'official' as const,
      },
    ];

    const byCity = new Map<string, string[]>();
    for (const outage of normalizeOutages(input)) {
      byCity.set(
        outage.city ?? '?',
        outage.affectedAreas.flatMap((area) => area.barangays.map((b) => b.name)),
      );
    }

    expect(byCity.get('Taytay, Rizal')).toEqual(['Sta. Ana']);
    expect(byCity.get('Pasig')).toEqual(['Pinagbuhatan']);
  });
});
