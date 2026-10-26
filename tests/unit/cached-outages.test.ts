import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Outage } from '@/lib/schemas/outage';

const { redisGet, readManualOutages } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  readManualOutages: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = redisGet;
  },
}));
vi.mock('@/lib/cache/manual-outages', () => ({ readManualOutages }));

import { getCachedGeminiOutages } from '@/lib/cache/outages';

function makeOutage(id: string, barangay: string, city = 'Quezon City'): Outage {
  return {
    id,
    concessionaire: 'maynilad',
    status: 'active',
    reason: 'Network Repair Activity',
    startsAt: new Date('2026-10-15T22:00:00+08:00'),
    endsAt: new Date('2026-10-16T06:00:00+08:00'),
    affectedAreas: [
      {
        barangays: [{ name: barangay, city, province: 'Metro Manila' }],
        streets: [],
        notes: '',
      },
    ],
    source: { url: 'https://example.com/advisories', fetchedAt: new Date() },
    confidence: 'official' as const,
  };
}

describe('getCachedGeminiOutages (Redis snapshot)', () => {
  beforeEach(() => {
    redisGet.mockReset();
    readManualOutages.mockReset();
  });

  it('merges manual override rows into the stored snapshot', async () => {
    redisGet.mockResolvedValue({
      outages: [makeOutage('scraped-1', 'Holy Spirit')],
      timestamp: Date.now(),
    });
    readManualOutages.mockResolvedValue([makeOutage('manual-1', 'Baesa')]);

    const result = await getCachedGeminiOutages();

    expect(result.outages.map((o) => o.id).sort()).toEqual([
      'manual-1-quezon-city',
      'scraped-1-quezon-city',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('warns when the snapshot is older than 36 hours', async () => {
    redisGet.mockResolvedValue({
      outages: [makeOutage('scraped-1', 'Holy Spirit')],
      timestamp: Date.now() - 48 * 60 * 60 * 1000,
    });
    readManualOutages.mockResolvedValue([]);

    const result = await getCachedGeminiOutages();

    expect(result.errors[0]).toMatch(/^WARNING: Data is 4[78] hours old\./);
    expect(result.outages).toHaveLength(1);
  });

  it('restores Date objects from the JSON snapshot', async () => {
    // Redis returns the stored JSON, so timestamps arrive as strings even though the result type
    // promises Dates. The city and barangay pages call Date methods on them directly.
    redisGet.mockResolvedValue({
      outages: [JSON.parse(JSON.stringify(makeOutage('scraped-1', 'Holy Spirit')))],
      timestamp: Date.now(),
    });
    readManualOutages.mockResolvedValue([]);

    const result = await getCachedGeminiOutages();

    expect(result.outages[0]?.startsAt).toBeInstanceOf(Date);
    expect(result.outages[0]?.startsAt.toISOString()).toBe('2026-10-15T14:00:00.000Z');
    expect(result.outages[0]?.endsAt).toBeInstanceOf(Date);
    expect(result.outages[0]?.source.fetchedAt).toBeInstanceOf(Date);
  });

  it('keeps manual rows when no snapshot has been written yet', async () => {
    redisGet.mockResolvedValue(null);
    readManualOutages.mockResolvedValue([makeOutage('manual-1', 'Baesa')]);

    const result = await getCachedGeminiOutages();

    // This branch returns the manual rows as stored, without the city-normalisation pass.
    expect(result.outages.map((o) => o.id)).toEqual(['manual-1']);
    expect(result.errors[0]).toContain('No data available yet');
  });

  it('reports a failed Redis read instead of an empty outage list', async () => {
    redisGet.mockRejectedValue(new Error('connection refused'));
    readManualOutages.mockResolvedValue([]);

    const result = await getCachedGeminiOutages();

    expect(result.outages).toEqual([]);
    expect(result.errors).toEqual(['Database connection failed.']);
  });
});
