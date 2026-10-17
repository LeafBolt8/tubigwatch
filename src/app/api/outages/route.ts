import { NextRequest, NextResponse } from 'next/server';

import { getCachedMayniladOutages, getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';

export const maxDuration = 300;

/***
 * Contract the UI will consume (do not change without the UI tasks):
 *
 *   GET /api/outages
 *     → { outages: Outage[], freshness: 'fresh'|'stale'|'unavailable',
 *          fetchedAt: string (ISO 8601), sourceErrors: string[]|string,
 *          truncated: boolean }
 *
 *   GET /api/outages?source=fixtures
 *     → same shape, but `outages` = the in-repo `outageFixtures[]`, `freshness` = 'fresh',
 *       `sourceErrors` = ['fixtures mode — not live data'].
 *
 *   GET /api/outages?source=gemini
 *     → same shape, with outages extracted by Gemini from both Maynilad and Manila Water
 *       advisory pages, served from a 1-hour `unstable_cache` entry. When Gemini succeeds,
 *       `sourceErrors` is `[]`. When Gemini errors, `sourceErrors` carries the real Gemini errors;
 *       there is no hardcoded "not live data" string in the success path.
 *
 * `fetchedAt` is set at response-construction time (the moment we served the cached value), NOT the
 * moment the source was scraped. A future task can surface the scraped `fetchedAt` from inside the
 * cache's result, but this route does not fabricate one.
 *
 * Deviation note (vs ARCHITECTURE §4 cache policy):
 *   §4 specifies revalidate: 3600 s (1 hour) per source tag. The Gemini cache uses 3600 s; the native
 *   Maynilad cache uses 900 s because Maynilad rows reflect active repairs that can be restored at any
 *   hour, and the endpoint is slow (~143 s for a full read). 15 min balances source load against freshness
 *   without pretending the page is live.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // -- fixtures mode (for Playwright tests + local dev, not for production reads) --
  if (searchParams.has('source') && searchParams.get('source') === 'fixtures') {
    return NextResponse.json(
      {
        outages: outageFixtures,
        freshness: 'fresh' as const,
        fetchedAt: new Date().toISOString(),
        sourceErrors: ['fixtures mode — not live data'],
        truncated: false,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      },
    );
  }

  // -- Gemini-extracted path (for Cloudflare-protected sources) --
  if (searchParams.has('source') && searchParams.get('source') === 'gemini') {
    const gemini = await getCachedGeminiOutages();

    const sourceErrors: string[] = [];
    for (const err of gemini.errors) {
      sourceErrors.push(err);
    }
    if (process.env.GEMINI_API_KEY === undefined || process.env.GEMINI_API_KEY === '') {
      sourceErrors.push('GEMINI_API_KEY not set — Gemini path is not configured');
    }

    return NextResponse.json(
      {
        outages: gemini.outages,
        freshness: 'fresh' as const,
        fetchedAt: new Date().toISOString(),
        sourceErrors: sourceErrors.length > 0 ? sourceErrors : [],
        truncated: false,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      },
    );
  }

  // -- live, cached path --
  const data = await getCachedMayniladOutages();
  // `data` is the MayniladFetchResult shape from the ingestion module. Map it to the route contract.
  return NextResponse.json(
    {
      outages: data.outages,
      freshness: data.freshness,
      fetchedAt: new Date().toISOString(),
      sourceErrors: data.sourceErrors,
      truncated: data.truncated,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
      },
    },
  );
}
