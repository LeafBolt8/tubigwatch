import { kv } from '@vercel/kv';
import { OutageSchema } from '@/lib/schemas/outage';
import type { Outage } from '@/lib/schemas/outage';

export async function readManualOutages(): Promise<Outage[]> {
  try {
    const data = (await kv.get<unknown>('manual-outages')) ?? null;
    if (!data) return [];

    const parsed = OutageSchema.array().safeParse(data);
    if (!parsed.success) return [];

    return parsed.data;
  } catch (error) {
    console.error('Failed to read manual outages from KV:', error);
    return [];
  }
}
