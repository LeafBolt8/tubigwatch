import { Redis } from '@upstash/redis';

import { OutageSchema, type Outage } from '@/lib/schemas/outage';
import { dedupById } from '@/lib/utils/dedup';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

const HISTORY_KEY = 'historical-outages';
const HISTORY_LIMIT = 1000;

function startsAtTime(outage: Outage): number {
  const time = new Date(outage.startsAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Appends the latest scrape to the persistent archive and keeps only the newest 1000 rows.
 * New rows win deduplication so a status change on an existing advisory replaces the old copy.
 */
export async function archiveOutages(newOutages: Outage[]): Promise<void> {
  if (newOutages.length === 0) return;

  const stored = await redis.get<unknown>(HISTORY_KEY);
  const parsed = OutageSchema.array().safeParse(stored ?? []);

  if (!parsed.success) {
    console.warn('Could not read historical outages; starting a new archive.');
  }

  const historical = parsed.success ? parsed.data : [];
  const merged = dedupById<Outage>([...newOutages, ...historical]).sort(
    (a, b) => startsAtTime(b) - startsAtTime(a),
  );

  await redis.set(HISTORY_KEY, merged.slice(0, HISTORY_LIMIT));
}
