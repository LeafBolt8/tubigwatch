import { describe, expect, test } from 'vitest';

import { OutageSchema } from '@/lib/schemas/outage';
import { barangayKey, buildBarangayIndex, cityKey } from '@/lib/utils/barangay-geo';

const NOW = new Date('2026-10-25T12:00:00+08:00');

function build(overrides: Record<string, unknown> = {}) {
  return OutageSchema.parse({
    id: 'geo-test',
    concessionaire: 'maynilad',
    status: 'scheduled',
    reason: 'Mainline repair along Quirino Highway.',
    startsAt: '2026-10-25T10:00:00+08:00',
    endsAt: '2026-10-25T18:00:00+08:00',
    affectedAreas: [
      {
        barangays: [{ name: 'Kalusugan', city: 'Quezon City', province: 'Metro Manila' }],
      },
    ],
    source: {
      url: 'https://www.mayniladwater.com.ph/advisories/test',
      fetchedAt: '2026-10-25T09:00:00+08:00',
    },
    confidence: 'official',
    ...overrides,
  });
}

describe('cityKey', () => {
  test('matches the boundary file spelling against the advisory spelling', () => {
    expect(cityKey('CITY OF LAS PIÑAS')).toBe(cityKey('Las Piñas'));
    expect(cityKey('CITY OF PARAÑAQUE')).toBe(cityKey('Parañaque'));
    expect(cityKey('QUEZON CITY')).toBe(cityKey('Quezon City'));
    expect(cityKey('PASAY CITY')).toBe(cityKey('Pasay'));
  });

  test('drops a province suffix so "Rodriguez, Rizal" meets "Rodriguez"', () => {
    expect(cityKey('Rodriguez, Rizal')).toBe(cityKey('Rodriguez'));
    expect(cityKey('Imus, Cavite')).toBe(cityKey('Imus'));
  });
});

describe('barangayKey', () => {
  test('separates the same barangay name in different cities', () => {
    expect(barangayKey('Quezon City', 'Poblacion')).not.toBe(
      barangayKey('Makati', 'Poblacion'),
    );
  });

  test('ignores "Brgy." markers and punctuation', () => {
    expect(barangayKey('Dasmariñas', 'Brgy. San Jose (Poblacion)')).toBe(
      barangayKey('CITY OF DASMARIÑAS', 'SAN JOSE (POBLACION)'),
    );
  });
});

describe('buildBarangayIndex', () => {
  test('indexes the computed status, not the raw one', () => {
    const index = buildBarangayIndex([build()], NOW);
    expect(index.get(barangayKey('Quezon City', 'Kalusugan'))?.status).toBe('active');
  });

  test('promotes a barangay to active when any outage is active', () => {
    const scheduled = build({ id: 'a', startsAt: '2026-10-26T08:00:00+08:00', endsAt: '2026-10-26T16:00:00+08:00' });
    const index = buildBarangayIndex([scheduled, build({ id: 'b' })], NOW);

    const hit = index.get(barangayKey('Quezon City', 'Kalusugan'));
    expect(hit?.status).toBe('active');
    expect(hit?.outages.map((o) => o.id)).toEqual(['a', 'b']);
  });

  test('leaves restored and cancelled rows out of the map index', () => {
    const restored = build({ id: 'r', startsAt: '2026-10-24T08:00:00+08:00', endsAt: '2026-10-24T16:00:00+08:00' });
    const cancelled = build({ id: 'c', status: 'cancelled' });

    const index = buildBarangayIndex([restored, cancelled], NOW);
    expect(index.size).toBe(0);
  });

  test('keys on city as well as barangay name', () => {
    const index = buildBarangayIndex(
      [
        build({
          id: 'makati',
          affectedAreas: [
            { barangays: [{ name: 'Poblacion', city: 'Makati', province: 'Metro Manila' }] },
          ],
        }),
      ],
      NOW,
    );

    expect(index.has(barangayKey('Makati', 'Poblacion'))).toBe(true);
    expect(index.has(barangayKey('Quezon City', 'Poblacion'))).toBe(false);
  });
});
