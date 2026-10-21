'use client';

import 'leaflet/dist/leaflet.css';
import type { Outage } from '@/lib/schemas/outage';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';

import { CITY_COORDS } from '@/lib/utils/geo';

delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type OutageMapProps = {
  outages: Outage[];
};

export default function OutageMap({ outages }: OutageMapProps) {
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
        center={[14.5995, 120.9842]}
        zoom={11}
        className="h-[600px] w-full rounded-xl border border-zinc-200 shadow-sm z-0"
      >
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
          const count = groupedByCity.get(city)?.length ?? 0;
          return (
            <Marker key={city} position={coords}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{city}</p>
                  <p>{count} outage{count === 1 ? '' : 's'} in {city}</p>
                  <Link
                    href={`/?city=${encodeURIComponent(city)}`}
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
