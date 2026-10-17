import { describe, expect, test, vi } from 'vitest';

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/outages/route';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';

const ONE_FIXTURE = {
  id: 'test-outage-id',
  concessionaire: 'maynilad' as const,
  status: 'active' as const,
  reason: 'Test repair',
  startsAt: new Date('2026-10-15T15:00:00.000Z'),
  endsAt: new Date('2026-10-15T22:00:00.000Z'),
  estimatedRestoration: undefined,
  affectedAreas: [
    {
      barangays: [{ name: 'Test', city: 'Test City', province: 'Metro Manila' as const, psgcCode: undefined }],
      streets: [],
      notes: '',
    },
  ],
  source: {
    url: 'https://www.mayniladwater.com.ph/wp-json/interruptions/emergency',
    fetchedAt: new Date('2026-10-16T00:00:00.000Z'),
    raw: '',
  },
  confidence: 'official' as const,
};

function makeRequest(url = 'http://localhost/api/outages') {
  return {
    url,
    searchParams: new URL(url).searchParams,
    headers: new Headers(),
    method: 'GET',
    geo: undefined,
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

vi.mock('@/lib/cache/outages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache/outages')>('@/lib/cache/outages');
  return {
    ...actual,
    getCachedMayniladOutages: vi.fn(async () => ({
      outages: [ONE_FIXTURE],
      freshness: 'fresh',
      sourceErrors: [] as string[],
      fetchedAt: new Date('2026-10-16T00:00:00.000Z'),
      pagesFetched: 0,
      truncated: false,
      endpoints: [] as never[],
    })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetCached = (await import('@/lib/cache/outages')).getCachedMayniladOutages as any;

describe('/api/outages (cached Maynilad route)', () => {
  test('returns 200 + JSON with the exact route contract (cached live path)', async () => {
    const req = makeRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json).toMatchObject({
      outages: JSON.parse(JSON.stringify([ONE_FIXTURE])),
      freshness: 'fresh',
      sourceErrors: [] as string[],
      truncated: false,
    });
    expect(typeof json.fetchedAt).toBe('string');
    expect(new Date(json.fetchedAt).toISOString()).toBe(json.fetchedAt);
    // The live path calls getCachedMayniladOutages exactly once per request.
    expect(mockGetCached).toHaveBeenCalledTimes(1);
    mockGetCached.mockClear();
  });

  test('sets Cache-Control public, s-maxage=900, stale-while-revalidate=1800', async () => {
    const req = makeRequest();
    const res = await GET(req);

    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('s-maxage=900');
    expect(cc).toContain('stale-while-revalidate=1800');
  });

  test('?source=fixtures returns outageFixtures with the fixture-mode error', async () => {
    const req = makeRequest('http://localhost/api/outages?source=fixtures');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.outages).toEqual(JSON.parse(JSON.stringify(outageFixtures)));
    expect(json.freshness).toBe('fresh');
    expect(json.sourceErrors).toContain('fixtures mode — not live data');
    expect(json.truncated).toBe(false);
    expect(typeof json.fetchedAt).toBe('string');
    // The fixtures handler short-circuits before the live cache is consulted.
    expect(mockGetCached).not.toHaveBeenCalled();
  });
});
