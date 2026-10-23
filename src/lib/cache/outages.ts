import { unstable_cache } from 'next/cache';

import { Redis } from '@upstash/redis';

import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';
import type { Outage } from '@/lib/schemas/outage';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

/***
 * Cached surface for the Maynilad native fetcher.
 *
 * Revalidation + the cache key are chosen for outage-type data:
 * - revalidate: 900 s (15 min), not the §4 default of 3600 s. Reason: Maynilad rows reflect active
 *   repairs that can be restored at any hour, and the endpoint is slow (~143 s for a full read), so
 *   15 min balances source load against freshness without pretending the page is live.
 * - tags: ['maynilad'] so a revalidateTag('maynilad') would mark this dirty when the cache handling
 *   in §6 is wired up.
 *
 * Notes / deviations:
 *   - No args are forwarded to the wrapped call. `unstable_cache` requires serializable args; our
 *     fetcher takes none, so we pass an empty arg tuple and the cache key is stable. If a future task
 *     ever wants to vary the fetch (for example an optional per-endpoint cap), it must pass serializable
 *     args — do not reintroduce non-serializable shape here.
 *   - This wrapper does not change the public signature of `fetchMayniladOutages`; it only caches calls
 *     to it. The ingestion module's API is unchanged.
 *   - The cache layer does not add its own `sourceErrors` conversion — errors still surface inside the
 *     cached result exactly as `fetchMayniladOutages()` returns them.
 */
export const getCachedMayniladOutages = unstable_cache(
  async () => {
    return fetchMayniladOutages();
  },
  ['maynilad-outages'],
  { revalidate: 900, tags: ['maynilad'] },
);

/***
 * Cached read of the snapshot the scheduled GitHub Action writes to Redis.
 *
 * Vercel no longer scrapes for the dashboard: `scripts/scrape.ts` runs every 6 hours and stores the
 * normalised rows under `last-known-good-outages`. This reader serves that snapshot, so a render
 * costs one Redis round-trip instead of a multi-minute scrape.
 *
 * - revalidate: 3600 s, matching the scrape cadence: a visitor is never more than one cycle behind,
 *   without a Redis read per request.
 * - An empty store, or an empty outage list, is reported as an error with no rows. It must never be
 *   presented as "no outages today".
 */
export type GeminiCachedOutagesResult = {
  outages: Outage[];
  errors: string[];
  fetchedAt: number;
};

export const getCachedGeminiOutages = unstable_cache(
  async (): Promise<GeminiCachedOutagesResult> => {
    try {
      const data = await redis.get<{ outages: Outage[]; timestamp: number }>(
        'last-known-good-outages',
      );

      if (data && data.outages && data.outages.length > 0) {
        return {
          outages: data.outages,
          errors: [],
          fetchedAt: data.timestamp,
        };
      }

      // No snapshot yet (or one with no rows): the scraper has not stored anything usable.
      return {
        outages: [],
        errors: ['No data available yet. The scraper is warming up.'],
        fetchedAt: Date.now(),
      };
    } catch (error) {
      console.error('Failed to read from Redis:', error);
      return { outages: [], errors: ['Database connection failed.'], fetchedAt: Date.now() };
    }
  },
  ['gemini-outages-redis'],
  { revalidate: 3600, tags: ['gemini-outages-redis'] },
);
