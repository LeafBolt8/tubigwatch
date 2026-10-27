'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Copy, Pin, Share2 } from 'lucide-react';

import LiveCountdown from '@/components/live-countdown';
import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import { cleanBarangayName } from '@/lib/utils/barangay-name';
import { barangaySlug } from '@/lib/utils/barangay-slug';
import { computeStatus } from '@/lib/utils/outage-status';

type OutageCardProps = {
  outage: Outage;
  now: Date;
};

type FavoriteType = 'city' | 'barangay';
type Favorite = { type: FavoriteType; name: string };

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

function favoriteKeysForName(name: string): string[] {
  return name
    .split(/[,;]|\band\b/i)
    .map((piece) => cleanBarangayName(piece))
    .filter(Boolean);
}

export function useOutageFavorites() {
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot,
  );

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

  return { favorites, isFavorited, toggleFavorite, outageHasFavorite };
}

function displayBadgeValue(status: OutageStatus): string {
  if (status === 'restored' || status === 'cancelled') return 'COMPLETED';
  return status.toUpperCase();
}

function badgeClasses(status: OutageStatus): string {
  switch (status) {
    case 'active':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'scheduled':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'restored':
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
    case 'cancelled':
    case 'unknown':
      return 'bg-zinc-400';
  }
}

function localTime(date: Date | string | null): string {
  if (!date) return 'unknown time';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown time';
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function OutageCard({ outage, now }: OutageCardProps) {
  const searchParams = useSearchParams();
  const sourceParam = searchParams.get('source');
  const { isFavorited, toggleFavorite, outageHasFavorite } = useOutageFavorites();
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
            .split(/[,;]|\band\b/)
            .map((s) => s.trim().replace(/^Brgys?\.\s*/i, '').trim())
            .filter(Boolean),
        ),
      ),
    ),
  );
  // The tag is a display name; the page needs the exact city to disambiguate it from
  // same-named barangays elsewhere.
  const cityForBarangay = (name: string): string | undefined => {
    const wanted = cleanBarangayName(name);
    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        if (cleanBarangayName(barangay.name) === wanted && barangay.city) {
          return barangay.city;
        }
      }
    }
    return outage.city ?? cities[0];
  };
  const favorite = outageHasFavorite(outage);
  const timeRange = [localTime(outage.startsAt ?? null), localTime(outage.endsAt ?? null)]
    .filter((t) => t !== 'unknown time')
    .join(' – ');

  const handleShare = async () => {
    const text = `⚠️ WATER ADVISORY: ${outage.reason}\n\n📍 ${citiesLine}\n🗓️ From: ${localTime(outage.startsAt ?? null)}\n🗓️ To: ${localTime(outage.endsAt ?? null)}\n\nAffected Areas:\n${allBarangays.map((b) => `- Brgy. ${b}`).join('\n')}\n\nCheck details at TubigWatch:`;

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
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-bold uppercase tracking-wider ${statusClass}`}
            >
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
            <span className="text-xl md:text-2xl font-semibold text-zinc-700 text-right tabular-nums">
              {timeRange}
            </span>
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
              const tagCity = cityForBarangay(b);
              return (
                <span
                  key={b}
                  className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-700 text-lg md:text-xl font-medium px-4 py-2 rounded-lg"
                >
                  {tagCity ? (
                    <Link
                      href={`/barangay/${barangaySlug(b, tagCity)}${
                        sourceParam === 'fixtures' ? '?source=fixtures' : ''
                      }`}
                      className="rounded hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Brgy. {b}
                    </Link>
                  ) : (
                    <>Brgy. {b}</>
                  )}
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
                    <Pin className={`w-4 h-4 ${pinned ? 'fill-blue-600 text-blue-600' : ''}`} />
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
                const text = `${outage.reason} - ${citiesLine}\nFrom: ${localTime(outage.startsAt ?? null)}\nTo: ${localTime(outage.endsAt ?? null)}\nAffected: ${allBarangays.join(', ')}`;
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
  );
}
