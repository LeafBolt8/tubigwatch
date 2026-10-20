import { Redis } from '@upstash/redis';
import { OutageSchema } from '@/lib/schemas/outage';
import type { Outage } from '@/lib/schemas/outage';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

export async function readManualOutages(): Promise<Outage[]> {
  try {
    const data = await redis.get<{ servedAt: string; rows: unknown[] }>('manual-outages');
    if (!data) return [];

    // If someone stored the raw array directly, use it; otherwise unwrap the { servedAt, rows } shape.
    const rowsToParse = Array.isArray(data) ? data : data.rows;
    if (!rowsToParse) return [];

    const parsed = OutageSchema.array().safeParse(rowsToParse);
    return parsed.success ? parsed.data : [];
  } catch (error) {
    console.error('Failed to read manual outages from Redis:', error);
    return [];
  }
}
