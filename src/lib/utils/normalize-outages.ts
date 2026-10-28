/**
 * City correction for outage rows.
 *
 * Split out of `lib/cache/outages.ts` so the scheduled scraper (`scripts/scrape.ts`) can normalise
 * rows without importing `next/cache`. Behaviour is unchanged: the dictionary is the authority for
 * uniquely named barangays, and the row's own city only wins for ambiguous names.
 */

import type { Outage } from '@/lib/schemas/outage';
import { BARANGAY_TO_CITY } from '@/lib/utils/barangay-city-map';
import { cleanBarangayName } from '@/lib/utils/barangay-name';

/** Spelling rules for one city label. Input has already been split and trimmed. */
function normalizeSingleCity(city: string): string {
  const c = city.trim();
  if (c === 'Navotas City' || c === 'Navotas') return 'Navotas';
  if (c === 'Muntinlupa City' || c === 'Muntinlupa') return 'Muntinlupa';
  if (
    c === 'Las Pinas City' ||
    c === 'Las Piñas City' ||
    c === 'Las Piñas' ||
    c === 'Las Pinas'
  )
    return 'Las Piñas';
  if (
    c === 'Paranaque City' ||
    c === 'Parañaque City' ||
    c === 'Parañaque' ||
    c === 'Paranaque'
  )
    return 'Parañaque';
  // "Pasig City" and "Pasig" were splitting into two sections for the same city. "Rizal" is a
  // province, not a city, so it is passed through unchanged.
  if (c === 'Pasig City' || c === 'Pasig') return 'Pasig';

  return c;
}

/**
 * Normalizes a city field that may name several cities ("Las Pinas City; Paranaque City",
 * "Pasig & Taguig City"). Every part is kept: the consumer splitter renders a preserved compound
 * label under each of its cities, so dropping parts after the first would lose history that
 * cannot be rebuilt from storage.
 */
function unifyCityName(city: string | undefined): string {
  if (!city) return 'Unknown';

  const parts = city
    .split(/[;&]/)
    .map(normalizeSingleCity)
    .filter((part) => part !== '');

  if (parts.length === 0) return 'Unknown';
  return parts.join(' & ');
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

  const isMultiCityRow = /[;&]/.test(rowCity || '');
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
            barangaysByCity[correctCity].push({
              name: rawName.trim(),
              city: correctCity,
              province: b.province,
              psgcCode: b.psgcCode,
            });
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
