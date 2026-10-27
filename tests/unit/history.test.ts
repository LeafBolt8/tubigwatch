import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Outage } from '@/lib/schemas/outage';

const { redisGet, redisSet } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = redisGet;
    set = redisSet;
  },
}));

import { archiveOutages } from '@/lib/cache/history';

function makeOutage(id: string, startsAt: string): Outage {
  return {
    id,
    concessionaire: 'maynilad',
    status: 'active',
    reason: 'Network Repair Activity',
    startsAt: new Date(startsAt),
    affectedAreas: [
      {
        barangays: [{ name: 'Holy Spirit', city: 'Quezon City', province: 'Metro Manila' }],
        streets: [],
        notes: '',
      },
    ],
    source: { url: 'https://example.com/advisories', fetchedAt: new Date() },
    confidence: 'official',
  };
}

describe('archiveOutages', () => {
  beforeEach(() => {
    redisGet.mockReset();
    redisSet.mockReset();
  });

  it('keeps the newest copy of an id and appends older history', async () => {
    redisGet.mockResolvedValue([
      makeOutage('kept', '2026-09-01T00:00:00+08:00'),
      makeOutage('updated', '2026-09-02T00:00:00+08:00'),
    ]);
    const updated = makeOutage('updated', '2026-09-03T00:00:00+08:00');

    await archiveOutages([updated]);

    const saved = redisSet.mock.calls[0]?.[1] as Outage[];
    expect(saved.map((outage) => outage.id)).toEqual(['updated', 'kept']);
    expect(saved[0]?.startsAt.getTime()).toBe(updated.startsAt.getTime());
  });

  it('caps the archive at the newest 1000 rows', async () => {
    redisGet.mockResolvedValue([]);
    const rows = Array.from({ length: 1005 }, (_, index) =>
      makeOutage(
        `id-${index}`,
        new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      ),
    );

    await archiveOutages(rows);

    const saved = redisSet.mock.calls[0]?.[1] as Outage[];
    expect(saved).toHaveLength(1000);
    expect(saved[0]?.id).toBe('id-1004');
    expect(saved[999]?.id).toBe('id-5');
  });
});
