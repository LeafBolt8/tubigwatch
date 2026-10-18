import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

import FilterPills from '@/components/filter-pills';
import { Suspense } from 'react';

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

function computeStatus(outage: Outage, now: Date): OutageStatus {
  // The ingestion module mostly anchors status to the fetched/parsed status field; fall back to
  // time-based heuristics only when that field is absent so the UI never renders "unknown" silently.
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

function displayBadgeValue(status: OutageStatus): string {
  return status.toUpperCase();
}

function badgeClasses(status: OutageStatus): string {
  // Solid colors, per ARCHITECTURE §5. Text/background pairing checked against WCAG AA at
  // authoring time; no dark: variants in this task (light-only page).
  switch (status) {
    case 'active':
      return 'bg-red-600 text-white';
    case 'scheduled':
      return 'bg-amber-600 text-white';
    case 'restored':
      return 'bg-emerald-700 text-white';
    case 'cancelled':
      return 'bg-zinc-500 text-white';
    case 'unknown':
      return 'bg-zinc-400 text-white';
  }
}

// now is used so localTime is always UTC-safe at display time even when the same Date is passed
// from multiple places; the rendered value still honors Asia/Manila, not the server TZ.
function localTime(date: Date | string | null, now: Date): string {
  if (!date) return 'unknown time';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown time';
  // Defensive: if the page is somehow rendering with a far-future now (shouldn't happen), still
  // format the stored time rather than fabricating one.
  now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function countdownText(outage: Outage, now: Date): string | null {
  if (!outage.endsAt) return null;
  const endsAt = new Date(outage.endsAt);
  if (isNaN(endsAt.getTime())) return null;
  if (endsAt <= now) return null;

  const diffMs = endsAt.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) {
    const mins = Math.round(diffMs / 60_000);
    return `Restores in ~${mins} min`;
  }
  return `Restores in ~${hours} hr`;
}

function freshnessNote(freshness: PageData['freshness'], sourceErrors: Array<string>): string | null {
  if (freshness === 'fresh') return null;
  return sourceErrors.length > 0 ? sourceErrors.join('; ') : freshness;
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

function primaryCityKey(outage: Outage): string {
  // Group label uses the first extracted barangay/city when available, then the outage-level city,
  // then a fallback so the grouping UI never crashes on incomplete rows.
  const firstArea = outage.affectedAreas[0];
  if (firstArea && firstArea.barangays[0]) {
    return firstArea.barangays[0].city ?? outage.city ?? 'Unknown';
  }
  return outage.city ?? 'Unknown';
}

export default async function HomePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
    // In dev without a real key, fall back to fixtures so the page always renders; in prod this
    // branch is dead and the live path will attempt Gemini (and fail with the source error UI if the
    // key is missing at runtime).
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

  // The banner is reserved for a Maynilad failure: Manila Water is intentionally paused for v1 and
  // its notice belongs in a quiet footer line, not an alarm.
  const mayniladError = sourceErrors.find((e) => e.startsWith('maynilad:'));

  const sourceLine =
    isFixtures
      ? `Source: Maynilad · Data mode: fixtures (not live)`
      : `Source: Maynilad · AI Extraction · Last updated: ${now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}`;

  const statusFilter = (searchParams.status as 'all' | 'active' | 'scheduled' | undefined) ?? 'all';
  const filteredOutages =
    statusFilter === 'all'
      ? outages
      : outages.filter((outage) => computeStatus(outage, now) === statusFilter);

  function splitCityKey(raw: string): string {
  // AI sometimes returns combined city strings like "Bacoor City; Imus City".
  // Split on ; or , so a combined label still groups as one combined city line.
  const parts = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  return parts.join(', ');
}

  const groupedByCity = new Map<string, Outage[]>();
  for (const outage of filteredOutages) {
    const firstCity = splitCityKey(primaryCityKey(outage));
    const grouped = groupedByCity.get(firstCity) ?? [];
    grouped.push(outage);
    groupedByCity.set(firstCity, grouped);
  }

  const sortedCities = Array.from(groupedByCity.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-zinc-900 font-[ui-sans-serif-system]-shrink-0 text-[16px] leading-[1.6]">
      <header className="mb-8 border-b border-zinc-200 pb-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">TubigWatch</h1>
        <p className="mt-1 text-lg text-zinc-600">Metro Manila water service advisories</p>
        <p className="mt-4 text-sm text-zinc-400">{sourceLine}</p>
      </header>

      {freshness !== 'fresh' && (
        <p className="mb-6 rounded border border-zinc-300 bg-white px-4 py-3 text-zinc-900">
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

      <p className="mb-6 text-sm font-medium text-zinc-600">
        {active} active · {scheduled} scheduled · {outages.length} total
        {statusUnknown ? ' · some status unknown' : ''}
      </p>

      <Suspense fallback={null}>
        <FilterPills />
      </Suspense>

      {filteredOutages.length === 0 ? (
        <p className="mb-6">
          No outages match the selected filter.
          {freshness !== 'fresh'
            ? ` Source note: ${freshnessNote(freshness, sourceErrors)}.`
            : ''}
        </p>
      ) : (
        <ul className="space-y-12">
          {sortedCities.map((city) => (
            <li key={city}>
              <h2 className="text-xl font-bold mt-8 mb-4 border-b border-zinc-200 pb-2">
                {city ?? 'Unknown'}
              </h2>
              <ul className="space-y-4">                    {groupedByCity.get(city)?.map((outage) => {
                  const status = computeStatus(outage, now);

                  const badge = displayBadgeValue(status);
                  const statusClass = badgeClasses(status);
                  const cities = Array.from(new Set(outage.affectedAreas.flatMap((a) => a.barangays.map((b) => b.city))));
                  const citiesLine = cities.length > 0 ? cities.join(', ') : '';
                  const allBarangays = Array.from(
                    new Set(
                      outage.affectedAreas.flatMap((a) =>
                        a.barangays.flatMap((b) =>
                          b.name.split(/[,;]|\band\b/).map((s) => s.trim()),
                        ),
                      ),
                    ),
                  ).filter(Boolean);
                  const timeRange = [
                    localTime(outage.startsAt ?? null, now),
                    localTime(outage.endsAt ?? null, now),
                  ]
                    .filter((t) => t !== 'unknown time')
                    .join(' - ');
                  return (
                    <li key={outage.id} className="flex flex-col">
                      <article className="bg-white rounded-xl border border-zinc-200 border-l-4 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-zinc-300">
                        <div className="p-5 flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`rounded-sm px-2 py-0.5 text-xs font-bold tracking-wider uppercase ${statusClass}`}>
                              {badge}
                            </span>
                            {timeRange && (
                              <span className="text-sm text-zinc-500 font-medium">{timeRange}</span>
                            )}
                          </div>
                          {outage.reason && <p className="text-lg font-semibold text-zinc-900 mt-3">{outage.reason}</p>}

                          {cities.length > 0 && (
                            <p className="font-medium text-zinc-900 mb-2">{citiesLine}</p>
                          )}

                          {allBarangays.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {allBarangays.map((b) => (
                                <span key={b} className="inline-block bg-zinc-50 text-zinc-700 border border-zinc-200 text-xs px-2.5 py-1 rounded-md">
                                  Brgy. {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {allBarangays.length === 0 && cities.length === 0 && (
                            <p className="text-sm text-zinc-500">Location details unavailable</p>
                          )}

                          {countdownText(outage, now) && (
                            <p className="text-sm text-zinc-700">{countdownText(outage, now)}</p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Verify against mayniladwater.com.ph before relying on this data.
      </footer>

      <p className="text-xs text-zinc-400 mt-8">Note: Manila Water data is temporarily paused.</p>
    </main>
  );
}
