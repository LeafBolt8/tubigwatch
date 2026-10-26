'use client';

import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Copy, Map as MapIcon, MapPin, Pin, Search, Share2, X } from 'lucide-react';

import EnablePush from '@/components/enable-push';
import LiveCountdown from '@/components/live-countdown';
import Link from 'next/link';
import { getClosestCity } from '@/lib/utils/geo';
import { cleanBarangayName } from '@/lib/utils/barangay-name';
import { cityKey } from '@/lib/utils/barangay-geo';
import { syncPushSubscription } from '@/lib/utils/push-sync';
import { computeStatus } from '@/lib/utils/outage-status';
import { slugify } from '@/lib/utils/slugify';

type StatusFilter = 'all' | 'active' | 'scheduled';
type ProviderFilter = 'all' | 'maynilad' | 'manila-water';
type FavoriteType = 'city' | 'barangay';
type Favorite = { type: FavoriteType; name: string };

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

function parseProviderFilter(raw: string | null): ProviderFilter {
  return raw === 'maynilad' || raw === 'manila-water' ? raw : 'all';
}

/**
 * Splits a barangay label into the pieces the card renders, then cleans each piece.
 *
 * Favorites are keyed on the cleaned piece rather than the raw label, so "Sta. Ana" pinned on
 * one row still matches "Sta Ana" on another, and a compound label pins as separate barangays.
 */
function favoriteKeysForName(name: string): string[] {
  return name
    .split(/[,;]|\band\b/i)
    .map((piece) => cleanBarangayName(piece))
    .filter(Boolean);
}

const FAVORITES_KEY = 'tubigwatch_favorites_v2';
const EMPTY_FAVORITES: Favorite[] = [];

/**
 * Favorites live in localStorage, not React state: that keeps them across reloads without a
 * setState-in-effect (which the React compiler lint rejects) and without a hydration mismatch.
 * The raw string is cached so repeated snapshots return the same array reference.
 */
let favoritesRawCache: string | null = null;
let favoritesCache: Favorite[] = EMPTY_FAVORITES;

function parseFavorites(raw: string): Favorite[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_FAVORITES;

    const favorites: Favorite[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as { type?: unknown; name?: unknown };
      if (
        (candidate.type === 'city' || candidate.type === 'barangay') &&
        typeof candidate.name === 'string' &&
        candidate.name.length > 0
      ) {
        favorites.push({ type: candidate.type, name: candidate.name });
      }
    }

    return favorites.length > 0 ? favorites : EMPTY_FAVORITES;
  } catch {
    return EMPTY_FAVORITES;
  }
}

function getFavoritesSnapshot(): Favorite[] {
  const raw = window.localStorage.getItem(FAVORITES_KEY) ?? '';
  if (raw !== favoritesRawCache) {
    favoritesRawCache = raw;
    favoritesCache = parseFavorites(raw);
  }
  return favoritesCache;
}

function getServerFavoritesSnapshot(): Favorite[] {
  return EMPTY_FAVORITES;
}

function subscribeFavorites(onStoreChange: () => void): () => void {
  // 'storage' covers other tabs; the custom event covers this one, where storage does not fire.
  window.addEventListener('storage', onStoreChange);
  window.addEventListener('tubigwatch-favorites', onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener('tubigwatch-favorites', onStoreChange);
  };
}

function pillClasses(status: StatusFilter, value: StatusFilter): string {
  const active = status === value;
  return active
    ? 'inline-flex items-center justify-center bg-white text-zinc-900 shadow-sm rounded-lg px-2 sm:px-6 py-2.5 text-base sm:text-lg font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
    : 'inline-flex items-center justify-center text-zinc-600 hover:text-zinc-900 rounded-lg px-2 sm:px-6 py-2.5 text-base sm:text-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
}

