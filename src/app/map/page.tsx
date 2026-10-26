import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import { findBarangayBySlug } from '@/lib/utils/barangay-slug';
import { getCityCoords } from '@/lib/utils/geo';
import { computeStatus } from '@/lib/utils/outage-status';
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
  const barangayParam =
    typeof searchParams.barangay === 'string' ? searchParams.barangay : undefined;
  // Resolve against the full dataset: a restored row is not drawn, but its barangay page can still
  // hand off to the map and expect the right city centre.
  const barangaySpot = barangayParam ? findBarangayBySlug(barangayParam, outages) : null;
  const handoffCenter = barangaySpot?.city ? getCityCoords(barangaySpot.city) : undefined;

  const visibleOutages = outages.filter((o) => {
    const status = computeStatus(o, now);
    return status === 'active' || status === 'scheduled' || status === 'unknown';
  });
  const { active, scheduled } = statusCounts(visibleOutages, now);
  const statusUnknown = visibleOutages.some((o) => computeStatus(o, now) === 'unknown');

  const sourceLine =
    isFixtures
      ? `Source: Maynilad + Manila Water · Data mode: fixtures (not live)`
      : `Source: Maynilad · AI Extraction · Updated: ${now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <main className="mx-4 my-8 md:mx-auto max-w-[90rem] px-4 py-8 md:px-8 text-zinc-900 text-[16px] leading-relaxed">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-blue-700">Outage Map</h1>
            <p className="mt-2 text-xl text-zinc-600 leading-relaxed">Metro Manila water outages by city</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 font-medium hidden md:block">{sourceLine}</span>
            <Link
              href={isFixtures ? '/?source=fixtures' : '/'}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 text-white rounded-lg text-base font-medium shadow-sm hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <MapIcon className="w-5 h-5" /> Back to Dashboard
            </Link>
          </div>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-4 text-sm font-medium text-zinc-600 leading-relaxed">
          {active} active · {scheduled} scheduled · {visibleOutages.length} total
          {statusUnknown ? ' · some status unknown' : ''}
        </p>
      </div>

      {freshness !== 'fresh' && (
        <p className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-zinc-900 leading-relaxed">
          Source unavailable: {freshness === 'stale' ? 'stale' : freshness === 'unavailable' ? 'unavailable' : sourceErrors.join('; ')}
        </p>
      )}

      <MapClient
        outages={visibleOutages}
        initialCenter={handoffCenter}
        highlightedBarangay={barangaySpot?.name}
      />

      <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-zinc-500 text-center">
        <p className="mb-2">
          Unofficial aggregator. Always verify with{' '}
          <a
            href="https://www.mayniladwater.com.ph/service-advisories-2/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600"
          >
            Maynilad
          </a>{' '}
          or{' '}
          <a
            href="https://www.manilawater.com/customers/service-advisories"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600"
          >
            Manila Water
          </a>{' '}
          before relying on this data.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/privacy" className="hover:text-blue-600 transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <a href="mailto:hello@tubigwatch.app" className="hover:text-blue-600 transition-colors">
            Send Feedback
          </a>
        </div>
      </footer>

    </main>
  );
}
