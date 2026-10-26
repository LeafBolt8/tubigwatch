import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';

import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { cleanBarangayName } from '@/lib/utils/barangay-name';
import { cityKey } from '@/lib/utils/barangay-geo';
import { findBarangayBySlug } from '@/lib/utils/barangay-slug';
import { computeStatus } from '@/lib/utils/outage-status';
import { deslugify } from '@/lib/utils/slugify';

export const maxDuration = 300;
const DEV = process.env.NODE_ENV !== 'production';

type BarangayPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_ORDER: Record<OutageStatus, number> = {
  active: 0,
  scheduled: 1,
  unknown: 2,
  restored: 3,
  cancelled: 4,
};

function badgeClasses(status: OutageStatus): string {
  switch (status) {
    case 'active':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'scheduled':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'restored':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'cancelled':
    case 'unknown':
      return 'bg-zinc-100 text-zinc-700 border border-zinc-300';
  }
}

function accentClass(status: OutageStatus): string {
  if (status === 'active') return 'border-l-red-500';
  if (status === 'scheduled') return 'border-l-amber-500';
  if (status === 'restored') return 'border-l-emerald-500';
  return 'border-l-zinc-400';
}

function timeframe(outage: Outage): string {
  const start = dateFormatter.format(outage.startsAt);
  return outage.endsAt
    ? `${start} – ${dateFormatter.format(outage.endsAt)}`
    : `${start} – restoration time not provided`;
}

function fixturesFallbackFor(searchParams: Record<string, string | string[] | undefined>): boolean {
  const source = typeof searchParams.source === 'string' ? searchParams.source : undefined;
  return source === 'fixtures' || (DEV && process.env.GEMINI_API_KEY === undefined);
}

export async function generateMetadata({ params, searchParams }: BarangayPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const isFixtures = fixturesFallbackFor(query);
  const outages = isFixtures ? outageFixtures : (await getCachedGeminiOutages()).outages;
  const location = findBarangayBySlug(slug, outages);
  const label = location ? `${location.name}, ${location.city}` : deslugify(slug);

  return {
    title: `Water Outages in ${label} | TubigWatch`,
    description: `Water service advisories affecting ${label}, Metro Manila. Track Maynilad and Manila Water interruptions for this barangay.`,
  };
}

export default async function BarangayPage(props: BarangayPageProps) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const isFixtures = fixturesFallbackFor(searchParams);

  let outages: Outage[];
  let sourceErrors: string[];
  if (isFixtures) {
    outages = outageFixtures;
    sourceErrors = [];
  } else {
    const data = await getCachedGeminiOutages();
    outages = data.outages;
    sourceErrors = data.errors;
  }

  const location = findBarangayBySlug(slug, outages);
  if (!location) notFound();

  const wantedName = cleanBarangayName(location.name);
  const wantedCity = cityKey(location.city);
  const now = new Date();
  const entries = outages
    .filter((outage) =>
      outage.affectedAreas.some((area) =>
        area.barangays.some(
          (barangay) =>
            cleanBarangayName(barangay.name) === wantedName &&
            (!barangay.city || cityKey(barangay.city) === wantedCity),
        ),
      ),
    )
    .map((outage) => ({ outage, status: computeStatus(outage, now) }))
    .sort((a, b) => {
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }
      return a.outage.startsAt.getTime() - b.outage.startsAt.getTime();
    });

  const currentCount = entries.filter(
    (entry) => entry.status === 'active' || entry.status === 'scheduled',
  ).length;

  const fixturesQuery = isFixtures ? '&source=fixtures' : '';
  const mapHref = `/map?barangay=${encodeURIComponent(slug)}${fixturesQuery}`;
  const backHref = isFixtures ? '/?source=fixtures' : '/';

  const summary =
    sourceErrors.length > 0 && entries.length === 0
      ? 'Current service status could not be confirmed.'
      : currentCount > 0
        ? `${currentCount} active or scheduled ${currentCount === 1 ? 'advisory' : 'advisories'}.`
        : entries.length > 0
          ? 'No active or scheduled advisories; past advisories are listed below.'
          : 'No advisories on record.';

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
              {location.name}
            </h1>
            <p className="mt-1 text-xl font-medium text-zinc-600">{location.city}</p>
            <p className="mt-2 text-lg text-zinc-600 leading-relaxed">{summary}</p>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              {isFixtures ? 'Data mode: fixtures (not live)' : 'Source: Maynilad and Manila Water'}
            </p>
          </div>
          <Link
            href={mapHref}
            className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium shadow-sm hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            View on Map
          </Link>
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

      <section aria-label={`Water advisories affecting ${location.name}`} className="space-y-6">
        {entries.length === 0 ? (
          <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-zinc-700 text-lg leading-relaxed">
              {sourceErrors.length > 0
                ? `We could not confirm whether ${location.name} has an active advisory right now.`
                : `No advisories on record for ${location.name}.`}
            </p>
          </div>
        ) : (
          entries.map(({ outage, status }) => (
            <article
              key={outage.id}
              className={`bg-white rounded-2xl shadow-sm border border-slate-200 border-l-[6px] p-6 md:p-8 ${accentClass(
                status,
              )}`}
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
