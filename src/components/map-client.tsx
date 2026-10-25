'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { Outage } from '@/lib/schemas/outage';
import { computeStatus } from '@/lib/utils/outage-status';

const OutageMap = dynamic(
  () => import('@/components/outage-map'),
  { ssr: false, loading: () => <p className="text-zinc-500">Loading map...</p> },
);

type StatusFilter = 'all' | 'active' | 'scheduled';
type ProviderFilter = 'all' | 'maynilad' | 'manila-water';

// A hand-edited or truncated share link must fall back to the unfiltered view instead of
// rendering no selected pill and an empty map.
function parseStatusFilter(raw: string | null): StatusFilter {
  return raw === 'active' || raw === 'scheduled' ? raw : 'all';
}

function parseProviderFilter(raw: string | null): ProviderFilter {
  return raw === 'maynilad' || raw === 'manila-water' ? raw : 'all';
}

type FilterOption<T extends string> = { value: T; label: string };

const STATUS_OPTIONS: ReadonlyArray<FilterOption<StatusFilter>> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
];

const PROVIDER_OPTIONS: ReadonlyArray<FilterOption<ProviderFilter>> = [
  { value: 'all', label: 'All providers' },
  { value: 'maynilad', label: 'Maynilad' },
  { value: 'manila-water', label: 'Manila Water' },
];

type FilterGroupProps<T extends string> = {
  label: string;
  value: T;
  options: ReadonlyArray<FilterOption<T>>;
  onChange: (value: T) => void;
};

function FilterGroup<T extends string>({ label, value, options, onChange }: FilterGroupProps<T>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <span className="text-sm font-semibold uppercase tracking-wide text-zinc-500 sm:w-24">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={
                selected
                  ? 'inline-flex min-h-11 items-center justify-center bg-white text-zinc-900 shadow-sm rounded-lg px-4 sm:px-5 py-2 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                  : 'inline-flex min-h-11 items-center justify-center text-zinc-600 hover:text-zinc-900 rounded-lg px-4 sm:px-5 py-2 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type MapClientProps = {
  outages: Outage[];
};

export default function MapClient({ outages }: MapClientProps) {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>(() =>
    parseProviderFilter(searchParams.get('provider')),
  );

  // replaceState keeps the URL shareable without adding a history entry per filter click.
  const updateUrl = (newStatus: StatusFilter, newProvider: ProviderFilter) => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (newStatus !== 'all') params.set('status', newStatus);
    else params.delete('status');
    if (newProvider !== 'all') params.set('provider', newProvider);
    else params.delete('provider');

    const queryString = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${queryString ? `?${queryString}` : ''}`,
    );
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setStatusFilter(parseStatusFilter(params.get('status')));
      setProviderFilter(parseProviderFilter(params.get('provider')));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const now = new Date();
  const filtersActive = statusFilter !== 'all' || providerFilter !== 'all';
  const filteredOutages = outages.filter((outage) => {
    if (statusFilter !== 'all' && computeStatus(outage, now) !== statusFilter) return false;
    if (providerFilter !== 'all' && outage.concessionaire !== providerFilter) return false;
    return true;
  });

  // The polygons are the only place an advisory's location is visible. This list carries the same
  // information as text, so a screen reader or a keyboard user never has to read a canvas.
  const affectedAreas = Array.from(
    new Set(
      filteredOutages.flatMap((outage) =>
        outage.affectedAreas.flatMap((area) =>
          area.barangays.map((barangay) => `${barangay.name}, ${barangay.city}`),
        ),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <div className="mb-8 space-y-4 rounded-2xl border border-slate-100 bg-white p-6 md:p-8 shadow-sm md:shadow-md transition-shadow">
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatusFilter(value);
            updateUrl(value, providerFilter);
          }}
        />
        <FilterGroup
          label="Provider"
          value={providerFilter}
          options={PROVIDER_OPTIONS}
          onChange={(value) => {
            setProviderFilter(value);
            updateUrl(statusFilter, value);
          }}
        />
        {filtersActive && filteredOutages.length === 0 && (
          <p role="status" className="text-sm font-medium text-zinc-600">
            No outages match the selected filters.
          </p>
        )}
      </div>

      <Suspense fallback={<p className="text-zinc-500">Loading map...</p>}>
        <OutageMap
          outages={filteredOutages}
          statusFilter={statusFilter}
          providerFilter={providerFilter}
        />
      </Suspense>

      <div className="mx-auto mt-6 flex w-fit max-w-full flex-wrap justify-center gap-x-4 gap-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm sm:gap-x-6 sm:px-6 sm:py-4 sm:text-base">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" aria-hidden="true"></div> Active outage
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500 rounded-full" aria-hidden="true"></div> Scheduled outage
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-zinc-400 rounded-full" aria-hidden="true"></div> Status unknown
        </div>
      </div>

      <section
        aria-labelledby="affected-barangays-heading"
        className="mt-8 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm md:p-8"
      >
        <h2
          id="affected-barangays-heading"
          className="mb-4 text-2xl font-extrabold text-slate-900"
        >
          Affected Barangays ({affectedAreas.length})
        </h2>
        {affectedAreas.length === 0 ? (
          <p className="text-lg text-zinc-500">No outages match your current filters.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {affectedAreas.map((area) => (
              <li
                key={area}
                className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 md:text-base"
              >
                {area}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
