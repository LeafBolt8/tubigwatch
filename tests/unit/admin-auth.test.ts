import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
});
