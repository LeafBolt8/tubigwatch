/**
 * Converts a city label into the URL segment used by `/city/[slug]`.
 *
 * Diacritics are decomposed and dropped before the character filter, so "Las Piñas" and
 * "Parañaque" keep a plain-ASCII slug instead of percent-encoded punctuation.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Rebuilds a display label from a slug when no canonical city name is available.
 *
 * Accents cannot be restored ("las-pinas" becomes "Las Pinas"), so callers that have the
 * original labels should resolve against those first.
 */
export function deslugify(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
