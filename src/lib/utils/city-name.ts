import type { Outage } from '@/lib/schemas/outage';

import { cityKey } from './barangay-geo';
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

/** Separators that always mean "another city follows". A comma is not one of them. */
export const CITY_SEPARATORS = [';', '&'] as const;

/**
 * Provinces that show up as a bare city field. They are not cities, so every consumer that builds
 * navigation from labels drops them; the value is kept on the outage itself.
 */
const PROVINCE_ONLY: ReadonlySet<string> = new Set([
  'rizal',
  'cavite',
  'laguna',
  'bulacan',
  'batangas',
  'pampanga',
]);

export function isProvinceOnly(label: string): boolean {
  return PROVINCE_ONLY.has(label.trim().toLowerCase());
}

const PLACEHOLDER_LABELS: ReadonlySet<string> = new Set(['', 'n/a', 'na', 'unknown']);

/** `cityKey` of every city the app knows, so a conjunction can be validated against real names. */
const KNOWN_CITY_KEYS: ReadonlySet<string> = new Set(
  Object.keys(CITY_COORDS).map((name) => cityKey(name)),
);

/**
 * Splits on the word "and" only when every side names a city the app knows. Prose such as
 * "Portions of Brgy. X and Y" therefore survives intact instead of becoming two fake cities.
 */
function splitOnConjunction(raw: string): string[] | null {
  const groups: string[][] = [[]];
  for (const word of raw.split(' ')) {
    if (word === '') continue;
    if (word.toLowerCase() === 'and') {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1]!.push(word);
  }

  if (groups.length < 2 || groups.some((group) => group.length === 0)) return null;

  const parts = groups.map((group) => group.join(' '));
  return parts.every((part) => KNOWN_CITY_KEYS.has(cityKey(part))) ? parts : null;
}

/**
 * The single source of truth for a city URL slug. Callers must run `splitCityLabels` first: this
 * takes ONE city label and drops a comma province ("Antipolo, Rizal" -> "antipolo") while keeping
 * a trailing "City" ("Quezon City" -> "quezon-city"), so a city never collides with the province
 * of the same name ("Quezon").
 */
export function citySlug(rawLabel: string): string {
  const [cityPart] = rawLabel.split(',');
  return slugify((cityPart ?? rawLabel).trim());
}

/**
 * Splits one row's city field into separate city labels. Semicolons and ampersands always
 * separate; the word "and" separates only when every side is a known city. A comma belongs to a
 * single label ("Binangonan, Rizal") and must not create a bogus "Rizal" group.
 */
export function splitCityLabels(raw: string): string[] {
  const trimmed = raw.trim();
  if (PLACEHOLDER_LABELS.has(trimmed.toLowerCase())) return [];

  const pieces: string[] = [];
  for (const semicolonPart of trimmed.split(';')) {
    for (const ampersandPart of semicolonPart.split('&')) {
      const conjunction = splitOnConjunction(ampersandPart);
      pieces.push(...(conjunction ?? [ampersandPart]));
    }
  }

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const piece of pieces) {
    const label = piece.trim();
    const key = label.toLowerCase();
    if (PLACEHOLDER_LABELS.has(key) || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return labels;
}

/** Every city label a set of rows touches, including province-only values (for slug resolution). */
export function rawCityLabelsInOutages(outages: Outage[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  const add = (value: string | undefined) => {
    if (!value) return;
    for (const label of splitCityLabels(value)) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
    }
  };

  for (const outage of outages) {
    add(outage.city);
    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) add(barangay.city);
    }
  }

  return labels;
}

/** Labels a city page may advertise: province-only values are removed. */
export function cityLabelsInOutages(outages: Outage[]): string[] {
  return rawCityLabelsInOutages(outages).filter((label) => !isProvinceOnly(label));
}

/**
 * Whether a row belongs on `/city/<wantedCity>`. Expanding first is what makes one compound row
 * ("Antipolo and Cainta, Rizal") render on both city pages instead of neither.
 */
export function outageAffectsCity(outage: Outage, wantedCity: string): boolean {
  const wanted = cityKey(wantedCity);
  return rawCityLabelsInOutages([outage]).some((label) => cityKey(label) === wanted);
}
