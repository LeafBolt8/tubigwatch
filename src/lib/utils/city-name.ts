import { CITY_COORDS } from './geo';
import { slugify } from './slugify';

/**
 * Recovers the canonical label for a city slug. The slug strips diacritics, so "las-pinas" must
 * render as "Las Piñas" from a known list rather than title-casing the slug itself.
 */
export function canonicalCityName(
  slug: string,
  knownNames: Iterable<string> = Object.keys(CITY_COORDS),
): string | null {
  for (const name of knownNames) {
    if (slugify(name) === slug) return name;
  }
  return null;
}
