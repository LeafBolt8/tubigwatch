import { unstable_cache } from 'next/cache';

import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';

/**
 * Cached surface for `fetchMayniladOutages()`.
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
