'use client';

import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { useState } from 'react';
import { Search } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'scheduled';

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

function displayBadgeValue(status: OutageStatus): string {
  return status.toUpperCase();
}

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

function badgeDotColor(status: OutageStatus): string {
  switch (status) {
    case 'active':
      return 'bg-red-500';
    case 'scheduled':
      return 'bg-amber-500';
    case 'restored':
      return 'bg-emerald-500';
    case 'cancelled':
    case 'unknown':
      return 'bg-zinc-400';
  }
}

function localTime(date: Date | string | null, now: Date): string {
  if (!date) return 'unknown time';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown time';
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
  const firstArea = outage.affectedAreas[0];
  if (firstArea && firstArea.barangays[0]) {
    return firstArea.barangays[0].city ?? outage.city ?? 'Unknown';
  }
  return outage.city ?? 'Unknown';
}

function splitCityKey(raw: string): string {
  const parts = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  return parts.join(', ');
}

function pillClasses(status: StatusFilter, value: StatusFilter): string {
  const active = status === value;
  return active
    ? 'bg-white text-zinc-900 shadow-sm rounded-md px-4 py-1.5 text-sm font-medium'
    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-md px-4 py-1.5 text-sm font-medium transition-all';
}

type DashboardProps = {
  outages: Outage[];
  sourceErrors: Array<string>;
};

export default function Dashboard({ outages, sourceErrors }: DashboardProps) {
  const now = new Date();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const mayniladError = sourceErrors.find((e) => e.startsWith('maynilad:'));

  const filteredOutages = outages.filter((outage) => {
    const matchesStatus = statusFilter === 'all' || computeStatus(outage, now) === statusFilter;

    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const reasonMatch = outage.reason.toLowerCase().includes(query);
    const cityMatch = outage.affectedAreas.some((area) =>
      area.barangays.some((b) => b.city?.toLowerCase().includes(query)),
    );
    const barangayMatch = outage.affectedAreas.some((area) =>
      area.barangays.some((b) => b.name.toLowerCase().includes(query)),
    );

    return reasonMatch || cityMatch || barangayMatch;
  });

  const { active, scheduled } = statusCounts(outages, now);
  const statusUnknown = outages.some((o) => computeStatus(o, now) === 'unknown');

  const groupedByCity = new Map<string, Outage[]>();
  for (const outage of filteredOutages) {
    const firstCity = splitCityKey(primaryCityKey(outage));
    const grouped = groupedByCity.get(firstCity) ?? [];
    grouped.push(outage);
    groupedByCity.set(firstCity, grouped);
  }

  const sortedCities = Array.from(groupedByCity.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <>
      {mayniladError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md my-4">
          <p className="font-bold">Data currently unavailable</p>
          <ul className="list-disc pl-5 mt-1 text-sm">
            <li>{mayniladError}</li>
          </ul>
        </div>
      )}

      <div className="mb-6 text-sm font-medium text-zinc-600">
        {active} active · {scheduled} scheduled · {outages.length} total
        {statusUnknown ? ' · some status unknown' : ''}
      </div>

      <div className="relative mt-6 mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-zinc-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-zinc-300 rounded-lg leading-5 bg-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
          placeholder="Search by city, barangay, or reason (e.g., 'Quezon City' or 'Baesa')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="inline-flex p-1 space-x-1 bg-slate-200 rounded-lg mt-6 mb-2">
        <button
          type="button"
          className={pillClasses(statusFilter, 'all')}
          onClick={() => setStatusFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={pillClasses(statusFilter, 'active')}
          onClick={() => setStatusFilter('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={pillClasses(statusFilter, 'scheduled')}
          onClick={() => setStatusFilter('scheduled')}
        >
          Scheduled
        </button>
      </div>

      {filteredOutages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-zinc-200 mt-6">
          <p className="text-zinc-500 text-lg">No outages found matching your criteria.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="mt-4 text-blue-600 font-medium hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-12">
          {sortedCities.map((city) => (
            <li key={city}>
              <h2 className="text-xl font-bold text-zinc-800 border-b border-zinc-200 pb-2 mb-4">
                {city ?? 'Unknown'}
              </h2>
              <ul className="space-y-4">
                {groupedByCity.get(city)?.map((outage) => {
                  const status = computeStatus(outage, now);

                  const badge = displayBadgeValue(status);
                  const statusClass = badgeClasses(status);
                  const dotClass = badgeDotColor(status);
                  const cities = Array.from(
                    new Set(outage.affectedAreas.flatMap((a) => a.barangays.map((b) => b.city))),
                  );
                  const citiesLine = cities.length > 0 ? cities.join(', ') : '';
                  const allBarangays = Array.from(
                    new Set(
                      outage.affectedAreas.flatMap((a) =>
                        a.barangays.flatMap((b) => b.name.split(/[,;]|\band\b/).map((s) => s.trim())),
                      ),
                    ),
                  ).filter(Boolean);
                  const timeRange = [localTime(outage.startsAt ?? null, now), localTime(outage.endsAt ?? null, now)]
                    .filter((t) => t !== 'unknown time')
                    .join(' - ');

                  return (
                    <li key={outage.id} className="flex flex-col">
                      <article
                        className={`bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden transition-all hover:shadow-md border-l-4 ${
                          status === 'active'
                            ? 'border-l-red-500'
                            : status === 'scheduled'
                              ? 'border-l-amber-500'
                              : status === 'restored'
                                ? 'border-l-emerald-500'
                                : 'border-l-zinc-400'
                        }`}
                      >
                        <div className="p-5 flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${statusClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                              {badge}
                            </span>
                            {timeRange && (
                              <span className="text-sm text-zinc-500 font-medium">{timeRange}</span>
                            )}
                          </div>

                          {outage.reason && (
                            <p className="text-lg font-semibold text-zinc-900 mt-3">{outage.reason}</p>
                          )}

                          {cities.length > 0 && (
                            <p className="font-medium text-zinc-900 mb-2">{citiesLine}</p>
                          )}

                          {allBarangays.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {allBarangays.map((b) => (
                                <span
                                  key={b}
                                  className="inline-block bg-zinc-100 text-zinc-600 text-[11px] px-2 py-0.5 rounded"
                                >
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
    </>
  );
}
