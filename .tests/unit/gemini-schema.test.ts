import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeminiOutagesSchema } from '@/lib/ingestion/gemini-schema';

describe('gemini-schema', () => {
  it('converts to a valid JSON Schema object', () => {
    const json = zodToJsonSchema(GeminiOutagesSchema, {
      $refBasePath: '#/components/schemas',
    });

    expect(json).toHaveProperty('$schema');
    expect(Array.isArray(json.properties?.outages?.items)).toBe(false);
    expect(typeof json.properties?.outages?.items).toBe('object');
  });

  it('embeds the outage shape via the wrapper', () => {
    const json = zodToJsonSchema(GeminiOutagesSchema, {
      $refBasePath: '#/components/schemas',
    });

    expect(json.properties).toHaveProperty('outages');
    expect(json.properties!.outages).toHaveProperty('items');
  });

  it('round-trips through a minimal outage payload', () => {
    const payload = {
      outages: [
        {
          id: 'test-1',
          concessionaire: 'maynilad' as const,
          status: 'active' as const,
          reason: 'Network Repair Activity',
          startsAt: new Date('2026-10-16T22:00:00.000Z'),
          endsAt: new Date('2026-10-17T06:00:00.000Z'),
          affectedAreas: [],
          source: {
            url: MAYNI_URL,
            fetchedAt: new Date(),
          },
          confidence: 'official' as const,
        },
      ],
    };

    const result = GeminiOutagesSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

const MAYNI_URL = 'https://www.mayniladwater.com.ph/service-advisories-2/';
