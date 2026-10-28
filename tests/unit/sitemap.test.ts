import { describe, expect, test } from 'vitest';

import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import { buildSitemap } from '@/lib/seo/sitemap';

const BASE = 'https://example.test';
const NOW = new Date('2026-10-26T00:00:00.000Z');

describe('buildSitemap', () => {
  const entries = buildSitemap(outageFixtures, BASE, NOW);
  const urls = entries.map((entry) => entry.url);

  test('includes the static pages', () => {
    expect(urls).toEqual(expect.arrayContaining([`${BASE}/`, `${BASE}/map`, `${BASE}/privacy`]));
    expect(urls).toContain(`${BASE}/cities`);
  });

  test('includes one URL per fixture city', () => {
    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE}/city/quezon-city`,
        `${BASE}/city/makati`,
        `${BASE}/city/taguig`,
        `${BASE}/city/pasig`,
        `${BASE}/city/caloocan`,
      ]),
    );
  });

  test('includes one URL per barangay, qualified by city', () => {
    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE}/barangay/kalusugan-quezon-city`,
        `${BASE}/barangay/poblacion-makati`,
        `${BASE}/barangay/ususan-taguig`,
        `${BASE}/barangay/kapitolyo-pasig`,
        `${BASE}/barangay/barangay-176-caloocan`,
      ]),
    );
  });

  test('includes locations that only appear in the historical archive', () => {
    const historicalOnly: Outage = {
      ...outageFixtures[0]!,
      id: 'historical-binangonan',
      city: 'Binangonan, Rizal',
      affectedAreas: [
        {
          barangays: [{ name: 'Tayuman', city: 'Binangonan, Rizal', province: 'Rizal' }],
          streets: [],
          notes: '',
        },
      ],
    };

    const historicalUrls = buildSitemap([], BASE, NOW, [historicalOnly]).map(
      (entry) => entry.url,
    );

    expect(historicalUrls).toEqual(
      expect.arrayContaining([
        `${BASE}/city/binangonan-rizal`,
        `${BASE}/barangay/tayuman-binangonan-rizal`,
      ]),
    );
  });

  test('does not repeat a URL', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  test('carries the supplied timestamp', () => {
    expect(entries.every((entry) => entry.lastModified === NOW)).toBe(true);
  });
});
