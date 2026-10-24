import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { limit } = vi.hoisted(() => ({
  limit: vi.fn(async () => ({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
  })),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn(() => '1 m');
    limit = limit;
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = vi.fn(async () => null);
    set = vi.fn(async () => 'OK');
  },
}));

import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/admin/route';

const VALID_ROW = {
  id: 'manual-1',
  concessionaire: 'maynilad',
  status: 'active',
  reason: 'Manual entry',
  startsAt: '2026-10-20T22:00:00Z',
  affectedAreas: [{ barangays: [{ name: 'Baesa', city: 'Quezon City', province: 'Metro Manila' }] }],
  source: { url: 'https://example.test/manual', fetchedAt: '2026-10-20T22:00:00Z' },
  confidence: 'official',
};

function request(method: 'GET' | 'POST', token?: string) {
  return new NextRequest('http://localhost/api/admin', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(method === 'POST' ? { body: JSON.stringify([VALID_ROW]) } : {}),
  });
}

beforeEach(() => {
  vi.stubEnv('ADMIN_PASSWORD', 'correct horse');
  limit.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin route auth', () => {
  test('refuses to run and says so when ADMIN_PASSWORD is not configured', async () => {
    vi.stubEnv('ADMIN_PASSWORD', '');

    const res = await POST(request('POST', 'anything'));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('ADMIN_PASSWORD is not configured');
  });

  test('rejects a wrong password', async () => {
    const res = await POST(request('POST', 'wrong'));

    expect(res.status).toBe(401);
  });

  test('rejects a missing Authorization header', async () => {
    const res = await POST(request('POST'));

    expect(res.status).toBe(401);
  });

  test('accepts the password the panel actually sends (URI-encoded)', async () => {
    const res = await POST(request('POST', encodeURIComponent('correct horse')));

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('GET is gated the same way', async () => {
    expect((await GET(request('GET', 'wrong'))).status).toBe(401);
    expect((await GET(request('GET', encodeURIComponent('correct horse')))).status).toBe(200);
  });

  test('returns 429 before checking the password when the limiter refuses', async () => {
    const refused = {
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };

    limit.mockResolvedValueOnce(refused);
    const post = await POST(request('POST', 'wrong'));
    expect(post.status).toBe(429);
    expect((await post.json()).error).toBe('Too many requests. Please try again later.');

    limit.mockResolvedValueOnce(refused);
    const get = await GET(request('GET', 'wrong'));
    expect(get.status).toBe(429);
  });

  test('keys the limiter on the first forwarded address', async () => {
    const forwarded = new NextRequest('http://localhost/api/admin', {
      method: 'GET',
      headers: {
        authorization: 'Bearer wrong',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      },
    });

    await GET(forwarded);

    expect(limit).toHaveBeenCalledWith('203.0.113.9');
  });
});
