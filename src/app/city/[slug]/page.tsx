import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { Redis } from '@upstash/redis';
import { ArrowLeft, MapPin } from 'lucide-react';

import EnablePush from '@/components/enable-push';
import OutageCard from '@/components/outage-card';
import OutageTrendChart from '@/components/outage-trend-chart';
import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { OutageSchema, type Outage } from '@/lib/schemas/outage';
import { cityKey } from '@/lib/utils/barangay-geo';
import {
  canonicalCityName,
  citySlug,
  outageAffectsCity as affectsCity,
  rawCityLabelsInOutages,
} from '@/lib/utils/city-name';
import { computeStatus } from '@/lib/utils/outage-status';
import { CITY_COORDS } from '@/lib/utils/geo';

export const maxDuration = 300;
const DEV = process.env.NODE_ENV !== 'production';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tubigwatch.vercel.app';

type CityPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const longDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
});

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type CityDateGroup = {
  key: string;
  label: string;
  chartLabel: string;
  timestamp: number;
  outages: Outage[];
};

async function readHistoricalOutages(fallback: Outage[]): Promise<Outage[]> {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
    });
    const stored = await redis.get<unknown>('historical-outages');
    const parsed = OutageSchema.array().safeParse(stored ?? []);

    if (!parsed.success || parsed.data.length === 0) return fallback;
    return parsed.data;
  } catch (error) {
    console.warn('Could not read historical outages; falling back to the live snapshot.', error);
    return fallback;
  }
}

/**
 * One dataset read per request: generateMetadata and the page both need it, and without this each
 * would hit Redis on its own.
 */
const loadCityDataset = cache(async (fixturesFallback: boolean) => {
  let outages: Outage[];
  let sourceErrors: string[];
  let fetchedAt: number;
  if (fixturesFallback) {
    outages = outageFixtures;
    sourceErrors = [];
    // Fixture mode has no scrape timestamp; the header renders the data-mode label instead.
    fetchedAt = 0;
  } else {
    const data = await getCachedGeminiOutages();
    outages = data.outages;
    sourceErrors = data.errors;
    fetchedAt = data.fetchedAt;
  }

  const historySource = fixturesFallback ? outages : await readHistoricalOutages(outages);
  return { outages, sourceErrors, fetchedAt, historySource };
});

function resolveCityName(slug: string, outages: Outage[], historySource: Outage[]): string | null {
  return canonicalCityName(slug, [
    ...Object.keys(CITY_COORDS),
    ...rawCityLabelsInOutages(outages),
    ...rawCityLabelsInOutages(historySource),
  ]);
}

