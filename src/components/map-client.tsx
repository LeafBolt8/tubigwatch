'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Outage } from '@/lib/schemas/outage';
import { computeStatus } from '@/lib/utils/outage-status';

const OutageMap = dynamic(
  () => import('@/components/outage-map'),
  { ssr: false, loading: () => <p className="text-zinc-500">Loading map...</p> },
);

type StatusFilter = 'all' | 'active' | 'scheduled';
type ProviderFilter = 'all' | 'maynilad' | 'manila-water';

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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="text-sm font-semibold uppercase tracking-wide text-zinc-500 sm:w-20">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex flex-wrap gap-1 p-1 bg-slate-200/60 rounded-lg"
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
                  ? 'inline-flex items-center justify-center bg-white text-zinc-900 shadow-sm rounded-lg px-4 sm:px-5 py-2 text-base font-medium'
                  : 'inline-flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-lg px-4 sm:px-5 py-2 text-base font-medium transition-all'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');

  const now = new Date();
  const filtersActive = statusFilter !== 'all' || providerFilter !== 'all';
  const filteredOutages = outages.filter((outage) => {
    if (statusFilter !== 'all' && computeStatus(outage, now) !== statusFilter) return false;
    if (providerFilter !== 'all' && outage.concessionaire !== providerFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
        <FilterGroup
          label="Provider"
          value={providerFilter}
          options={PROVIDER_OPTIONS}
          onChange={setProviderFilter}
        />
        {filtersActive && filteredOutages.length === 0 && (
          <p role="status" className="text-sm font-medium text-zinc-600">
            No outages match the selected filters.
          </p>
        )}
      </div>

      <Suspense fallback={<p className="text-zinc-500">Loading map...</p>}>
        <OutageMap outages={filteredOutages} />
      </Suspense>

      <div className="flex flex-wrap gap-4 mt-4 text-sm text-zinc-600 justify-center">
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
    </div>
  );
}
