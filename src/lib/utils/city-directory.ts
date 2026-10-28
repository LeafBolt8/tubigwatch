import type { Outage } from '@/lib/schemas/outage';

import { cityKey } from './barangay-geo';
import { dedupById } from './dedup';
import { computeStatus } from './outage-status';
import { slugify } from './slugify';

export type CityDirectoryEntry = {
  city: string;
  cityKey: string;
  slug: string;
  activeCount: number;
  scheduledCount: number;
  lastOutageAt: number | null;
};

type CityLabel = {
  label: string;
  startsAt: number;
};

type CityBucket = {
  /** Keyed by id so one row cannot count twice when it names the same city in several areas. */
  outages: Map<string, Outage>;
  labels: CityLabel[];
};

/** Rows can arrive with a missing or unparseable start time; they sort as the oldest possible. */
function startsAtMs(outage: Outage): number {
  if (!outage.startsAt) return Number.NEGATIVE_INFINITY;
  const value = new Date(outage.startsAt).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function isUsableCityLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed !== '' && trimmed.toLowerCase() !== 'unknown';
}

/** City labels a single row touches: its own city field plus the city on every affected barangay. */
function cityLabelsFor(outage: Outage): string[] {
  const labels = new Set<string>();
  if (outage.city) labels.add(outage.city.trim());

  for (const area of outage.affectedAreas) {
    for (const barangay of area.barangays) {
      labels.add(barangay.city.trim());
    }
  }

  return [...labels].filter(isUsableCityLabel);
}

function precedes(candidate: CityLabel, current: CityLabel): boolean {
  if (candidate.startsAt !== current.startsAt) return candidate.startsAt > current.startsAt;
  if (candidate.label.length !== current.label.length) {
    return candidate.label.length < current.label.length;
  }
  return candidate.label.localeCompare(current.label, 'en', { sensitivity: 'base' }) < 0;
}

/**
 * The display label comes from the newest row in the group, so the directory shows the spelling the
 * advisories use today; ties fall back to the shorter label, then alphabetical order, which keeps
 * "Caloocan" over "Caloocan City" without making the result depend on input order.
 */
function pickDisplayLabel(labels: CityLabel[]): string | null {
  let chosen: CityLabel | null = null;
  for (const candidate of labels) {
    if (chosen === null || precedes(candidate, chosen)) chosen = candidate;
  }
  return chosen?.label ?? null;
}

/**
 * Groups rows into the city directory, reusing `cityKey` and `computeStatus` so a directory row and
 * the matching `/city/[slug]` page always agree on which outages belong to a city and how they count.
 */
export function buildCityDirectory(outages: Outage[], now: Date): CityDirectoryEntry[] {
  const buckets = new Map<string, CityBucket>();

  for (const outage of dedupById(outages)) {
    const startsAt = startsAtMs(outage);

    for (const label of cityLabelsFor(outage)) {
      const key = cityKey(label);
      if (key === '') continue;

      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { outages: new Map(), labels: [] };
        buckets.set(key, bucket);
      }

      bucket.outages.set(outage.id, outage);
      bucket.labels.push({ label, startsAt });
    }
  }

  const entries: CityDirectoryEntry[] = [];

  for (const [key, bucket] of buckets) {
    const city = pickDisplayLabel(bucket.labels);
    if (city === null) continue;

    let activeCount = 0;
    let scheduledCount = 0;
    let lastOutageAt: number | null = null;

    for (const outage of bucket.outages.values()) {
      const status = computeStatus(outage, now);
      if (status === 'active') activeCount += 1;
      else if (status === 'scheduled') scheduledCount += 1;

      const startsAt = startsAtMs(outage);
      if (Number.isFinite(startsAt) && (lastOutageAt === null || startsAt > lastOutageAt)) {
        lastOutageAt = startsAt;
      }
    }

    entries.push({
      city,
      cityKey: key,
      slug: slugify(city),
      activeCount,
      scheduledCount,
      lastOutageAt,
    });
  }

  return entries.sort((left, right) =>
    left.city.localeCompare(right.city, 'en', { sensitivity: 'base' }),
  );
}