export async function generateMetadata({
  params,
  searchParams,
}: CityPageProps): Promise<Metadata> {
  const [{ slug }, resolvedSearch] = await Promise.all([params, searchParams]);
  const sourceParam =
    typeof resolvedSearch.source === 'string' ? resolvedSearch.source : undefined;
  const fixturesFallback =
    sourceParam === 'fixtures' || (DEV && process.env.GEMINI_API_KEY === undefined);
  const { outages, historySource } = await loadCityDataset(fixturesFallback);

  // Resolve before the body streams: an unresolvable slug must answer a real 404, not a 200 shell.
  const cityName = resolveCityName(slug, outages, historySource);
  if (cityName === null) notFound();

  const title = `Water Outages in ${cityName} | TubigWatch`;
  const description = `Live water service advisories and scheduled maintenance for ${cityName}, Metro Manila. Track Maynilad and Manila Water outages in real time.`;
  const canonicalUrl = `${SITE_URL}/city/${citySlug(cityName)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'TubigWatch',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function CityPage(props: CityPageProps) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const sourceParam = typeof searchParams.source === 'string' ? searchParams.source : undefined;
  const isFixtures = sourceParam === 'fixtures';

  const fixturesFallback = isFixtures || (DEV && process.env.GEMINI_API_KEY === undefined);

  const { outages, sourceErrors, fetchedAt, historySource } = await loadCityDataset(fixturesFallback);

  // Raw labels are part of the vocabulary so an archive-only city still resolves to a page.
  const cityName = resolveCityName(slug, outages, historySource);
  if (cityName === null) notFound();

  // One canonical URL per city: a legacy comma slug answers 308 and keeps its query string.
  const expectedSlug = citySlug(cityName);
  if (slug !== expectedSlug) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value)) for (const item of value) query.append(key, item);
    }
    const queryString = query.toString();
    permanentRedirect(`/city/${expectedSlug}${queryString ? `?${queryString}` : ''}`);
  }

  const wantedCity = cityKey(cityName);
  const now = new Date();
  const cityOutages = historySource
    .filter((outage) => affectsCity(outage, wantedCity))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  const currentCount = cityOutages.filter((outage) => {
    const status = computeStatus(outage, now);
    return status === 'active' || status === 'scheduled';
  }).length;

  const dateGroupsByKey = new Map<string, CityDateGroup>();
  for (const outage of cityOutages) {
    const startsAt = new Date(outage.startsAt);
    const timestamp = startsAt.getTime();
    if (Number.isNaN(timestamp)) continue;

    const key = dateKeyFormatter.format(startsAt);
    const existing = dateGroupsByKey.get(key);
    if (existing) {
      existing.outages.push(outage);
      existing.timestamp = Math.max(existing.timestamp, timestamp);
      continue;
    }

    dateGroupsByKey.set(key, {
      key,
      label: longDateFormatter.format(startsAt),
      chartLabel: shortDateFormatter.format(startsAt),
      timestamp,
      outages: [outage],
    });
  }

  const dateGroups = Array.from(dateGroupsByKey.values()).sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  for (const group of dateGroups) {
    group.outages.sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  }

  const chartData = [...dateGroups]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((group) => ({ date: group.chartLabel, count: group.outages.length }));

  const fixturesParam = isFixtures ? '&source=fixtures' : '';
  const mapHref = `/map?city=${encodeURIComponent(cityName)}${fixturesParam}`;
  const backHref = isFixtures ? '/?source=fixtures' : '/';

  return (
    <main className="mx-4 my-8 md:mx-auto max-w-5xl px-4 py-8 md:px-8 text-zinc-900 text-[16px] leading-[1.6]">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 rounded-lg text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 mb-6"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Dashboard
      </Link>

      <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
              <MapPin className="w-8 h-8 text-blue-600" aria-hidden="true" />
              {cityName}
            </h1>
            <p className="mt-2 text-xl text-zinc-600 leading-relaxed">
              {currentCount === 0
                ? sourceErrors.length > 0
                  ? 'Current service status could not be confirmed.'
                  : cityOutages.length > 0
                    ? 'No active or scheduled advisories; past advisories are listed below.'
                    : 'No active or scheduled advisories reported.'
                : `${currentCount} active or scheduled ${
                    currentCount === 1 ? 'advisory' : 'advisories'
                  }.`}
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              {isFixtures
                ? 'Data mode: fixtures (not live)'
                : sourceErrors.length > 0
                  ? 'Some sources could not be reached.'
                  : `Updated ${timeFormatter.format(new Date(fetchedAt))}`}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <EnablePush />
            <Link
              href={mapHref}
              className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium shadow-sm hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              View on Map
            </Link>
          </div>
        </div>
      </header>

      {!isFixtures && sourceErrors.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Some sources could not be checked.</p>
          <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
            {sourceErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <section aria-label={`Water advisories affecting ${cityName}`}>
        {dateGroups.length === 0 ? (
          <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-zinc-700 text-lg leading-relaxed">
              {sourceErrors.length > 0
                ? `We could not confirm whether ${cityName} has an active advisory right now.`
                : `No active or scheduled advisories reported for ${cityName}.`}
            </p>
          </div>
        ) : (
          dateGroups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-4 mt-10 mb-6">
                <h2 className="text-2xl font-bold text-slate-900 whitespace-nowrap">
                  {group.label}
                </h2>
                <div className="h-px bg-slate-300 w-full"></div>
              </div>
              <div className="space-y-6">
                {group.outages.map((outage) => (
                  <OutageCard key={outage.id} outage={outage} now={now} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <OutageTrendChart data={chartData} />
    </main>
  );
}
