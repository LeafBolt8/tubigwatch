import type { Outage } from '@/lib/schemas/outage';

import { slugify } from './slugify';

export type BarangayLocation = {
  name: string;
  city: string;
  slug: string;
};

/**
 * A barangay name alone is ambiguous — "Poblacion" exists in most Metro Manila cities — so the
 * slug carries the city as well ("poblacion-makati").
 */
export function barangaySlug(name: string, city: string): string {
  return slugify(`${name} ${city}`);
}

/** Every distinct barangay/city pair the current dataset mentions, keyed by its slug. */
export function listBarangayLocations(outages: Outage[]): BarangayLocation[] {
  const seen = new Map<string, BarangayLocation>();

  for (const outage of outages) {
    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        if (!barangay.city) continue;
        const slug = barangaySlug(barangay.name, barangay.city);
        if (!seen.has(slug)) {
          seen.set(slug, { name: barangay.name, city: barangay.city, slug });
        }
      }
    }
  }

  return [...seen.values()];
}

export function findBarangayBySlug(slug: string, outages: Outage[]): BarangayLocation | null {
  return listBarangayLocations(outages).find((location) => location.slug === slug) ?? null;
}
