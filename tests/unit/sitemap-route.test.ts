import { describe, expect, test, vi } from 'vitest';

const { SITE, getLive, getHistorical } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
  process.env.GEMINI_API_KEY = 'test-key';
  return {
    SITE: 'https://example.test',
    getLive: vi.fn(),
    getHistorical: vi.fn(),
  };
});

vi.mock('@/lib/cache/outages', () => ({
  getCachedGeminiOutages: getLive,
}));
vi.mock('@/lib/cache/history', () => ({
  getHistoricalOutages: getHistorical,
}));

import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import sitemap from '@/app/sitemap';

describe('sitemap route', () => {
  test('includes historical-only cities and barangays', async () => {
    getLive.mockResolvedValue({ outages: [], errors: [], fetchedAt: 0 });
    getHistorical.mockResolvedValue([
      {
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
      },
    ]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        `${SITE}/city/binangonan-rizal`,
        `${SITE}/barangay/tayuman-binangonan-rizal`,
      ]),
    );
  });
});
