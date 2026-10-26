import type { MetadataRoute } from 'next';

import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import { buildSitemap } from '@/lib/seo/sitemap';

// Built per request: the cache layer already rate-limits Redis reads, and a sitemap frozen at
// build time would never gain the city and barangay pages created by later advisories.
export const dynamic = 'force-dynamic';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tubigwatch.vercel.app';
const DEV = process.env.NODE_ENV !== 'production';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let outages: Outage[] = [];

  if (DEV && process.env.GEMINI_API_KEY === undefined) {
    outages = outageFixtures;
  } else {
    try {
      outages = (await getCachedGeminiOutages()).outages;
    } catch {
      // An unavailable store must not take the whole sitemap down; the static routes still serve.
      outages = [];
    }
  }

  return buildSitemap(outages, baseUrl);
}