function providerPillClasses(selected: boolean, selectedText: string): string {
  const base =
    'inline-flex w-full sm:w-auto min-h-12 items-center justify-center rounded-lg px-2 sm:px-6 py-2.5 text-base sm:text-lg font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

  return selected
    ? `${base} bg-white ${selectedText} shadow-sm`
    : `${base} text-zinc-600 hover:text-zinc-900 transition-colors`;
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
  const sourceParam = searchParams.get('source');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(parseStatusFilter(searchParams.get('status')));
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>(
    parseProviderFilter(searchParams.get('provider')),
  );
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot,
  );
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [nearMeEnabled, setNearMeEnabled] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  // Read into state so "Clear filters" can drop the map hand-off even though replaceState
  // does not remount the dashboard.
  const [cityParam, setCityParam] = useState(searchParams.get('city'));
  const [barangayParam, setBarangayParam] = useState(searchParams.get('barangay'));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const requestLocation = () => {
    if (!('geolocation' in navigator)) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const closest = getClosestCity(position.coords.latitude, position.coords.longitude);
        if (closest) setUserCity(closest);
        setNearMeEnabled(true);
        localStorage.setItem('tubigwatch_near_me', 'true');
        setIsLocating(false);
      },
      (error) => {
        console.warn('Location permission denied', error);
        setNearMeEnabled(false);
        localStorage.removeItem('tubigwatch_near_me');
        setIsLocating(false);
      },
    );
  };

  const toggleNearMe = () => {
    if (isLocating) return;
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
          if (closest) {
            setUserCity(closest);
            setNearMeEnabled(true);
          }
        },
        (error) => {
          console.warn('Location permission denied', error);
          localStorage.removeItem('tubigwatch_near_me');
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

  const updateUrl = (newStatus: StatusFilter, newQuery: string, newProvider: ProviderFilter) => {
    if (typeof window === 'undefined') return;

    // Carry unrelated params (notably the `source=fixtures` dev/test switch) instead of dropping them.
    const params = new URLSearchParams(window.location.search);
    params.delete('status');
    params.delete('q');
    params.delete('provider');
    if (newStatus !== 'all') params.set('status', newStatus);
    if (newQuery.trim()) params.set('q', newQuery.trim());
    if (newProvider !== 'all') params.set('provider', newProvider);

    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;

    // replaceState keeps the URL in sync without a router navigation, so typing costs no requests.
    window.history.replaceState(null, '', newUrl);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setProviderFilter('all');
    setShowOnlyFavorites(false);
    setCityParam(null);
    setBarangayParam(null);

    if (typeof window === 'undefined') return;

    // Drop the map hand-off params (city/barangay) that updateUrl deliberately preserves.
    const params = new URLSearchParams(window.location.search);
    params.delete('status');
    params.delete('q');
    params.delete('provider');
    params.delete('city');
    params.delete('barangay');
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
      setSearchQuery(params.get('q') || '');
      setStatusFilter(parseStatusFilter(params.get('status')));
      setProviderFilter(parseProviderFilter(params.get('provider')));
      setCityParam(params.get('city'));
      setBarangayParam(params.get('barangay'));
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

  useEffect(() => {
    // Skip the initial mount so enabling notifications and pinning in quick succession does not
    // immediately re-post the same record. Later pin changes refresh the stored favorites.
    const syncedBefore = sessionStorage.getItem('favorites-synced');
    if (syncedBefore) {
      syncPushSubscription().catch((error) => {
        console.warn('Could not sync push favorites', error);
      });
    } else {
      sessionStorage.setItem('favorites-synced', 'true');
    }
  }, [favorites]);

  const isFavorited = (type: FavoriteType, name: string) =>
    favorites.some((favorite) => favorite.type === type && favorite.name === name);

  const toggleFavorite = (type: FavoriteType, name: string) => {
    const next = isFavorited(type, name)
      ? favorites.filter((favorite) => !(favorite.type === type && favorite.name === name))
      : [...favorites, { type, name }];
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // Storage can reject writes in private mode; the pin still works for this session.
    }
    window.dispatchEvent(new Event('tubigwatch-favorites'));
  };

  /**
   * A card is pinned when a city pin matches the heading it is listed under (or one of its
   * barangays' cities), or a barangay pin matches one of its cleaned barangay names.
   */
  const outageHasFavorite = (outage: Outage, cityHeading?: string) =>
    favorites.some((favorite) => {
      if (favorite.type === 'city') {
        return (
          favorite.name === cityHeading ||
          outage.city === favorite.name ||
          outage.affectedAreas.some((area) =>
            area.barangays.some((barangay) => barangay.city === favorite.name),
          )
        );
      }
      return outage.affectedAreas.some((area) =>
        area.barangays.some((barangay) =>
          favoriteKeysForName(barangay.name).includes(favorite.name),
        ),
      );
    });

  const mayniladError = sourceErrors.find((e) => e.startsWith('maynilad:'));

  const activeAndUpcoming = outages.filter((outage) => {
    const status = computeStatus(outage, now);
    return status === 'active' || status === 'scheduled' || status === 'unknown';
  });

  const filteredOutages = activeAndUpcoming.filter((outage) => {
    if (showOnlyFavorites && !outageHasFavorite(outage)) return false;

    const matchesStatus = statusFilter === 'all' || computeStatus(outage, now) === statusFilter;

    if (!matchesStatus) return false;

    const matchesProvider = providerFilter === 'all' || outage.concessionaire === providerFilter;
    if (!matchesProvider) return false;

    if (cityParam) {
      const targetCity = cityKey(cityParam);
      const matchesCity = outage.affectedAreas.some((area) =>
        area.barangays.some((b) => b.city && cityKey(b.city) === targetCity),
      );
      if (!matchesCity) return false;
    }

    if (barangayParam) {
      const targetBarangay = cleanBarangayName(barangayParam);
      const matchesBarangay = outage.affectedAreas.some((area) =>
        area.barangays.some((b) => cleanBarangayName(b.name) === targetBarangay),
      );
      if (!matchesBarangay) return false;
    }

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
    // 1. Geolocation Priority (Highest)
    if (userCity && a === userCity) return -1;
    if (userCity && b === userCity) return 1;

    // 2. Explicit City Pin
    const aIsPinnedCity = favorites.some(f => f.type === 'city' && f.name === a);
    const bIsPinnedCity = favorites.some(f => f.type === 'city' && f.name === b);
    if (aIsPinnedCity && !bIsPinnedCity) return -1;
    if (bIsPinnedCity && !aIsPinnedCity) return 1;

    // 3. Contains a Pinned Barangay
    const aHasPinnedBarangay = (groupedByCity.get(a) || []).some(o =>
      o.affectedAreas.some(area =>
        area.barangays.some(bg =>
          favorites.some(f => f.type === 'barangay' && f.name === cleanBarangayName(bg.name))
        )
      )
    );
    const bHasPinnedBarangay = (groupedByCity.get(b) || []).some(o =>
      o.affectedAreas.some(area =>
        area.barangays.some(bg =>
          favorites.some(f => f.type === 'barangay' && f.name === cleanBarangayName(bg.name))
        )
      )
    );

    if (aHasPinnedBarangay && !bHasPinnedBarangay) return -1;
    if (bHasPinnedBarangay && !aHasPinnedBarangay) return 1;

    // 4. Alphabetical Fallback
    return a.localeCompare(b);
  });

  return (
    <>
      {isOffline && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-md mb-4 text-sm font-medium"
        >
          You are currently offline. Showing cached data from {now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8 mb-8 flex flex-col gap-6">
        <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 xl:flex-row xl:items-start">
          {/* LEFT SIDE: Branding and Metadata */}
          <div className="flex flex-col">
            <h1 className="text-4xl font-extrabold tracking-tight text-blue-700 md:text-5xl lg:text-6xl">
              TubigWatch
            </h1>
            <p className="mt-2 text-xl text-zinc-600">Metro Manila water service advisories</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-500">
              <span>
                {sourceLabel ?? (
                  <>
                    Source: Maynilad and Manila Water · Updated:{' '}
                    {now.toLocaleTimeString('en-PH', {
                      timeZone: 'Asia/Manila',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* RIGHT SIDE: Actions and Status */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isLocating}
              title={nearMeEnabled ? 'Disable Near Me' : 'Enable Near Me'}
              onClick={toggleNearMe}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isLocating
                  ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
                  : nearMeEnabled
                    ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50'
              }`}
            >
              <MapPin className="h-4 w-4" />
              {isLocating ? 'Locating...' : nearMeEnabled ? `Prioritizing ${userCity ?? 'Near Me'}` : 'Near Me'}
              {nearMeEnabled && !isLocating && <X className="ml-1 h-4 w-4" />}
            </button>

            <EnablePush />

            <Link
              href="/map"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium shadow-sm hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <MapIcon className="h-4 w-4" /> View Map
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

        <div className="mt-6 flex flex-col gap-4">
          {/* Row 1: Search and status filters */}
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <Search className="h-6 w-6 text-zinc-400" />
              </div>
              <input
                type="text"
                className="block w-full rounded-xl border border-transparent bg-slate-50 py-3 pl-12 pr-4 text-lg leading-6 placeholder-zinc-500 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search by city, barangay, or reason..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  updateUrl(statusFilter, e.target.value, providerFilter);
                }}
              />
            </div>

            <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-1 md:inline-flex md:w-auto md:flex-wrap md:items-center">
              <button
                type="button"
                // Pinned overrides the status pills; without this, All and Pinned would both look active.
                className={pillClasses(showOnlyFavorites ? 'active' : statusFilter, 'all')}
                onClick={() => {
                  setStatusFilter('all');
                  setShowOnlyFavorites(false);
                  updateUrl('all', searchQuery, providerFilter);
                }}
              >
                All <span className="ml-1.5 px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 text-base">{total}</span>
              </button>
              <button
                type="button"
                className={pillClasses(statusFilter, 'active')}
                onClick={() => {
                  setStatusFilter('active');
                  setShowOnlyFavorites(false);
                  updateUrl('active', searchQuery, providerFilter);
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
                  setShowOnlyFavorites(false);
                  updateUrl('scheduled', searchQuery, providerFilter);
                }}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 inline-block"></span> Scheduled{' '}
                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-base">{scheduled}</span>
              </button>
              <button
                type="button"
                aria-pressed={showOnlyFavorites}
                onClick={() => {
                  setStatusFilter('all');
                  updateUrl('all', searchQuery, providerFilter);
                  setShowOnlyFavorites((value) => !value);
                }}
                className={pillClasses(showOnlyFavorites ? 'active' : 'all', 'active')}
              >
                <Pin className="w-4 h-4 mr-1.5" /> Pinned
              </button>
            </div>
          </div>

          {/* Row 2: Provider filters */}
          <div className="grid w-full grid-cols-2 gap-1 self-start rounded-lg bg-slate-200/60 p-1 sm:inline-flex sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setProviderFilter('all');
                updateUrl(statusFilter, searchQuery, 'all');
              }}
              className={`${providerPillClasses(providerFilter === 'all', 'text-zinc-900')} col-span-2 sm:col-span-1`}
            >
              All Providers
            </button>
            <button
              type="button"
              onClick={() => {
                setProviderFilter('maynilad');
                updateUrl(statusFilter, searchQuery, 'maynilad');
              }}
              className={providerPillClasses(providerFilter === 'maynilad', 'text-blue-700')}
            >
              Maynilad
            </button>
            <button
              type="button"
              onClick={() => {
                setProviderFilter('manila-water');
                updateUrl(statusFilter, searchQuery, 'manila-water');
              }}
              className={providerPillClasses(providerFilter === 'manila-water', 'text-cyan-700')}
            >
              Manila Water
            </button>
          </div>
        </div>
      </div>

      {filteredOutages.length === 0 && activeAndUpcoming.length === 0 ? (
        <div className="text-center py-16 px-8 bg-white rounded-2xl border border-slate-200 mt-6 shadow-sm">
          <p className="text-zinc-900 text-2xl font-bold">All clear!</p>
          <p className="text-zinc-600 mt-2 text-lg leading-relaxed">There are currently no active or scheduled water outages.</p>
        </div>
      ) : filteredOutages.length === 0 ? (
        <div className="text-center py-12 px-8 bg-white rounded-2xl border border-slate-200 mt-6 shadow-sm">
          <p className="text-zinc-500 text-lg leading-relaxed">No outages found matching your criteria.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 rounded-lg text-blue-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-16">
          {sortedCities.map((city) => (
            <li key={city}>
              <h2
                id={`city-${encodeURIComponent(city)}`}
                className="bg-white text-slate-900 inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-slate-200 shadow-sm text-2xl md:text-3xl font-extrabold mb-6 scroll-mt-24 hover:border-slate-300 transition-colors"
              >
                <Link
                  href={`/city/${slugify(city)}${sourceParam === 'fixtures' ? '?source=fixtures' : ''}`}
                  className="inline-flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {city ?? 'Unknown'}
                  <ArrowRight className="w-5 h-5 text-blue-600" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  aria-label={isFavorited('city', city) ? `Unpin ${city}` : `Pin ${city}`}
                  title={isFavorited('city', city) ? 'Unpin city' : 'Pin city'}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite('city', city);
                  }}
                  className="rounded text-slate-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <Pin
                    className={`w-6 h-6 transition-colors ${
                      isFavorited('city', city)
                        ? 'fill-blue-600 text-blue-600'
                        : 'text-slate-400 hover:text-blue-600'
                    }`}
                  />
                </button>
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  const favorite = outageHasFavorite(outage, city);
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
                        className={`${favorite ? 'ring-2 ring-blue-400 ring-offset-2' : ''} h-full bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-200 transition-all duration-200 overflow-hidden border-l-[6px] ${
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
                                className={`px-3 py-1.5 rounded text-sm font-bold uppercase tracking-wider ${
                                  outage.concessionaire === 'manila-water'
                                    ? 'bg-cyan-50 text-cyan-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {outage.concessionaire === 'manila-water' ? 'Manila Water' : 'Maynilad'}
                              </span>
                            </div>
                            {timeRange && (
                              <span className="text-xl md:text-2xl font-semibold text-zinc-700 text-right tabular-nums">{timeRange}</span>
                            )}
                          </div>

                          {outage.reason && (
                            <p className="text-2xl md:text-3xl font-bold text-zinc-900 mt-3">{outage.reason}</p>
                          )}

                          {allBarangays.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {allBarangays.map((b) => {
                                const key = cleanBarangayName(b);
                                const pinned = isFavorited('barangay', key);
                                return (
                                  <span
                                    key={b}
                                    className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-700 text-lg md:text-xl font-medium px-4 py-2 rounded-lg"
                                  >
                                    Brgy. {b}
                                    <button
                                      type="button"
                                      aria-label={pinned ? `Unpin ${b}` : `Pin ${b}`}
                                      title={pinned ? 'Unpin barangay' : 'Pin barangay'}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleFavorite('barangay', key);
                                      }}
                                      className="rounded-lg text-zinc-400 hover:text-blue-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                    >
                                      <Pin
                                        className={`w-4 h-4 ${pinned ? 'fill-blue-600 text-blue-600' : ''}`}
                                      />
                                    </button>
                                  </span>
                                );
                              })}
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
                                className="rounded-lg text-zinc-500 hover:text-zinc-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                              >
                                <Copy className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Share outage details"
                                onClick={handleShare}
                                className="rounded-lg text-zinc-500 hover:text-blue-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
