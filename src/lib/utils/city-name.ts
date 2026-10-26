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

  // Advisory cities often carry a province ("Binangonan, Rizal"). Accept the city-only slug too,
  // because older links and hand-typed URLs drop the province.
  for (const name of knownNames) {
    const cityOnly = name.split(',')[0]?.trim();
    if (cityOnly && cityOnly !== name && slugify(cityOnly) === slug) return name;
  }

  return null;
}

/**
 * Splits one row's city field into separate headings. A semicolon separates genuinely different
 * cities, while a comma belongs to a single label ("Binangonan, Rizal") and must not create a
 * bogus "Rizal" group.
 */
export function splitCityLabels(raw: string): string[] {
  return raw
    .split(';')
    .map((label) => label.trim())
    .filter(Boolean);
}
