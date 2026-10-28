import { describe, expect, it } from 'vitest';

import type { AffectedArea } from '@/lib/schemas/affected-area';
import type { Outage } from '@/lib/schemas/outage';
import { buildCityDirectory } from '@/lib/utils/city-directory';
import { cityKey } from '@/lib/utils/barangay-geo';
import { slugify } from '@/lib/utils/slugify';

const NOW = new Date('2026-10-25T12:00:00+08:00');

type FixtureOptions = {
  /** The row-level city label, when the source provides one. */
  city?: string;
  /** Barangay-level city labels; one affected area is created per entry. */
  areas?: Array<{ city: string; name?: string }>;
  startsAt?: string;
  endsAt?: string;
  status?: Outage['status'];
};

function affectedArea(city: string, name: string): AffectedArea {
  return { barangays: [{ name, city, province: 'Metro Manila' }], streets: [], notes: '' };
}

function outage(id: string, options: FixtureOptions = {}): Outage {
  // A row-level city stands in for the affected areas, so fixtures never add a stray second city.
  const areas = options.areas ?? (options.city === undefined ? [{ city: 'Quezon City' }] : []);

  return {
    id,
    concessionaire: 'maynilad',
    status: options.status ?? 'active',
    reason: 'Mainline repair along Quirino Highway.',
    startsAt: new Date(options.startsAt ?? '2026-10-25T08:00:00+08:00'),
    endsAt: new Date(options.endsAt ?? '2026-10-25T18:00:00+08:00'),
    affectedAreas: areas.map((area) => affectedArea(area.city, area.name ?? 'Kalusugan')),
    source: {
      url: 'https://example.com/advisories/test',
      fetchedAt: new Date('2026-10-25T07:00:00+08:00'),
    },
    confidence: 'official',
    ...(options.city === undefined ? {} : { city: options.city }),
  };
}

/** Drops `startsAt` to model an archive row whose start time never survived the read. */
function withoutStartAt(row: Outage): Outage {
  const copy: Partial<Outage> = { ...row };
  delete copy.startsAt;
  return copy as Outage;
}

