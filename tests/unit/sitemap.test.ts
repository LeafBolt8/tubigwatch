import { describe, expect, test } from 'vitest';

import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { buildSitemap } from '@/lib/seo/sitemap';

const BASE = 'https://example.test';
const NOW = new Date('2026-10-26T00:00:00.000Z');

describe('buildSitemap', () => {
  const entries = buildSitemap(outageFixtures, BASE, NOW);
  const urls = entries.map((entry) => entry.url);

  test('includes the static pages', () => {
    expect(urls).toEqual(expect.arrayContaining([`${BASE}/`, `${BASE}/map`, `${BASE}/privacy`]));
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

  test('does not repeat a URL', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  test('carries the supplied timestamp', () => {
    expect(entries.every((entry) => entry.lastModified === NOW)).toBe(true);
  });
});
