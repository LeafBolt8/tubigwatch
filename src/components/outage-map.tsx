'use client';

import 'leaflet/dist/leaflet.css';
import type { Outage } from '@/lib/schemas/outage';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';
import { Map as MapIcon } from 'lucide-react';

delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CITY_COORDS: Record<string, [number, number]> = {
  'Quezon City': [14.676, 121.0437],
  'Manila': [14.5995, 120.9842],
  'Caloocan': [14.6507, 120.9675],
  'Caloocan City': [14.6507, 120.9675],
  'Makati': [14.5547, 121.0244],
  'Taguig': [14.5176, 121.0509],
  'Pasig': [14.5764, 121.0851],
  'Valenzuela': [14.7011, 120.983],
  'Valenzuela City': [14.7011, 120.983],
  'Parañaque': [14.4791, 121.0198],
  'Las Piñas': [14.4498, 120.983],
  'Muntinlupa': [14.4081, 121.0415],
  'Marikina': [14.6507, 121.1029],
  'Pasay': [14.5378, 121.0014],
  'Malabon': [14.6624, 120.9569],
  'Navotas': [14.6667, 120.9417],
  'San Juan': [14.6019, 121.0356],
  'Mandaluyong': [14.5794, 121.0359],
  'Marikina City': [14.6507, 121.1029],
  'Imus': [14.4297, 120.9367],
  'Imus City': [14.4297, 120.9367],
  'Bacoor': [14.4624, 120.9645],
  'Bacoor City': [14.4624, 120.9645],
  'Cavite City': [14.4791, 120.8969],
  'Dasmariñas': [14.3294, 120.9367],
};

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-700">Outage Map</h1>
          <p className="mt-1 text-lg text-zinc-600">Metro Manila water outages by city</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          <MapIcon className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

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
          if (!coords) return null;
          const count = groupedByCity.get(city)?.length ?? 0;
          return (
            <Marker key={city} position={coords}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{city}</p>
                  <p>{count} outage{count === 1 ? '' : 's'} in {city}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
