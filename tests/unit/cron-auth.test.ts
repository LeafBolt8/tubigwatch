import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { getCachedGeminiOutages } = vi.hoisted(() => ({ getCachedGeminiOutages: vi.fn() }));

vi.mock('@/lib/cache/outages', () => ({ getCachedGeminiOutages }));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/cron/warm/route';

function request(authHeader?: string) {
  return new NextRequest('http://localhost/api/cron/warm', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  getCachedGeminiOutages.mockReset();
  getCachedGeminiOutages.mockResolvedValue({ outages: [{}, {}], errors: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cron warm route auth', () => {
  test('rejects a missing Authorization header', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(getCachedGeminiOutages).not.toHaveBeenCalled();
  });

  test('rejects a wrong secret', async () => {
    const res = await GET(request('Bearer nope'));

    expect(res.status).toBe(401);
    expect(getCachedGeminiOutages).not.toHaveBeenCalled();
  });

  test('rejects every caller when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer undefined'))).status).toBe(401);
  });

  test('warms the cache and reports success for the right secret', async () => {
    const res = await GET(request('Bearer cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.outages).toBe(2);
    expect(getCachedGeminiOutages).toHaveBeenCalledTimes(1);
  });
});