describe('buildCityDirectory', () => {
  it('returns one entry per distinct city across the row city and every barangay city', () => {
    const directory = buildCityDirectory(
      [
        outage('a', {
          city: 'Manila',
          areas: [{ city: 'Quezon City' }, { city: 'Makati' }],
        }),
      ],
      NOW,
    );

    expect(directory.map((entry) => entry.city).sort()).toEqual([
      'Makati',
      'Manila',
      'Quezon City',
    ]);
  });

  it('keeps a city that only appears in an archived outage as Quiet', () => {
    const directory = buildCityDirectory(
      [
        outage('restored', {
          city: 'Pasig',
          startsAt: '2026-10-01T08:00:00+08:00',
          endsAt: '2026-10-01T16:00:00+08:00',
        }),
      ],
      NOW,
    );

    const entry = directory.find((candidate) => candidate.cityKey === cityKey('Pasig'));

    expect(entry).toBeDefined();
    expect(entry?.activeCount).toBe(0);
    expect(entry?.scheduledCount).toBe(0);
    expect(entry?.lastOutageAt).toBe(new Date('2026-10-01T08:00:00+08:00').getTime());
  });

  it('collapses "Caloocan" and "Caloocan City" into a single entry', () => {
    const directory = buildCityDirectory(
      [
        outage('plain', { city: 'Caloocan', startsAt: '2026-10-24T08:00:00+08:00' }),
        outage('suffixed', { city: 'Caloocan City', startsAt: '2026-10-25T08:00:00+08:00' }),
      ],
      NOW,
    );

    expect(directory).toHaveLength(1);
    expect(directory[0]?.cityKey).toBe('caloocan');
    expect(directory[0]?.activeCount).toBe(2);
    // The newest row supplies the display label, the tie-break only applies within one start time.
    expect(directory[0]?.city).toBe('Caloocan City');
  });

  it('picks the shorter label when one row carries both spellings of a city', () => {
    const directory = buildCityDirectory(
      [
        outage('both', {
          city: 'Caloocan City',
          areas: [{ city: 'Caloocan' }],
        }),
      ],
      NOW,
    );

    expect(directory).toHaveLength(1);
    expect(directory[0]?.city).toBe('Caloocan');
  });

  it('counts one outage once when the same city appears in several affected areas', () => {
    const directory = buildCityDirectory(
      [outage('multi-area', { areas: [{ city: 'Manila' }, { city: 'Manila' }] })],
      NOW,
    );

    expect(directory).toHaveLength(1);
    expect(directory[0]?.activeCount).toBe(1);
  });

  it('does not double-count a row id that appears twice in the input', () => {
    const row = outage('duplicate', { city: 'Taguig' });

    const directory = buildCityDirectory([row, row], NOW);

    expect(directory).toHaveLength(1);
    expect(directory[0]?.activeCount).toBe(1);
  });

  it('separates active and scheduled counts for the same city', () => {
    const directory = buildCityDirectory(
      [
        outage('running', {
          city: 'Makati',
          startsAt: '2026-10-25T06:00:00+08:00',
          endsAt: '2026-10-25T18:00:00+08:00',
        }),
        outage('upcoming', {
          city: 'Makati',
          startsAt: '2026-10-26T06:00:00+08:00',
          endsAt: '2026-10-26T18:00:00+08:00',
        }),
      ],
      NOW,
    );

    const entry = directory.find((candidate) => candidate.cityKey === cityKey('Makati'));

    expect(entry?.activeCount).toBe(1);
    expect(entry?.scheduledCount).toBe(1);
  });

  it('sets lastOutageAt to the latest start time across the city rows', () => {
    const directory = buildCityDirectory(
      [
        outage('older', {
          city: 'Pasay',
          startsAt: '2026-10-20T08:00:00+08:00',
          endsAt: '2026-10-20T12:00:00+08:00',
        }),
        outage('newer', {
          city: 'Pasay',
          startsAt: '2026-10-24T08:00:00+08:00',
          endsAt: '2026-10-24T12:00:00+08:00',
        }),
      ],
      NOW,
    );

    expect(directory[0]?.lastOutageAt).toBe(new Date('2026-10-24T08:00:00+08:00').getTime());
  });

  it('leaves lastOutageAt null when no row for the city carries a start time', () => {
    const directory = buildCityDirectory([withoutStartAt(outage('undated', { city: 'Navotas' }))], NOW);

    expect(directory[0]?.lastOutageAt).toBeNull();
  });

  it('sorts entries by display city name, ignoring case and accents', () => {
    const directory = buildCityDirectory(
      [
        outage('qc', { city: 'Quezon City' }),
        outage('paranaque', { city: 'Parañaque' }),
        outage('caloocan', { city: 'Caloocan' }),
        outage('laspinas', { city: 'Las Piñas' }),
        outage('manila', { city: 'Manila' }),
      ],
      NOW,
    );

    expect(directory.map((entry) => entry.city)).toEqual([
      'Caloocan',
      'Las Piñas',
      'Manila',
      'Parañaque',
      'Quezon City',
    ]);
    expect(directory.findIndex((entry) => entry.city === 'Parañaque')).toBe(3);
    expect(directory.findIndex((entry) => entry.city === 'Las Piñas')).toBe(1);
  });

  it('drops blank and "unknown" city labels instead of creating entries', () => {
    const directory = buildCityDirectory(
      [
        outage('blank', { city: '   ', areas: [{ city: '' }] }),
        outage('unknown', { city: 'Unknown', areas: [{ city: 'unknown' }] }),
        outage('real', { city: 'UNKNOWN', areas: [{ city: 'Quezon City' }] }),
      ],
      NOW,
    );

    expect(directory.map((entry) => entry.city)).toEqual(['Quezon City']);
  });

  it('derives slug and cityKey from the chosen display label', () => {
    const directory = buildCityDirectory([outage('laspinas', { city: 'Las Piñas' })], NOW);

    expect(directory[0]?.slug).toBe(slugify('Las Piñas'));
    expect(directory[0]?.slug).toBe('las-pinas');
    expect(directory[0]?.cityKey).toBe(cityKey('Las Piñas'));
  });

  it('returns an empty directory for an empty input', () => {
    expect(buildCityDirectory([], NOW)).toEqual([]);
  });
});
