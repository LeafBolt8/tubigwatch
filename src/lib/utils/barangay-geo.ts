import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

import { cleanBarangayName } from './barangay-name';
import { computeStatus } from './outage-status';

/**
 * Provinces the boundary data appends to outlying city labels ("Rodriguez, Rizal") while
 * advisories usually drop it, so it is stripped from both sides before comparing.
 */
const PROVINCE_SUFFIX = /\s+(metro manila|rizal|cavite|laguna|bulacan)$/;

/**
 * Comparison key for a city label that survives spelling differences between the PSA boundary
 * file ("CITY OF LAS PIÑAS", "PASAY CITY") and advisory text ("Las Piñas", "Pasay").
 */
export function cityKey(city: string): string {
  return cleanBarangayName(city)
    .replace(/^(city|municipality|municipio) of /, '')
    .replace(/\s+(city|municipality)$/, '')
    .replace(PROVINCE_SUFFIX, '')
    .trim();
}

/**
 * Comparison key for one barangay boundary or advisory entry. The city is part of the key because
 * "Poblacion" and "San Isidro" exist in most Metro Manila cities — matching on the barangay name
 * alone would colour the wrong polygon.
 */
export function barangayKey(city: string, barangay: string): string {
  return `${cityKey(city)}|${cleanBarangayName(barangay)}`;
}

export type BarangayMapStatus = Extract<OutageStatus, 'active' | 'scheduled'>;

export type BarangayIndexEntry = {
  status: BarangayMapStatus;
  outages: Outage[];
};

/**
 * Lookup from `barangayKey` to the outages that colour that boundary, so a 2000-polygon layer can
 * resolve each feature in constant time instead of re-scanning every outage per polygon.
 *
 * Only active and scheduled rows are indexed: restored and cancelled outages are not advisories
 * a resident still needs on the map, and the legend has no colour for them.
 */
export function buildBarangayIndex(
  outages: Outage[],
  now: Date,
): Map<string, BarangayIndexEntry> {
  const index = new Map<string, BarangayIndexEntry>();

  for (const outage of outages) {
    const status = computeStatus(outage, now);
    if (status !== 'active' && status !== 'scheduled') continue;

    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        const key = barangayKey(barangay.city, barangay.name);
        const existing = index.get(key);

        if (!existing) {
          index.set(key, { status, outages: [outage] });
          continue;
        }

        if (!existing.outages.includes(outage)) existing.outages.push(outage);
        // An active outage outranks a scheduled one, whichever order they were ingested in.
        if (status === 'active') existing.status = 'active';
      }
    }
  }

  return index;
}
