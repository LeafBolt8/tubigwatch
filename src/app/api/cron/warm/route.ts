import { NextRequest, NextResponse } from 'next/server';

import { getCachedGeminiOutages } from '@/lib/cache/outages';

export const maxDuration = 300;

/***
 * Cache pre-warmer for the Vercel Cron Job in `vercel.json`.
 *
 * The dashboard reads `getCachedGeminiOutages()`, whose cold path costs ~45-80 s per extraction. A
 * cron hit here pays that cost in the background so real visitors get the warm entry.
 *
 * `/api/outages` is deliberately NOT used: without `?source=gemini` it serves the native Maynilad
 * cache, which would leave the slow Gemini entry cold. Vercel cron invocations only GET a plain
 * path, so the query-string variant is not reachable from `vercel.json` either.
 *
 * Auth: when `CRON_SECRET` is configured in the Vercel project, Vercel sends it as
 * `Authorization: Bearer <secret>` and any mismatch is rejected. With no secret set the route stays
 * open — it only refreshes a cache and reveals nothing beyond outage counts and source errors.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const gemini = await getCachedGeminiOutages();

  return NextResponse.json(
    {
      warmedAt: new Date().toISOString(),
      outages: gemini.outages.length,
      sourceErrors: gemini.errors,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
