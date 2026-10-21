'use client';

import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Map as MapIcon, MapPin, Search, Share2, X } from 'lucide-react';

import LiveCountdown from '@/components/live-countdown';
import Link from 'next/link';
import { getClosestCity } from '@/lib/utils/geo';

type StatusFilter = 'all' | 'active' | 'scheduled';

function computeStatus(outage: Outage, now: Date): OutageStatus {
  // 1. Check if it has already ended — always restore, regardless of raw status.
  const endsAt = outage.endsAt ? new Date(outage.endsAt) : null;
  if (endsAt && endsAt <= now) {
    return 'restored';
  }

  // 2. Fallback to raw status.
  if (outage.status) return outage.status;

  // 3. Fallback to time-based logic.
  const startsAt = outage.startsAt ? new Date(outage.startsAt) : null;
  if (!startsAt && !endsAt) return 'unknown';
  const started = startsAt !== null && startsAt <= now;
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
    hour12: true,
  });
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

function parseStatusFilter(raw: string | null): StatusFilter {
  return raw === 'active' || raw === 'scheduled' ? raw : 'all';
}

function pillClasses(status: StatusFilter, value: StatusFilter): string {
  const active = status === value;
  return active
    ? 'inline-flex items-center justify-center flex-1 md:flex-none bg-white text-zinc-900 shadow-sm rounded-lg px-4 sm:px-6 py-2.5 text-lg font-medium'
    : 'inline-flex items-center justify-center flex-1 md:flex-none text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-lg px-4 sm:px-6 py-2.5 text-lg font-medium transition-all';
}

type DashboardProps = {
  outages: Outage[];
  sourceErrors: Array<string>;
  sourceLabel?: string;
};

