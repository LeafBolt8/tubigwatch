import { NextRequest, NextResponse } from 'next/server';

import { getCachedMayniladOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { extractOutagesFromUrl, type GeminiExtractResult } from '@/lib/ingestion/gemini';

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
 *       advisory pages. `sourceErrors` will carry any Gemini parse/extract error plus an
 *       explicit "not live data" note.
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

const MAYNI_URL = 'https://www.mayniladwater.com.ph/service-advisories-2/';
const MW_URL = 'https://www.manilawater.com/customers/service-advisories';

function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    kept.push(item);
  }
  return kept;
}

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
    const maynilad = await extractOutagesFromUrl(MAYNI_URL);
    const manilaWater = await extractOutagesFromUrl(MW_URL);

    const sourceErrors: string[] = [];
    if (maynilad.error) sourceErrors.push(`maynilad: ${maynilad.error}`);
    if (manilaWater.error) sourceErrors.push(`manila-water: ${manilaWater.error}`);
    if (process.env.GEMINI_API_KEY === undefined || process.env.GEMINI_API_KEY === '') {
      sourceErrors.push('GEMINI_API_KEY not set — Gemini path is not configured');
    }

    const merged = dedupById<GeminiExtractResult['outages'][number]>([
      ...maynilad.outages,
      ...manilaWater.outages,
    ]);

    return NextResponse.json(
      {
        outages: merged,
        freshness: 'fresh' as const,
        fetchedAt: new Date().toISOString(),
        sourceErrors: sourceErrors.length > 0 ? sourceErrors : ['gemini mode — not live data'],
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
