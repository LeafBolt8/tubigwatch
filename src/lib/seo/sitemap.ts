import type { MetadataRoute } from 'next';

import type { Outage } from '@/lib/schemas/outage';
import { listBarangayLocations } from '@/lib/utils/barangay-slug';
import { slugify } from '@/lib/utils/slugify';

/**
 * Builds the sitemap from the rows the site can actually render. Every entry points at a dynamic
 * route that resolves against the same dataset, so an indexed URL never 404s.
 */
export function buildSitemap(
  outages: Outage[],
  baseUrl: string,
  lastModified: Date = new Date(),
  historicalOutages: Outage[] = [],
): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified, changeFrequency: 'hourly', priority: 1 },
    { url: `${baseUrl}/map`, lastModified, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/cities`, lastModified, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.1 },
  ];

  const allOutages = [...outages, ...historicalOutages];
  const cities = new Set<string>();
  for (const outage of allOutages) {
    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        if (barangay.city) cities.add(slugify(barangay.city));
      }
    }
  }

  for (const citySlug of [...cities].sort()) {
    routes.push({
      url: `${baseUrl}/city/${citySlug}`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  }

  for (const location of listBarangayLocations(allOutages).sort((a, b) => a.slug.localeCompare(b.slug))) {
    routes.push({
      url: `${baseUrl}/barangay/${location.slug}`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  return routes;
}