export default function Dashboard({ outages, sourceErrors, sourceLabel }: DashboardProps) {
  const currentTime = new Date();
  const [now, setNow] = useState(currentTime);
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(parseStatusFilter(searchParams.get('status')));
  const [isOffline, setIsOffline] = useState(false);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [nearMeEnabled, setNearMeEnabled] = useState(false);
  const cityParam = searchParams.get('city');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const requestLocation = () => {
    setNearMeEnabled(true);
    localStorage.setItem('tubigwatch_near_me', 'true');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const closest = getClosestCity(position.coords.latitude, position.coords.longitude);
          if (closest) setUserCity(closest);
        },
        (error) => {
          console.warn('Location permission denied', error);
          setNearMeEnabled(false);
          localStorage.removeItem('tubigwatch_near_me');
        },
      );
    }
  };

  const toggleNearMe = () => {
    if (nearMeEnabled) {
      setNearMeEnabled(false);
      setUserCity(null);
      localStorage.removeItem('tubigwatch_near_me');
    } else {
      requestLocation();
    }
  };

  useEffect(() => {
    const savedPref = localStorage.getItem('tubigwatch_near_me');
    if (savedPref === 'true' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const closest = getClosestCity(position.coords.latitude, position.coords.longitude);
          if (closest) setUserCity(closest);
        },
        (error) => {
          console.warn('Location permission denied', error);
        },
      );
    }
  }, []);

  useEffect(() => {
    if (cityParam) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`city-${encodeURIComponent(cityParam)}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [cityParam]);

  const updateUrl = (newStatus: StatusFilter, newQuery: string) => {
    if (typeof window === 'undefined') return;

    // Carry unrelated params (notably the `source=fixtures` dev/test switch) instead of dropping them.
    const params = new URLSearchParams(window.location.search);
    params.delete('status');
    params.delete('q');
    if (newStatus !== 'all') params.set('status', newStatus);
    if (newQuery.trim()) params.set('q', newQuery.trim());

    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;

    // replaceState keeps the URL in sync without a router navigation, so typing costs no requests.
    window.history.replaceState(null, '', newUrl);
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSearchQuery(params.get('q') || '');
      setStatusFilter(parseStatusFilter(params.get('status')));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const mayniladError = sourceErrors.find((e) => e.startsWith('maynilad:'));

  const activeAndUpcoming = outages.filter((outage) => {
    const status = computeStatus(outage, now);
    return status === 'active' || status === 'scheduled' || status === 'unknown';
  });

  const filteredOutages = activeAndUpcoming.filter((outage) => {
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

  const { active, scheduled } = statusCounts(activeAndUpcoming, now);
  const total = activeAndUpcoming.length;
  const statusUnknown = activeAndUpcoming.some((o) => computeStatus(o, now) === 'unknown');

  const groupedByCity = new Map<string, Outage[]>();
  for (const outage of filteredOutages) {
    const cities = splitCityKey(primaryCityKey(outage));
    const cityList = cities.split(',').map((c) => c.trim()).filter(Boolean);
    for (const city of cityList) {
      const grouped = groupedByCity.get(city) ?? [];
      grouped.push(outage);
      groupedByCity.set(city, grouped);
    }
  }

  const sortedCities = Array.from(groupedByCity.keys()).sort((a, b) => {
    // If one of them is the user's city, put it at the top
    if (userCity && a === userCity) return -1;
    if (userCity && b === userCity) return 1;
    // Otherwise, alphabetical
    return a.localeCompare(b);
  });

  return (
    <>
      {isOffline && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md mb-4 text-sm font-medium"
        >
          You are currently offline. Showing cached data.
        </div>
      )}

      <div className="bg-white/95 rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 flex flex-col gap-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-blue-700">TubigWatch</h1>
            <p className="mt-1 text-xl text-zinc-600">Metro Manila water service advisories</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {nearMeEnabled && userCity && (
              <div className="flex items-center gap-1.5 text-base text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                <MapPin className="w-4 h-4" />
                Prioritizing {userCity}
              </div>
            )}
            <button
              type="button"
              title={nearMeEnabled ? 'Disable Near Me' : 'Enable Near Me'}
              onClick={toggleNearMe}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border $ {
                nearMeEnabled
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <MapPin className="w-4 h-4" />
              {nearMeEnabled ? 'Near Me: On' : 'Near Me'}<X className="ml-1 w-3.5 h-3.5" />
            </button>
            <span className="text-base text-zinc-500 font-medium hidden md:block">
              {sourceLabel ?? (
                <>
                  Source: Maynilad · Updated:{' '}
                  {now.toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </>
              )}
            </span>
            <Link
              href="/map"
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <MapIcon className="w-4 h-4" /> View Map
            </Link>
          </div>
        </header>

        {mayniladError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md">
            <p className="font-bold">Data currently unavailable</p>
            <ul className="list-disc pl-5 mt-1 text-base">
              <li>{mayniladError}</li>
            </ul>
          </div>
        )}

        {statusUnknown && (
          <p className="text-sm font-medium text-zinc-600">Some outages have an unknown status.</p>
        )}

        {sourceErrors.some((e) => e.startsWith('manila-water:')) && (
          <p className="text-base font-medium text-amber-800">
            Manila Water advisories could not be fetched right now.
          </p>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-6 h-6 text-zinc-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-12 pr-4 py-3 text-xl border border-zinc-300 rounded-xl leading-6 bg-white placeholder-zinc-500 placeholder:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="Search by city, barangay, or reason (e.g., 'Quezon City' or 'Baesa')"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                updateUrl(statusFilter, e.target.value);
              }}
            />
          </div>

          <div className="flex w-full md:inline-flex md:w-auto flex-wrap gap-1 p-1 bg-slate-200/60 rounded-lg">
            <button
              type="button"
              className={pillClasses(statusFilter, 'all')}
              onClick={() => {
                setStatusFilter('all');
                updateUrl('all', searchQuery);
              }}
            >
              All <span className="ml-1.5 px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 text-base">{total}</span>
            </button>
            <button
              type="button"
              className={pillClasses(statusFilter, 'active')}
              onClick={() => {
                setStatusFilter('active');
                updateUrl('active', searchQuery);
              }}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5 inline-block"></span> Active{' '}
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-base">{active}</span>
            </button>
            <button
              type="button"
              className={pillClasses(statusFilter, 'scheduled')}
              onClick={() => {
                setStatusFilter('scheduled');
                updateUrl('scheduled', searchQuery);
              }}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 inline-block"></span> Scheduled{' '}
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-base">{scheduled}</span>
            </button>
          </div>
        </div>
      </div>

      {filteredOutages.length === 0 && activeAndUpcoming.length === 0 ? (
        <div className="text-center py-16 bg-white/95 rounded-2xl border border-slate-200 mt-6 shadow-sm">
          <p className="text-zinc-900 text-2xl font-bold">All clear!</p>
          <p className="text-zinc-600 mt-2 text-lg">There are currently no active or scheduled water outages.</p>
        </div>
      ) : filteredOutages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-zinc-200 mt-6">
          <p className="text-zinc-500 text-lg">No outages found matching your criteria.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              updateUrl('all', '');
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
              <h2
              id={`city-${encodeURIComponent(city)}`}
              className="bg-white/90 inline-block px-3 py-1 rounded-lg border border-slate-200 shadow-sm text-xl font-bold text-slate-800 mb-4 scroll-mt-24"
            >
              {city ?? 'Unknown'}
            </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        a.barangays.flatMap((b) =>
                          b.name
                            .split(/[,;]|\\band\\b/)
                            .map((s) => s.trim().replace(/^Brgys?\.\s*/i, '').trim())
                            .filter(Boolean),
                        ),
                      ),
                    ),
                  );
                  const timeRange = [localTime(outage.startsAt ?? null, now), localTime(outage.endsAt ?? null, now)]
                    .filter((t) => t !== 'unknown time')
                    .join(' – ');

                  const handleShare = async () => {
                    const text = `⚠️ WATER ADVISORY: ${outage.reason}\n\n📍 ${citiesLine}\n🗓️ From: ${localTime(outage.startsAt ?? null, now)}\n🗓️ To: ${localTime(outage.endsAt ?? null, now)}\n\nAffected Areas:\n${allBarangays.map((b) => `- Brgy. ${b}`).join('\n')}\n\nCheck details at TubigWatch:`;

                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: 'TubigWatch Water Advisory',
                          text,
                          url: window.location.origin,
                        });
                      } catch (err) {
                        // A cancelled share sheet rejects too, so this is expected noise, not a failure.
                        console.warn('Share canceled or failed', err);
                      }
                    } else {
                      // Desktop browsers without the Web Share API fall back to the copy behaviour.
                      navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
                      alert('Sharing is not supported on this browser. Copied to clipboard instead!');
                    }
                  };

                  return (
                    <li key={outage.id} className="flex flex-col">
                      <article
                        className={`h-full bg-white/95 rounded-xl shadow-md hover:shadow-lg border border-slate-200 overflow-hidden transition-all border-l-4 ${
                          status === 'active'
                            ? 'border-l-red-500'
                            : status === 'scheduled'
                              ? 'border-l-amber-500'
                              : 'border-l-zinc-400'
                        }`}
                      >
                        <div className="p-6 flex flex-col gap-3 h-full">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-bold uppercase tracking-wider ${statusClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                {badge}
                              </span>
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                                  outage.concessionaire === 'manila-water'
                                    ? 'bg-cyan-50 text-cyan-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {outage.concessionaire === 'manila-water' ? 'Manila Water' : 'Maynilad'}
                              </span>
                            </div>
                            {timeRange && (
                              <span className="text-lg font-medium text-zinc-600 text-right">{timeRange}</span>
                            )}
                          </div>

                          {outage.reason && (
                            <p className="text-2xl font-bold text-zinc-900 mt-3">{outage.reason}</p>
                          )}

                          {allBarangays.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {allBarangays.map((b) => (
                                <span
                                  key={b}
                                  className="inline-block bg-zinc-100 text-zinc-700 text-lg font-medium px-4 py-2 rounded-lg"
                                >
                                  Brgy. {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {allBarangays.length === 0 && cities.length === 0 && (
                            <p className="text-sm text-zinc-500">Location details unavailable</p>
                          )}

                          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
                            {status === 'scheduled' && new Date(outage.startsAt).getTime() > now.getTime() && (
                              <LiveCountdown targetDate={outage.startsAt} prefix="Starts in" />
                            )}
                            {status === 'active' &&
                              outage.endsAt &&
                              new Date(outage.endsAt).getTime() > now.getTime() && (
                                <LiveCountdown targetDate={outage.endsAt} prefix="Restores in" />
                              )}
                            <div className="ml-auto flex items-center gap-3">
                              <button
                                type="button"
                                aria-label="Copy outage details"
                                onClick={() => {
                                  const text = `${outage.reason} - ${citiesLine}\nFrom: ${localTime(outage.startsAt ?? null, now)}\nTo: ${localTime(outage.endsAt ?? null, now)}\nAffected: ${allBarangays.join(', ')}`;
                                  navigator.clipboard.writeText(text);
                                  alert('Copied to clipboard!');
                                }}
                                className="text-zinc-500 hover:text-zinc-900 transition-colors"
                              >
                                <Copy className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Share outage details"
                                onClick={handleShare}
                                className="text-zinc-500 hover:text-blue-600 transition-colors"
                              >
                                <Share2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
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
