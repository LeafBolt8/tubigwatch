import { NextRequest, NextResponse } from 'next/server';

import { getCachedMayniladOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';

/**
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
 * `fetchedAt` is set at response-construction time (the moment we served the cached value), NOT the
 * moment the source was scraped. A future task can surface the scraped `fetchedAt` from inside the
 * cache's result, but this route does not fabricate one.
 *
 * Deviation note (vs ARCHITECTURE §4 cache policy):
 *   §4 specifies revalidate: 3600 s (1 hour) per source tag. We use 900 s here because Maynilad rows
 *   reflect active repairs that can be restored at any hour, and the endpoint is slow (~143 s for a full
 *   read). 15 min balances source load against freshness without pretending the page is live — a future
 *   task can revisit this once the revalidate flow in §6 is wired.
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
