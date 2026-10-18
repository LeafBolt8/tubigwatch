'use client';

import { useSearchParams, useRouter } from 'next/navigation';

type StatusFilter = 'all' | 'active' | 'scheduled';

function activePillClasses(value: StatusFilter): string {
  if (value === 'all') {
    return 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50';
  }
  if (value === 'active') {
    return 'bg-zinc-900 text-white';
  }
  return 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50';
}

function scheduledPillClasses(value: StatusFilter): string {
  if (value === 'scheduled') {
    return 'bg-zinc-900 text-white';
  }
  return 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50';
}

export default function FilterPills() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = (searchParams.get('status') as StatusFilter | null) ?? 'all';

  function setStatus(value: StatusFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', value);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mt-4 flex gap-2">
      <button
        type="button"
        className={`rounded px-3 py-1 text-sm font-medium ${activePillClasses(status)}`}
        onClick={() => setStatus('all')}
      >
        All
      </button>
      <button
        type="button"
        className={`rounded px-3 py-1 text-sm font-medium ${activePillClasses(status)}`}
        onClick={() => setStatus('active')}
      >
        Active
      </button>
      <button
        type="button"
        className={`rounded px-3 py-1 text-sm font-medium ${scheduledPillClasses(status)}`}
        onClick={() => setStatus('scheduled')}
      >
        Scheduled
      </button>
    </div>
  );
}
