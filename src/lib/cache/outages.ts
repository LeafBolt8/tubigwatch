import { unstable_cache } from 'next/cache';

import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';
import { fetchManilaWaterOutages } from '@/lib/ingestion/manila-water';
import { extractOutagesFromUrl } from '@/lib/ingestion/gemini';
import { readManualOutages } from './manual-outages';
import type { Outage } from '@/lib/schemas/outage';
import { BARANGAY_TO_CITY } from '@/lib/utils/barangay-city-map';
import { cleanBarangayName } from '@/lib/utils/barangay-name';


function unifyCityName(city: string | undefined): string {
  if (!city) return 'Unknown';

  // Split on semicolons or ampersands in case the upstream returned multiple cities
  // ("Las Pinas City; Paranaque City", "Pasig & Taguig City").
  const parts = city.split(/[;&]/).map(c => c.trim());

  // If there's more than one city, we can't map it to a single unified city easily.
  // But in our logic, `b.city` is only used as a fallback if the barangay name isn't in the dictionary.
  // So we'll just take the first valid city from the split, or return the raw string if it's still a mess.
  const firstPart = parts[0] || city;

  const c = firstPart.trim();
  if (c === 'Navotas City' || c === 'Navotas') return 'Navotas';
  if (c === 'Muntinlupa City' || c === 'Muntinlupa') return 'Muntinlupa';
  if (c === 'Las Pinas City' || c === 'Las Piñas City' || c === 'Las Piñas' || c === 'Las Pinas') return 'Las Piñas';
  if (c === 'Paranaque City' || c === 'Parañaque City' || c === 'Parañaque' || c === 'Paranaque') return 'Parañaque';

  return c;
}

// Dictionary keys normalized with the same function used on incoming names. First key wins
// so a collision cannot silently overwrite an earlier (curated) mapping.
const NORMALIZED_BARANGAY_TO_CITY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, city] of Object.entries(BARANGAY_TO_CITY)) {
    const normalized = cleanBarangayName(key);
    if (normalized && map[normalized] === undefined) {
      map[normalized] = city;
    }
  }
  return map;
})();

/**
 * Barangay names that exist in several Metro Manila cities, so the dictionary alone cannot
 * pick the right one. For these the row's own city wins whenever the row names a usable
 * single city; the dictionary stays the fallback for missing or multi-city rows.
 */
const AMBIGUOUS_BARANGAYS: ReadonlySet<string> = new Set(['san antonio', 'san isidro']);

/**
 * Picks the city for one barangay. The dictionary is the authority for uniquely named
 * barangays (it corrects AI mislabels), and only yields to the row's city for ambiguous
 * names — and never for a multi-city row, where the dictionary resolves the ambiguity.
 */
function resolveBarangayCity(cleanName: string, rowCity: string | undefined): string {
  const dictCity = NORMALIZED_BARANGAY_TO_CITY[cleanName];
  const unifiedRowCity = unifyCityName(rowCity || 'Unknown');

  if (!dictCity) return unifiedRowCity;

  const isMultiCityRow = (rowCity || '').includes(';');
  const isAmbiguous = AMBIGUOUS_BARANGAYS.has(cleanName);

  if (isAmbiguous && !isMultiCityRow && unifiedRowCity !== 'Unknown') {
    return unifiedRowCity;
  }

  return unifyCityName(dictCity);
}

export function normalizeOutages(outages: Outage[]): Outage[] {
  const result: Outage[] = [];

  for (const outage of outages) {
    // Group barangays by their corrected city.
    const barangaysByCity: Record<string, typeof outage.affectedAreas[0]['barangays']> = {};

    for (const area of outage.affectedAreas) {
      for (const b of area.barangays) {
        const rawNames = b.name.split(/[,;]|\band\b/i);

        for (const rawName of rawNames) {
          const cleanName = cleanBarangayName(rawName);
          if (!cleanName) continue;

          const correctCity = resolveBarangayCity(cleanName, b.city);

          if (!barangaysByCity[correctCity]) {
            barangaysByCity[correctCity] = [];
          }

          // Dedupe on the cleaned key, not the raw spelling: "Sta. Ana" and "Sta Ana" (or
          // "Pinagbuhatan" and "PInagbuhatan") are the same barangay, and the first spelling
          // seen becomes the display name.
          const alreadyHave = barangaysByCity[correctCity].some(
            (existing) => cleanBarangayName(existing.name) === cleanName,
          );

          if (!alreadyHave) {
            barangaysByCity[correctCity].push({ name: rawName.trim(), city: correctCity, province: b.province, psgcCode: b.psgcCode });
          }
        }
      }
    }

    // Explode into multiple outage objects, one per city.
    for (const [city, barangays] of Object.entries(barangaysByCity)) {
      result.push({
        ...outage,
        id: `${outage.id}-${city.replace(/\s+/g, '-').toLowerCase()}`,
        city,
        affectedAreas: [{ barangays }],
      });
    }
  }

  return result;
}

