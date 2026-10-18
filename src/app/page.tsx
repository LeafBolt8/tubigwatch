import { getCachedGeminiOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

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

// Affected-area label: prefer an explicit city when present; otherwise fall back to the locales from
// affectedAreas. Nested barangay names inside `affectedAreas` are typed as opaque area records, so
// we render those records through their textual shape only where a reason/area string is available,
// rather than reaching into undocumented inner keys.
function areaLabel(outage: Outage): string {
  const areas = outage.affectedAreas;
  if (areas.length === 0) return 'Location details unavailable';

  const allCities = new Set<string>();
  const allBarangays: Array<string> = [];
  let firstNote: string | undefined;

  for (const area of areas) {
    for (const barangay of area.barangays) {
      allCities.add(barangay.city);
      allBarangays.push(`Brgy. ${barangay.name}`);
    }
    if (firstNote === undefined && area.notes) {
      firstNote = area.notes;
    }
  }

  const cities = Array.from(allCities).join(', ');
  const shownCount = 3;
  const visible = allBarangays.slice(0, shownCount);
  const remaining = allBarangays.length - shownCount;
  if (visible.length === 0) return 'Location details unavailable';
  const areasLine =
    visible.length === 1
      ? visible[0]
      : `${visible.slice(0, -1).join(', ')} and ${visible[visible.length - 1]}` +
        (remaining > 0 ? `, +${remaining} more` : '');

  return `**City:** ${cities}\n**Areas:** ${areasLine}`;
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

  const sourceLine =
    isFixtures
      ? `Source: Maynilad · Data mode: fixtures (not live)`
      : `Source: Maynilad · AI Extraction · Last updated: ${now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-zinc-900 font-[ui-sans-serif-system]-shrink-0 text-[16px] leading-[1.6]">
      <header className="mb-8 border-b border-zinc-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">TubigWatch</h1>
        <p className="mt-1 text-zinc-600">Metro Manila water service advisories</p>
        <p className="mt-2 text-sm text-zinc-500">{sourceLine}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Data fetched via AI extraction. First load may take up to 80s; subsequent loads are instant.
        </p>
      </header>

      {freshness !== 'fresh' && (
        <p className="mb-6 rounded border border-zinc-300 bg-white px-4 py-3 text-zinc-900">
          Source unavailable: {freshnessNote(freshness, sourceErrors)}
        </p>
      )}

      {sourceErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md my-4">
          <p className="font-bold">Data currently unavailable</p>
          <ul className="list-disc pl-5 mt-1 text-sm">
            {sourceErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mb-6 text-zinc-700">
        {active} active · {scheduled} scheduled · {outages.length} total
        {statusUnknown ? ' · some status unknown' : ''}
      </p>

      {outages.length === 0 ? (
        <p className="mb-6">
          No outages reported.
          {freshness !== 'fresh'
            ? ` Source note: ${freshnessNote(freshness, sourceErrors)}.`
            : ''}
        </p>
      ) : (
        <ul className="space-y-4">
          {outages.map((outage) => {
            const status = computeStatus(outage, now);
            const badge = displayBadgeValue(status);
            const cities = Array.from(new Set(outage.affectedAreas.flatMap((a) => a.barangays.map((b) => b.city))));
            const citiesLine = cities.length > 0 ? cities.join(', ') : '';
            const barangays = Array.from(new Set(outage.affectedAreas.flatMap((a) => a.barangays.map((b) => b.name))));
            return (
              <li key={outage.id} className="rounded border border-zinc-200 bg-white p-4 shadow-sm">
                <article className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeClasses(status)}`}>
                      {badge}
                    </span>
                    <span className="text-sm text-zinc-600">{areaLabel(outage)}</span>
                  </div>
                  {outage.reason && <p className="text-sm text-zinc-600">{outage.reason}</p>}
                  <div className="text-sm text-zinc-700 mt-2 space-y-1">
                    {cities.length > 0 && (
                      <p className="mt-1"><strong className="text-zinc-900">City:</strong> {citiesLine}</p>
                    )}
                    {barangays.length > 0 && (
                      <p className="mt-1">
                        <strong className="text-zinc-900">Areas:</strong>{' '}
                        {barangays.slice(0, 3).map(b => `Brgy. ${b}`).join(', ')}
                        {barangays.length > 3 && ` (+${barangays.length - 3} more)`}
                      </p>
                    )}
                    {barangays.length === 0 && cities.length === 0 && (
                      <p className="mt-1 text-zinc-500">Location details unavailable</p>
                    )}
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
                    <div className="flex gap-x-2">
                      <dt className="text-zinc-500">From</dt>
                      <dd>{localTime(outage.startsAt ?? null, now)}</dd>
                    </div>
                    <div className="flex gap-x-2">
                      <dt className="text-zinc-500">To</dt>
                      <dd>{localTime(outage.endsAt ?? null, now)}</dd>
                    </div>
                  </dl>
                  {countdownText(outage, now) && (
                    <p className="text-sm text-zinc-700">{countdownText(outage, now)}</p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Verify against mayniladwater.com.ph before relying on this data.
      </footer>
    </main>
  );
}
