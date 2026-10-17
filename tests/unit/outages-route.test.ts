import { describe, expect, it } from 'vitest';
import { OutageSchema } from '@/lib/schemas/outage';

describe('outage-schema', () => {
  it('parses a minimal outage payload', () => {
    const payload = {
      id: 'test-1',
      concessionaire: 'maynilad' as const,
      status: 'active' as const,
      reason: 'Network Repair Activity',
      startsAt: new Date('2026-10-16T22:00:00.000Z'),
      endsAt: new Date('2026-10-17T06:00:00.000Z'),
      affectedAreas: [],
      source: {
        url: 'https://www.mayniladwater.com.ph/service-advisories-2/',
        fetchedAt: new Date(),
      },
      confidence: 'official' as const,
    };

    const result = OutageSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

export {};
