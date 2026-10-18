'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { Outage } from '@/lib/schemas/outage';

const OutageMap = dynamic(
  () => import('@/components/outage-map'),
  { ssr: false, loading: () => <p className="text-zinc-500">Loading map...</p> },
);

type MapClientProps = {
  outages: Outage[];
};

export default function MapClient({ outages }: MapClientProps) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading map...</p>}>
      <OutageMap outages={outages} />
    </Suspense>
  );
}
