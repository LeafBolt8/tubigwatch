import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import Link from 'next/link';
import { Map as MapIcon } from 'lucide-react';
import MapClient from '@/components/map-client';

const DEV = process.env.NODE_ENV !== 'production';

type Mode = 'live' | 'fixtures';

type PageData = {
  mode: Mode;
  outages: Outage[];
  freshness: 'fresh' | 'stale' | 'unavailable';
  sourceErrors: Array<string>;
  truncated: boolean;
};

function computeStatus(outage: Outage, now: Date): OutageStatus {
  if (outage.status) return outage.status;

  const startsAt = outage.startsAt ?? null;
  const endsAt = outage.endsAt ?? null;
  if (!startsAt && !endsAt) return 'unknown';

  const started = startsAt !== null && startsAt <= now;
  const ended = endsAt !== null && endsAt <= now;

  if (ended) return 'restored';
  if (outage.scheduled) return 'scheduled';
  if (started) return 'active';
  return 'unknown';
}

function statusCounts(outages: Outage[], now: Date): { active: number; scheduled: number } {
  let active = 0;
  let scheduled = 0;
  for (const o of outages) {
    const s = computeStatus(o, now);
    if (s === 'active') active++;
    else if (s === 'scheduled') scheduled++;
  }
  return { active, scheduled };
}

export const maxDuration = 300;

export default async function MapPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const sourceParam = typeof searchParams.source === 'string' ? searchParams.source : undefined;

  const isFixtures = sourceParam === 'fixtures';
  const now = new Date();

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
    if (process.env.GEMINI_API_KEY === undefined || process.env.GEMINI_API_KEY === '') {
      sourceErrors.push('Gemini API key not configured — AI extraction is unavailable');
    }
    pageData = {
      mode: 'live',
      outages: gemini.outages,
      freshness: 'fresh',
      sourceErrors,
      truncated: false,
    };
  }

  const { outages, freshness, sourceErrors } = pageData;
  const { active, scheduled } = statusCounts(outages, now);
  const statusUnknown = outages.some((o) => computeStatus(o, now) === 'unknown');

  const sourceLine =
    isFixtures
      ? `Source: Maynilad · Data mode: fixtures (not live)`
      : `Source: Maynilad · AI Extraction · Last updated: ${now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <main className="mx-4 my-8 md:mx-auto max-w-5xl px-4 py-8 md:px-8 text-zinc-900 font-[ui-sans-serif-system]-shrink-0 text-[16px] leading-[1.6]">
      <div className="bg-white/95 rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-700">Outage Map</h1>
            <p className="mt-1 text-lg text-zinc-600">Metro Manila water outages by city</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 font-medium hidden md:block">{sourceLine}</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <MapIcon className="w-4 h-4" /> Back to Dashboard
            </Link>
          </div>
        </div>

        <p className="mt-4 border-t border-slate-200 pt-4 text-sm font-medium text-zinc-600">
          {active} active · {scheduled} scheduled · {outages.length} total
          {statusUnknown ? ' · some status unknown' : ''}
        </p>
      </div>

      {freshness !== 'fresh' && (
        <p className="mb-6 rounded-xl border border-slate-300 bg-white/95 px-4 py-3 text-zinc-900">
          Source unavailable: {freshness === 'stale' ? 'stale' : freshness === 'unavailable' ? 'unavailable' : sourceErrors.join('; ')}
        </p>
      )}

      <MapClient outages={outages} />

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-zinc-500">
        Verify against mayniladwater.com.ph before relying on this data.
      </footer>

      <p className="text-xs text-zinc-400 mt-8">Note: Manila Water data is temporarily paused.</p>
    </main>
  );
}
