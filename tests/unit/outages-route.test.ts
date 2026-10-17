import { describe, expect, it } from 'vitest';
import { GeminiRawOutagesSchema } from '@/lib/ingestion/gemini-schema';
import { hydrateGeminiOutage, type GeminiRawOutage } from '@/lib/ingestion/gemini-schema';
import { OutageSchema } from '@/lib/schemas/outage';

describe('gemini-raw-schema', () => {
  it('parses a realistic Gemini raw outage payload', () => {
    const payload = {
      outages: [
        {
          concessionaire: 'maynilad',
          status: 'active',
          reason: 'Network Repair Activity',
          startsAt: '2026-10-16T22:00:00+08:00',
          endsAt: '2026-10-17T06:00:00+08:00',
          affectedAreas: [
            {
              barangays: [{ name: 'Holy Spirit', city: 'Quezon City', province: 'Metro Manila' }],
            },
          ],
          confidence: 'inferred',
        },
      ],
    };

    const result = GeminiRawOutagesSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('gemini-hydration', () => {
  it('hydrates a raw Gemini row into a valid full Outage', () => {
    const raw: GeminiRawOutage = {
      concessionaire: 'maynilad',
      status: 'active',
      reason: 'Network Repair Activity',
      startsAt: '2026-10-16T22:00:00+08:00',
      endsAt: '2026-10-17T06:00:00+08:00',
      affectedAreas: [
        {
          barangays: [{ name: 'Holy Spirit', city: 'Quezon City', province: 'Metro Manila' }],
        },
      ],
      confidence: 'inferred',
    };

    const fetchedAt = new Date('2026-10-17T00:00:00Z');
    const hydrated = hydrateGeminiOutage(raw, 'https://example.com/advisories', fetchedAt);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.id).toBeDefined();
    expect(hydrated?.startsAt).toBeInstanceOf(Date);
    expect(hydrated?.endsAt).toBeInstanceOf(Date);
    expect(hydrated?.confidence).toBe('inferred');

    const validated = OutageSchema.safeParse(hydrated);
    expect(validated.success).toBe(true);
  });

  it('skips a row with an invalid startsAt string', () => {
    const raw: GeminiRawOutage = {
      concessionaire: 'maynilad',
      status: 'active',
      reason: 'Network Repair Activity',
      startsAt: 'not-a-date',
      affectedAreas: [],
      confidence: 'inferred',
    };

    const hydrated = hydrateGeminiOutage(raw, 'https://example.com/advisories', new Date());
    expect(hydrated).toBeNull();
  });

  it('hydrates a row with no endsAt as an active outage with endsAt undefined', () => {
    const raw: GeminiRawOutage = {
      concessionaire: 'maynilad',
      status: 'active',
      reason: 'Network Repair Activity',
      startsAt: '2026-10-16T22:00:00+08:00',
      affectedAreas: [],
      confidence: 'inferred',
    };

    const hydrated = hydrateGeminiOutage(raw, 'https://example.com/advisories', new Date());
    expect(hydrated).not.toBeNull();
    expect(hydrated?.endsAt).toBeUndefined();

    const validated = OutageSchema.safeParse(hydrated);
    expect(validated.success).toBe(true);
  });
});

export {};
