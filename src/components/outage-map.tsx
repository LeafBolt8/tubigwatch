'use client';

import 'leaflet/dist/leaflet.css';
import type { Outage } from '@/lib/schemas/outage';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import Link from 'next/link';

import { CITY_COORDS, getClosestCity } from '@/lib/utils/geo';
import { computeStatus } from '@/lib/utils/outage-status';

delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];

/** MapContainer's `center` is initial-only, so a later "near me" fix needs the live map instance. */
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [map, center]);

  return null;
}

type OutageMapProps = {
  outages: Outage[];
  statusFilter: 'all' | 'active' | 'scheduled';
  providerFilter: 'all' | 'maynilad' | 'manila-water';
};

export default function OutageMap({ outages, statusFilter, providerFilter }: OutageMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  // Only follow the "near me" preference the dashboard already stores, so the map never asks for
  // location on its own.
  useEffect(() => {
    let cancelled = false;

    if (localStorage.getItem('tubigwatch_near_me') !== 'true') return;
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const closest = getClosestCity(position.coords.latitude, position.coords.longitude);
        const coords = closest ? CITY_COORDS[closest] : undefined;
        if (coords) setMapCenter(coords);
      },
      (error) => {
        console.warn('Location permission denied', error);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const groupedByCity = new Map<string, Outage[]>();
  for (const outage of outages) {
    const area = outage.affectedAreas[0];
    const city = area?.barangays[0]?.city ?? outage.city ?? 'Unknown';
    const grouped = groupedByCity.get(city) ?? [];
    grouped.push(outage);
    groupedByCity.set(city, grouped);
  }

  const sortedCities = Array.from(groupedByCity.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <MapContainer
        center={mapCenter}
        zoom={11}
        className="h-[70vh] min-h-[600px] w-full rounded-2xl border border-slate-200 shadow-sm z-0"
      >
        <MapRecenter center={mapCenter} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sortedCities.map((city) => {
          const coords = CITY_COORDS[city];
          if (!coords) {
            console.warn(`[Map] Missing coordinates for city: "${city}"`);
            return null;
          }

          const cityOutages = groupedByCity.get(city) ?? [];
          const hasActive = cityOutages.some((o) => computeStatus(o, now) === 'active');
          const hasScheduled = cityOutages.some((o) => computeStatus(o, now) === 'scheduled');
          // Unknown-only cities keep a neutral pin instead of borrowing the scheduled colour.
          const pinColor = hasActive
            ? 'bg-red-500'
            : hasScheduled
              ? 'bg-amber-500'
              : 'bg-zinc-400';
          const customIcon = L.divIcon({
            className: 'custom-pin',
            html: `<div class="${pinColor} w-6 h-6 rounded-full border-2 border-white shadow-md"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
          });
          const count = cityOutages.length;

          return (
            <Marker
              key={city}
              position={coords}
              icon={customIcon}
              title={`${city}: ${count} outage${count === 1 ? '' : 's'}`}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{city}</p>
                  <p>{count} outage{count === 1 ? '' : 's'} in {city}</p>
                  <Link
                    href={`/?city=${encodeURIComponent(city)}${
                      statusFilter !== 'all' ? `&status=${statusFilter}` : ''
                    }${providerFilter !== 'all' ? `&provider=${providerFilter}` : ''}`}
                    className="mt-2 inline-block bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    View Details
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
