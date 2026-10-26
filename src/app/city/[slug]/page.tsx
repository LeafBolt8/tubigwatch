import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';

import EnablePush from '@/components/enable-push';
import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { cityKey } from '@/lib/utils/barangay-geo';
import { canonicalCityName } from '@/lib/utils/city-name';
import { computeStatus } from '@/lib/utils/outage-status';
import { CITY_COORDS } from '@/lib/utils/geo';
import { deslugify } from '@/lib/utils/slugify';

export const maxDuration = 300;
const DEV = process.env.NODE_ENV !== 'production';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tubigwatch.vercel.app';

type CityPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function cityNamesIn(outages: Outage[]): string[] {
  const names = new Set<string>();
  for (const outage of outages) {
    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        if (barangay.city) names.add(barangay.city);
      }
    }
  }
  return [...names];
}

function badgeClasses(status: Extract<OutageStatus, 'active' | 'scheduled'>): string {
  return status === 'active'
    ? 'bg-red-50 text-red-700 border border-red-200'
    : 'bg-amber-50 text-amber-700 border border-amber-200';
}

function timeframe(outage: Outage): string {
  const start = dateFormatter.format(outage.startsAt);
  return outage.endsAt
    ? `${start} – ${dateFormatter.format(outage.endsAt)}`
    : `${start} – restoration time not provided`;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const cityName = canonicalCityName(slug) ?? deslugify(slug);
  const title = `Water Outages in ${cityName} | TubigWatch`;
  const description = `Live water service advisories and scheduled maintenance for ${cityName}, Metro Manila. Track Maynilad and Manila Water outages in real time.`;
  const canonicalUrl = `${SITE_URL}/city/${slug}`;

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

  const cityName = canonicalCityName(slug, [...Object.keys(CITY_COORDS), ...cityNamesIn(outages)]);
  if (!cityName) notFound();

  const wantedCity = cityKey(cityName);
  const now = new Date();
  const cityOutages = outages
    .filter(
      (outage) =>
        outage.affectedAreas.some((area) =>
          area.barangays.some((barangay) => barangay.city && cityKey(barangay.city) === wantedCity),
        ) || (outage.city !== undefined && cityKey(outage.city) === wantedCity),
    )
    .map((outage) => ({ outage, status: computeStatus(outage, now) }))
    .filter(
      (
        entry,
      ): entry is { outage: Outage; status: Extract<OutageStatus, 'active' | 'scheduled'> } =>
        entry.status === 'active' || entry.status === 'scheduled',
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.outage.startsAt.getTime() - b.outage.startsAt.getTime();
    });

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
              {cityOutages.length === 0
                ? sourceErrors.length > 0
                  ? 'Current service status could not be confirmed.'
                  : 'No active or scheduled advisories reported.'
                : `${cityOutages.length} active or scheduled ${
                    cityOutages.length === 1 ? 'advisory' : 'advisories'
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

      <section aria-label={`Water advisories affecting ${cityName}`} className="space-y-6">
        {cityOutages.length === 0 ? (
          <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-zinc-700 text-lg leading-relaxed">
              {sourceErrors.length > 0
                ? `We could not confirm whether ${cityName} has an active advisory right now.`
                : `No active or scheduled advisories reported for ${cityName}.`}
            </p>
          </div>
        ) : (
          cityOutages.map(({ outage, status }) => (
            <article
              key={outage.id}
              className={`bg-white rounded-2xl shadow-sm border border-slate-200 border-l-[6px] p-6 md:p-8 ${
                status === 'active' ? 'border-l-red-500' : 'border-l-amber-500'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-base font-bold uppercase tracking-wider ${badgeClasses(
                      status,
                    )}`}
                  >
                    {status}
                  </span>
                  <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-zinc-600 bg-zinc-100">
                    {outage.concessionaire === 'manila-water' ? 'Manila Water' : 'Maynilad'}
                  </span>
                </div>
                <span className="text-base font-medium text-zinc-600 tabular-nums">
                  {timeframe(outage)}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold text-zinc-900">{outage.reason}</h2>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
