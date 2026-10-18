'use client';

import { useSearchParams, useRouter } from 'next/navigation';

type StatusFilter = 'all' | 'active' | 'scheduled';

function pillClasses(status: StatusFilter, value: StatusFilter): string {
  const active = status === value;
  return active
    ? 'bg-white text-zinc-900 shadow-sm rounded-md px-4 py-1.5 text-sm font-medium'
    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-md px-4 py-1.5 text-sm font-medium transition-all';
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
    <div className="inline-flex p-1 space-x-1 bg-zinc-200/50 rounded-lg mt-6 mb-2">
      <button
        type="button"
        className={pillClasses(status, 'all')}
        onClick={() => setStatus('all')}
      >
        All
      </button>
      <button
        type="button"
        className={pillClasses(status, 'active')}
        onClick={() => setStatus('active')}
      >
        Active
      </button>
      <button
        type="button"
        className={pillClasses(status, 'scheduled')}
        onClick={() => setStatus('scheduled')}
      >
        Scheduled
      </button>
    </div>
  );
}
