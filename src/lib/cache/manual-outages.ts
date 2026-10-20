import { Redis } from '@upstash/redis';
import { OutageSchema } from '@/lib/schemas/outage';
import type { Outage } from '@/lib/schemas/outage';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

export async function readManualOutages(): Promise<Outage[]> {
  try {
    const data = (await redis.get<unknown>('manual-outages')) ?? null;
    if (!data) return [];

    const parsed = OutageSchema.array().safeParse(data);
    if (!parsed.success) return [];

    return parsed.data;
  } catch (error) {
    console.error('Failed to read manual outages from KV:', error);
    return [];
  }
}
