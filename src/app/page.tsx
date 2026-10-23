import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';

import { Suspense } from 'react';

import Dashboard from '@/components/dashboard';

export const maxDuration = 300;
const DEV = process.env.NODE_ENV !== 'production';

type Mode = 'live' | 'fixtures';

type PageData = {
  mode: Mode;
  outages: Outage[];
  freshness: 'fresh' | 'stale' | 'unavailable';
  sourceErrors: Array<string>;
  truncated: boolean;
};



function freshnessNote(freshness: PageData['freshness'], sourceErrors: Array<string>): string | null {
  if (freshness === 'fresh') return null;
  return sourceErrors.length > 0 ? sourceErrors.join('; ') : freshness;
}

export default async function HomePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const sourceParam = typeof searchParams.source === 'string' ? searchParams.source : undefined;

  const isFixtures = sourceParam === 'fixtures';

  let pageData: PageData;
  if (isFixtures) {
    pageData = {
      mode: 'fixtures',
      outages: outageFixtures,
      freshness: 'fresh',
      sourceErrors: ['fixtures mode — not live data'],
      truncated: false,
    };
  } else if (DEV && process.env.GEMINI_API_KEY === undefined) {
    pageData = {
      mode: 'fixtures',
      outages: outageFixtures,
      freshness: 'fresh',
      sourceErrors: ['fixtures mode — not live data (dev fallback, no GEMINI_API_KEY)'],
      truncated: false,
    };
  } else {
    const gemini = await getCachedGeminiOutages();
    const sourceErrors: Array<string> = [];
    for (const err of gemini.errors) {
      sourceErrors.push(err);
    }
    pageData = {
      mode: 'live',
      outages: gemini.outages,
      freshness: sourceErrors.length > 0 ? 'stale' : 'fresh',
      sourceErrors,
      truncated: false,
    };
  }

  const { outages, freshness, sourceErrors } = pageData;

  const mayniladError = sourceErrors.find(
    (e) =>
      e.startsWith('maynilad:') ||
      e.startsWith('WARNING:') ||
      e.startsWith('Database connection failed.'),
  );
  const sourceLabel = isFixtures ? 'Source: Maynilad + Manila Water · Data mode: fixtures (not live)' : undefined;

  return (
    <main className="mx-4 my-8 md:mx-auto max-w-7xl px-4 py-8 md:px-8 text-zinc-900 text-[16px] leading-[1.6]">
      {freshness !== 'fresh' && (
        <p className="mb-6 rounded border border-slate-300 bg-white px-4 py-3 text-zinc-900">
          Source unavailable: {freshnessNote(freshness, sourceErrors)}
        </p>
      )}

      {mayniladError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md my-4">
          <p className="font-bold">Data currently unavailable</p>
          <ul className="list-disc pl-5 mt-1 text-sm">
            <li>{mayniladError}</li>
          </ul>
        </div>
      )}

      <Suspense fallback={<p>Loading...</p>}>
        <Dashboard outages={outages} sourceErrors={sourceErrors} sourceLabel={sourceLabel} />
      </Suspense>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-zinc-500">
        Verify against mayniladwater.com.ph before relying on this data.
      </footer>
    </main>
  );
}
