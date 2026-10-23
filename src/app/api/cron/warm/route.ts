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
 * Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project defines it, and any
 * mismatch is rejected. The check is unconditional, so a deployment with no `CRON_SECRET` rejects
 * every caller instead of leaving the route open.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gemini = await getCachedGeminiOutages();

  return NextResponse.json(
    {
      success: true,
      warmedAt: new Date().toISOString(),
      outages: gemini.outages.length,
      sourceErrors: gemini.errors,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
