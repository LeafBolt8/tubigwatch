'use client';

import { useEffect, useState } from 'react';

type LiveCountdownProps = {
  targetDate: string | Date;
  prefix: string;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':');
}

export default function LiveCountdown({ targetDate, prefix }: LiveCountdownProps) {
  // `now` starts empty so the server and the first client render agree, then fills on the first tick.
  // Seeding it directly inside the effect would trip react-hooks/set-state-in-effect.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);

    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  const diff = new Date(targetDate).getTime() - now.getTime();
  if (Number.isNaN(diff) || diff < 0) return null;

  return (
    <p className="text-base font-semibold text-zinc-900">
      {prefix} {formatDuration(diff)}
    </p>
  );
}
