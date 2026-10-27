import { unstable_cache } from 'next/cache';

import { Redis } from '@upstash/redis';

import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';
import { readManualOutages } from './manual-outages';
import { dedupById } from '@/lib/utils/dedup';
import { normalizeOutages } from '@/lib/utils/normalize-outages';
import { OutageSchema, type Outage } from '@/lib/schemas/outage';

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
 * Vercel does not scrape for the dashboard: `scripts/scrape.ts` runs every 6 hours and stores the
 * normalised rows under `last-known-good-outages`. This reader serves that snapshot, so a render
 * costs one Redis round-trip instead of a multi-minute scrape.
 *
 * - Manual overrides stored by `/api/admin` are merged in, so an operator's row is not hidden
 *   behind the scraped snapshot.
 * - A snapshot older than 36 h is still served, but with an error message: a dead scraper must not
 *   look like a quiet day.
 * - An empty store, or an empty outage list, is reported as an error with any manual rows attached.
 * - revalidate: 3600 s, matching the scrape cadence, without a Redis read per request.
 */
export type GeminiCachedOutagesResult = {
  outages: Outage[];
  errors: string[];
  fetchedAt: number;
};

const getCachedGeminiSnapshot = unstable_cache(
  async (): Promise<GeminiCachedOutagesResult> => {
    try {
      const data = await redis.get<{ outages: Outage[]; timestamp: number }>(
        'last-known-good-outages',
      );
      const manualOutages = await readManualOutages();

      if (!data || !data.outages || data.outages.length === 0) {
        return {
          outages: manualOutages,
          errors: ['No data available yet. The scraper is warming up.'],
          fetchedAt: Date.now(),
        };
      }

      const ageHours = (Date.now() - data.timestamp) / (1000 * 60 * 60);
      const errors: string[] = [];

      if (ageHours > 36) {
        errors.push(`WARNING: Data is ${Math.round(ageHours)} hours old. The scraper may be broken.`);
      }

      // Redis stores JSON, so timestamps come back as strings even though the type says Date.
      // Parsing through the schema restores real Dates; the city and barangay pages format and
      // compare them directly, so a string there throws and the route renders the error boundary.
      const snapshot = OutageSchema.array().safeParse(data.outages);
      if (!snapshot.success) {
        return {
          outages: manualOutages,
          errors: ['Stored outage data could not be read.'],
          fetchedAt: Date.now(),
        };
      }

      const merged =
        manualOutages.length > 0
          ? dedupById<Outage>([...snapshot.data, ...manualOutages])
          : snapshot.data;

      return { outages: normalizeOutages(merged), errors, fetchedAt: data.timestamp };
    } catch (error) {
      console.error('Failed to read from Redis:', error);
      return { outages: [], errors: ['Database connection failed.'], fetchedAt: Date.now() };
    }
  },
  ['gemini-outages-redis-v3'],
  { revalidate: 3600, tags: ['gemini-outages-redis-v3'] },
);

/**
 * Next's Data Cache stores the wrapped result as JSON, so the Date fields came back as strings
 * even after the Redis read revived them. The city page sorts with `getTime()` and formats with
 * `Intl.DateTimeFormat`, and both throw on a string, so re-parse at this boundary.
 */
export async function getCachedGeminiOutages(): Promise<GeminiCachedOutagesResult> {
  const snapshot = await getCachedGeminiSnapshot();
  const parsed = OutageSchema.array().safeParse(snapshot.outages);

  if (!parsed.success) {
    return {
      ...snapshot,
      outages: [],
      errors: [...snapshot.errors, 'Stored outage data could not be read.'],
    };
  }

  return { ...snapshot, outages: parsed.data };
}
