import { unstable_cache } from 'next/cache';

import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';
import { extractOutagesFromUrl } from '@/lib/ingestion/gemini';
import type { Outage } from '@/lib/schemas/outage';

const MAYNI_URL = 'https://www.mayniladwater.com.ph/service-advisories-2/';
// const MW_URL = 'https://www.manilawater.com/customers/service-advisories'; // paused: Manila Water extraction removed for v1

function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    kept.push(item);
  }
  return kept;
}

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
 * Cached surface for Gemini-extracted outages from the Cloudflare-protected advisory pages.
 *
 * Design notes:
 * - One cache entry per deploy, keyed with no args (both URLs are constant). If a future task ever
 *   needs per-page or per-key cache lifetimes, it must pass serializable args and adjust the key.
 * - Revalidate: 3600 s (1 hour). Gemini extraction is slow (~45-80s per page), consumes API quota,
 *   and the two advisory pages are not streamed live data, so 1 hour balances cost/speed against
 *   freshness. This is the §4 default and is appropriate here.
 * - Tags: ['gemini-outages'] so a revalidateTag('gemini-outages') would refresh both sources at once.
 * - Returns only the validated, hydrated Outage[] that the UI already consumes; errors do not become
 *   outage rows (they surface as sourceErrors in the route).
 */
export type GeminiCachedOutagesResult = {
  outages: Outage[];
  errors: string[];
};

export const getCachedGeminiOutages = unstable_cache(
  async () => {
    const maynilad = await extractOutagesFromUrl(MAYNI_URL);
    const manilaWater = { outages: [], error: 'Manila Water extraction is paused for v1 (Cloudflare block).' };

    const merged = dedupById<Outage>([
      ...maynilad.outages,
      ...manilaWater.outages,
    ]);

    const errors: string[] = [];
    if (maynilad.error) errors.push(`maynilad: ${maynilad.error}`);
    if (manilaWater.error) errors.push(`manila-water: ${manilaWater.error}`);

    return { outages: merged, errors };
  },
  ['gemini-outages'],
  { revalidate: 86400, tags: ['gemini-outages'] },
);
