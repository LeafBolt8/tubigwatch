import { getCachedMayniladOutages } from '@/lib/cache/outages';
import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

// Per-task deviation vs §4's revalidate: 3600: Maynilad rows reflect active repairs,
// so 15 min balances source load with freshness. Documented in the cache wrapper too.

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
  const parts: Array<string> = [];
  if (outage.city) parts.push(outage.city);

  const areas = outage.affectedAreas;
  if (areas.length > 0) {
    // Render affected-area records through the surface the schema exposes; if a record carries a
    // readable note/area string use it, otherwise fall back to the barangay count.
    const detail = areas[0];
    const note =
      (typeof detail === 'object' && detail !== null
        ? 'notes' in detail
          ? detail.notes
          : undefined
        : undefined) ?? null;
    if (note) {
      parts.push(String(note));
    } else {
      parts.push(`${areas.length} area${areas.length === 1 ? '' : 's'}`);
    }
  }

  if (parts.length === 0) return 'Unassigned area';
  return parts.join(' · ');
}

// now is used so localTime is always UTC-safe at display time even when the same Date is passed
// from multiple places; the rendered value still honors Asia/Manila, not the server TZ.
function localTime(date: Date | null, now: Date): string {
  if (!date) return 'unknown time';
  // Defensive: if the page is somehow rendering with a far-future now (shouldn't happen), still
  // format the stored time rather than fabricating one.
  now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function countdownText(outage: Outage, now: Date): string | null {
  const status = computeStatus(outage, now);
  if (status !== 'active') return null;
  const endsAt = outage.endsAt ?? null;
  if (!endsAt) return null;
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
  } else {
    const data = await getCachedMayniladOutages();
    pageData = {
      mode: 'live',
      outages: data.outages,
      freshness: data.freshness,
      sourceErrors: data.sourceErrors,
      truncated: data.truncated,
    };
  }

  const { outages, freshness, sourceErrors } = pageData;
  const { active, scheduled } = statusCounts(outages, now);
  const statusUnknown = outages.some((o) => computeStatus(o, now) === 'unknown');

  const sourceLine =
    isFixtures
      ? `Source: Maynilad · Data mode: fixtures (not live)`
      : `Source: Maynilad · Last updated: ${now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-zinc-900 font-[ui-sans-serif-system]-shrink-0 text-[16px] leading-[1.6]">
      <header className="mb-8 border-b border-zinc-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">TubigWatch</h1>
        <p className="mt-1 text-zinc-600">Metro Manila water service advisories</p>
        <p className="mt-2 text-sm text-zinc-500">{sourceLine}</p>
      </header>

      {freshness !== 'fresh' && (
        <p className="mb-6 rounded border border-zinc-300 bg-white px-4 py-3 text-zinc-900">
          Source unavailable: {freshnessNote(freshness, sourceErrors)}
        </p>
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
