import { describe, expect, it } from 'vitest';

import { normalizeOutages } from '@/lib/cache/outages';
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
});