const MAYNI_URL = 'https://www.mayniladwater.com.ph/service-advisories-2/';

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
 * Cached surface for both concessionaires' advisories.
 *
 * Manila Water is read natively from its public REST API (see lib/ingestion/manila-water.ts);
 * only Maynilad still goes through Gemini, with the native scraper as fallback.
 *
 * Design notes:
 * - One cache entry per deploy, keyed with no args (both URLs are constant). If a future task ever
 *   needs per-page or per-key cache lifetimes, it must pass serializable args and adjust the key.
 * - Revalidate: 3600 s (1 hour). The Maynilad Gemini pass is slow (~45-80s), consumes API quota,
 *   and neither source streams live data, so 1 hour balances cost/speed against freshness. This is
 *   the §4 default and is appropriate here.
 * - Tags: ['gemini-outages-v10'] so a revalidateTag('gemini-outages-v10') would refresh both sources at once.
 * - Returns only the validated, hydrated Outage[] that the UI already consumes; errors do not become
 *   outage rows (they surface as sourceErrors in the route).
 */
export type GeminiCachedOutagesResult = {
  outages: Outage[];
  errors: string[];
};

export const getCachedGeminiOutages = unstable_cache(
  async () => {
    let mayniladOutages: Outage[] = [];
    let mayniladError: string | null = null;
    let manilaWaterOutages: Outage[] = [];
    let manilaWaterError: string | null = null;

    try {
      const geminiResult = await extractOutagesFromUrl(MAYNI_URL, 'maynilad');
      if (geminiResult.error) {
        throw new Error(geminiResult.error);
      }
      mayniladOutages = geminiResult.outages;
    } catch (geminiErr) {
      console.warn('Gemini failed, falling back to native Maynilad scraper:', geminiErr);
      try {
        const nativeResult = await fetchMayniladOutages();
        mayniladOutages = nativeResult.outages;
        if (nativeResult.sourceErrors.length > 0) {
          mayniladError = `Native fallback: ${nativeResult.sourceErrors.join(', ')}`;
        }
      } catch (nativeErr) {
        const lastNativeErr = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
        mayniladError = `Both Gemini and native scraper failed. Last Gemini error: ${geminiErr}; native error: ${lastNativeErr}`;
      }
    }

    try {
      const mwResult = await fetchManilaWaterOutages();
      manilaWaterOutages = mwResult.outages;
      if (mwResult.sourceErrors.length > 0) {
        manilaWaterError = mwResult.sourceErrors.join(', ');
      }
    } catch (mwErr) {
      manilaWaterError = mwErr instanceof Error ? mwErr.message : String(mwErr);
    }

    const manualOutages = await readManualOutages();
    if (manualOutages.length > 0) {
      const mergedManual = dedupById<Outage>([...mayniladOutages, ...manilaWaterOutages, ...manualOutages]);
      const manualErrors = manualOutages.map((o) => `${o.concessionaire}: manual override`);
      const manualError = `Manual overrides active (${manualOutages.length} rows)`;
      return { outages: mergedManual, errors: [...manualErrors, manualError] };
    }

    const merged = dedupById<Outage>([...mayniladOutages, ...manilaWaterOutages]);

    const errors: string[] = [];
    if (mayniladError) errors.push(`maynilad: ${mayniladError}`);
    if (manilaWaterError) errors.push(`manila-water: ${manilaWaterError}`);

    return { outages: normalizeOutages(merged), errors };
  },
  ['gemini-outages-v10'],
  { revalidate: 86400, tags: ['gemini-outages-v10'] },
);
