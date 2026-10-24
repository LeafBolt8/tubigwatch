import { beforeEach, describe, expect, test, vi } from 'vitest';

const { set } = vi.hoisted(() => ({ set: vi.fn(async () => 'OK') }));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    set = set;
  },
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/push/subscribe/route';

const VALID_BODY = {
  subscription: {
    endpoint: 'https://push.example.test/subscriptions/abc',
    expirationTime: null,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  },
  favorites: [{ type: 'barangay' as const, name: 'baesa' }],
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  set.mockClear();
});

describe('push subscription route', () => {
  test('stores a valid subscription under its endpoint', async () => {
    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(
      'push-sub:https://push.example.test/subscriptions/abc',
      VALID_BODY,
    );
  });

  test('rejects an invalid payload without writing', async () => {
    const response = await POST(
      request({
        subscription: { endpoint: 'not-a-url', keys: { p256dh: '', auth: '' } },
        favorites: [{ type: 'street', name: 'baesa' }],
      }),
    );

    expect(response.status).toBe(400);
    expect(set).not.toHaveBeenCalled();
  });

  test('reports a storage failure without leaking a success', async () => {
    set.mockRejectedValueOnce(new Error('redis down'));

    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not save subscription.' });
  });
});
