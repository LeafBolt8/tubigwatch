import { describe, expect, it } from 'vitest';

import type { Barangay } from '@/lib/schemas/barangay';
import type { Outage } from '@/lib/schemas/outage';
import { buildCityDirectory } from '@/lib/utils/city-directory';
import { normalizeOutages } from '@/lib/utils/normalize-outages';

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

  it('keeps every city in a semicolon-separated fallback', () => {
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

    expect(normalizeOutages(input)[0]?.city).toBe('Las Piñas & Muntinlupa & Parañaque');
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

  it('unifies "Pasig City" with "Pasig"', () => {
    const input: Outage[] = [
      {
        id: 'test-pasig',
        concessionaire: 'manila-water',
        status: 'active',
        reason: 'Supply Augmentation',
        startsAt: new Date('2026-10-15T06:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
        affectedAreas: [
          {
            barangays: [{ name: 'Barangay Not In Map', city: 'Pasig City', province: 'Metro Manila' }],
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

  it('keeps every city in an ampersand-separated city string', () => {
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

    expect(normalizeOutages(input)[0]?.city).toBe('Pasig & Taguig City');
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

describe('compound city labels', () => {
  const NOW = new Date('2026-10-15T12:00:00Z');

  // A barangay the dictionary does not know, so the row's own city label is what decides buckets.
  const UNKNOWN_BARANGAY = 'Sample Unknown Barangay';

  function makeRow(
    id: string,
    barangays: Array<{ name: string; city: string; province?: Barangay['province'] }>,
  ): Outage {
    return {
      id,
      concessionaire: 'manila-water',
      status: 'active',
      reason: 'Water Service Interruption',
      startsAt: new Date('2026-10-15T06:00:00Z'),
      endsAt: new Date('2026-10-15T18:00:00Z'),
      affectedAreas: [
        {
          barangays: barangays.map((b) => ({
            name: b.name,
            city: b.city,
            province: b.province ?? 'Metro Manila',
          })),
          streets: [],
          notes: '',
        },
      ],
      source: { url: 'https://example.com/advisories', fetchedAt: NOW },
      confidence: 'official' as const,
    };
  }

  function cityFor(label: string): string | undefined {
    const normalized = normalizeOutages([
      makeRow('one-city', [{ name: UNKNOWN_BARANGAY, city: label }]),
    ]);
    return normalized[0]?.city;
  }

  it('drops a redundant "City" suffix', () => {
    expect(cityFor('Navotas City')).toBe('Navotas');
  });

  it('normalizes each part of an ampersand compound', () => {
    expect(cityFor('Navotas City & Malabon')).toBe('Navotas & Malabon');
  });

  it('preserves a compound label whose parts match no rule', () => {
    expect(cityFor('Pasig & Taguig City')).toBe('Pasig & Taguig City');
  });

  it('rejoins a semicolon compound in the ampersand form', () => {
    expect(cityFor('Las Pinas City; Paranaque City')).toBe('Las Piñas & Parañaque');
  });

  it('leaves a single city label unchanged', () => {
    expect(cityFor('Pasig')).toBe('Pasig');
  });

  it('passes a province label through unchanged', () => {
    expect(cityFor('Rizal')).toBe('Rizal');
  });

  it('returns Unknown when the city is empty or missing', () => {
    const missing = normalizeOutages([
      makeRow('no-city', [
        { name: UNKNOWN_BARANGAY, city: undefined as unknown as string },
      ]),
    ]);

    expect(cityFor('')).toBe('Unknown');
    expect(missing[0]?.city).toBe('Unknown');
  });

  it('trusts a single-city label for an ambiguous barangay', () => {
    // "San Antonio" exists in Parañaque but also in Quezon City and Pasig, so the row wins.
    const normalized = normalizeOutages([
      makeRow('ambiguous-one', [{ name: 'San Antonio', city: 'Pasig' }]),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.city).toBe('Pasig');
  });

  it('uses a single-city label that is itself the ambiguous barangay name', () => {
    const normalized = normalizeOutages([
      makeRow('ambiguous-name', [{ name: 'San Antonio', city: 'San Antonio' }]),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.city).toBe('San Antonio');
  });

  it('treats an ampersand label as multi-city for an ambiguous barangay', () => {
    const normalized = normalizeOutages([
      makeRow('ambiguous-amp', [{ name: 'San Antonio', city: 'Pasig & Taguig City' }]),
    ]);

    expect(normalized).toHaveLength(1);
    // Multi-city rows fall back to the dictionary, which places San Antonio in Parañaque.
    expect(normalized[0]?.city).toBe('Parañaque');
  });

  it('treats a semicolon label as multi-city for an ambiguous barangay', () => {
    const normalized = normalizeOutages([
      makeRow('ambiguous-semi', [{ name: 'San Antonio', city: 'Pasig; Taguig City' }]),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.city).toBe('Parañaque');
  });

  it('preserves a compound label for a barangay the dictionary does not know', () => {
    const normalized = normalizeOutages([
      makeRow('test-compound-1', [
        { name: 'SomeUnknownBrgy', city: 'Pasig & Taguig City' },
      ]),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.city).toBe('Pasig & Taguig City');
    expect(normalized[0]?.id.startsWith('test-compound-1-')).toBe(true);
  });

  it('still lets the dictionary resolve a known barangay on a compound row', () => {
    const normalized = normalizeOutages([
      makeRow('test-compound-2', [{ name: 'Ususan', city: 'Pasig & Taguig City' }]),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.city).toBe('Taguig');
  });

  it('splits a preserved compound label into one directory entry per city', () => {
    const normalized = normalizeOutages([
      makeRow('test-compound-1', [
        { name: 'SomeUnknownBrgy', city: 'Pasig & Taguig City' },
      ]),
    ]);

    const directory = buildCityDirectory(normalized, NOW);
    const byCity = new Map(directory.map((entry) => [entry.city, entry]));

    expect(directory).toHaveLength(2);
    expect([...byCity.keys()].sort()).toEqual(['Pasig', 'Taguig City']);
    expect(byCity.get('Pasig')?.activeCount).toBe(1);
    expect(byCity.get('Taguig City')?.activeCount).toBe(1);
    expect(byCity.has('Pasig & Taguig City')).toBe(false);
  });
});
