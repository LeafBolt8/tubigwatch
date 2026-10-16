// CRITICAL: 'unavailable' must never be rendered the same as 'fresh, zero outages'. A source that returns nothing is not the same as a source that reports no outages.

export type DataFreshness = 'fresh' | 'stale' | 'unavailable';

const HOUR_MS = 60 * 60 * 1000;
const FRESH_MAX_MS = 2 * HOUR_MS;
const STALE_MAX_MS = 24 * HOUR_MS;

export function classifyFreshness(fetchedAt: Date, now: Date = new Date()): DataFreshness {
  const ageMs = now.getTime() - fetchedAt.getTime();
  if (ageMs < FRESH_MAX_MS) return 'fresh';
  if (ageMs < STALE_MAX_MS) return 'stale';
  return 'unavailable';
}
