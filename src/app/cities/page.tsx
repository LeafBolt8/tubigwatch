import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';

import { getHistoricalOutages } from '@/lib/cache/history';
import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import { buildCityDirectory } from '@/lib/utils/city-directory';
import { canonicalCityName, citySlug } from '@/lib/utils/city-name';
import { CITY_COORDS } from '@/lib/utils/geo';

import CitiesDirectory, { type CityDirectoryRow } from './cities-directory';

// The directory is derived from the Redis snapshot and the archive, both of which change without a
// deploy, so it must not be frozen at build time.
export const dynamic = 'force-dynamic';

const DEV = process.env.NODE_ENV !== 'production';

export const metadata: Metadata = {
  title: 'City Directory | TubigWatch',
  description:
    'Browse every Metro Manila city with current and historical water outage status from Maynilad and Manila Water.',
  alternates: { canonical: '/cities' },
  openGraph: {
    title: 'City Directory | TubigWatch',
    description:
      'Browse every Metro Manila city with current and historical water outage status from Maynilad and Manila Water.',
    url: '/cities',
    siteName: 'TubigWatch',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'City Directory | TubigWatch',
    description:
      'Browse every Metro Manila city with current and historical water outage status from Maynilad and Manila Water.',
  },
};

type CitiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CitiesPage({ searchParams }: CitiesPageProps) {
  const params = await searchParams;
  const sourceParam = typeof params.source === 'string' ? params.source : undefined;
  const isFixtures = sourceParam === 'fixtures';

  // Same fallback rule as the city page, so the two pages show the same dataset in fixtures mode.
  const fixturesFallback = isFixtures || (DEV && process.env.GEMINI_API_KEY === undefined);

  let source: Outage[];
  if (fixturesFallback) {
    source = outageFixtures;
  } else {
    const live = (await getCachedGeminiOutages()).outages;
    const archive = await getHistoricalOutages();
    // A cold deploy has no archive yet; the live snapshot must still produce a directory.
    source = archive.length > 0 ? archive : live;
  }

  const entries = buildCityDirectory(source, new Date());

  // The city page resolves labels against CITY_COORDS plus the labels in its own dataset, so the
  // directory must use that same list or it would drop archive-only cities that do have a page.
  const knownNames = [...Object.keys(CITY_COORDS), ...entries.map((entry) => entry.city)];
  const fixturesParam = isFixtures ? '?source=fixtures' : '';

  const rows: CityDirectoryRow[] = [];
  for (const entry of entries) {
    // `citySlug` is the single slug rule, so the directory link and the sitemap cannot drift.
    const canonical = canonicalCityName(citySlug(entry.city), knownNames);

    // A row whose label cannot become a /city/[slug] URL would only lead to a 404.
    if (canonical === null) continue;

    rows.push({ ...entry, href: `/city/${citySlug(canonical)}${fixturesParam}` });
  }

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
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
          <MapPin className="w-8 h-8 text-blue-600" aria-hidden="true" />
          Cities
        </h1>
        <p className="mt-2 text-xl text-zinc-600 leading-relaxed">
          Every city with a water advisory on record, including past ones. Pick a city to see its
          outage history.
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          {isFixtures
            ? 'Data mode: fixtures (not live)'
            : `${rows.length} ${rows.length === 1 ? 'city' : 'cities'} on record.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-zinc-700 text-lg leading-relaxed">
            No city history available right now.
          </p>
          <Link
            href={backHref}
            className="mt-4 inline-block rounded-lg text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <CitiesDirectory entries={rows} />
      )}
    </main>
  );
}
