'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type CityDirectoryRow = {
  city: string;
  cityKey: string;
  slug: string;
  activeCount: number;
  scheduledCount: number;
  lastOutageAt: number | null;
  href: string;
};

const lastOutageFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'Asia/Manila',
});

function normalizeCity(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** One label per row, so a quiet city reads as quiet instead of showing a zero count.
 * A row can be both active and scheduled at once, which is why those two are not an either/or.
 */
function statusLabel(entry: CityDirectoryRow): string {
  if (entry.activeCount > 0 && entry.scheduledCount > 0) {
    return `${entry.activeCount} active · ${entry.scheduledCount} scheduled`;
  }
  if (entry.activeCount > 0) return `${entry.activeCount} active`;
  if (entry.scheduledCount > 0) return `${entry.scheduledCount} scheduled`;
  return 'Quiet';
}

function statusPillClass(entry: CityDirectoryRow): string {
  if (entry.activeCount > 0) return 'border-red-200 bg-red-50 text-red-700';
  if (entry.scheduledCount > 0) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

type Filter = 'all' | 'active' | 'scheduled' | 'quiet';

const FILTER_CLASSES =
  'inline-flex w-full sm:w-auto items-center justify-center rounded-lg px-2 sm:px-6 py-2.5 text-base sm:text-lg font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors';

function filterPillClass(selected: boolean, textClass: string): string {
  return selected
    ? `${FILTER_CLASSES} bg-white text-zinc-900 shadow-sm`
    : `${FILTER_CLASSES} text-zinc-600 hover:text-zinc-900 ${textClass}`;
}

type Props = {
  entries: CityDirectoryRow[];
};

export default function CitiesDirectory({ entries }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeCity(query);
    return entries.filter((entry) => {
      if (normalizedQuery && !normalizeCity(entry.city).includes(normalizedQuery)) return false;

      if (filter === 'active') return entry.activeCount > 0;
      if (filter === 'scheduled') return entry.scheduledCount > 0 && entry.activeCount === 0;
      if (filter === 'quiet') return entry.activeCount === 0 && entry.scheduledCount === 0;
      return true;
    });
  }, [entries, query, filter]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <input
          type="search"
          aria-label="Search cities"
          placeholder="Search cities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full rounded-xl border border-transparent bg-slate-50 py-3 pl-12 pr-4 text-lg leading-6 placeholder-zinc-500 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div
          role="group"
          aria-label="Filter by status"
          className="flex flex-wrap gap-1 rounded-lg bg-slate-200/60 p-1"
        >
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
            className={filterPillClass(filter === 'all', 'text-zinc-900')}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={filter === 'active'}
            onClick={() => setFilter('active')}
            className={filterPillClass(filter === 'active', 'text-red-700')}
          >
            Active
          </button>
          <button
            type="button"
            aria-pressed={filter === 'scheduled'}
            onClick={() => setFilter('scheduled')}
            className={filterPillClass(filter === 'scheduled', 'text-amber-700')}
          >
            Scheduled
          </button>
          <button
            type="button"
            aria-pressed={filter === 'quiet'}
            onClick={() => setFilter('quiet')}
            className={filterPillClass(filter === 'quiet', 'text-slate-700')}
          >
            Quiet
          </button>
        </div>
      </div>

      {filtered.length === 0 && entries.length > 0 ? (
        <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-zinc-500 text-lg leading-relaxed">No cities match your search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            className="mt-4 rounded-lg text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((entry) => (
            <li
              key={entry.cityKey}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm"
            >
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={entry.href}
                    className="rounded text-lg font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    {entry.city}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-500">
                    {entry.lastOutageAt === null
                      ? 'No dated advisory'
                      : `Last outage ${lastOutageFormatter.format(new Date(entry.lastOutageAt))}`}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center self-start rounded-full border px-3 py-1 text-sm font-semibold sm:self-auto ${statusPillClass(entry)}`}
                >
                  {statusLabel(entry)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
