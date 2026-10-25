'use client';

import 'leaflet/dist/leaflet.css';
import type { Outage } from '@/lib/schemas/outage';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PathOptions } from 'leaflet';
import L from 'leaflet';

import { CITY_COORDS, getCityCoords, getClosestCity } from '@/lib/utils/geo';
import {
  barangayKey,
  buildBarangayIndex,
  cityKey,
  type BarangayIndexEntry,
} from '@/lib/utils/barangay-geo';
import { computeStatus } from '@/lib/utils/outage-status';

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];
const BOUNDARIES_URL = '/data/barangays-lowres.geojson';

/** MapContainer's `center` is initial-only, so a later "near me" fix needs the live map instance. */
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [map, center]);

  return null;
}

type BarangayProperties = {
  /** Barangay name, e.g. "Kalusugan". */
  ADM4_EN: string;
  /** City or municipality the barangay belongs to, e.g. "Quezon City". */
  ADM3_EN: string;
  ADM4_PCODE?: string;
};

type BarangayGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

type BarangayFeature = {
  type: 'Feature';
  properties: BarangayProperties;
  geometry: BarangayGeometry;
};

type BarangayCollection = {
  type: 'FeatureCollection';
  features: BarangayFeature[];
};

const ACTIVE_STYLE: PathOptions = {
  fillColor: '#ef4444',
  fillOpacity: 0.8,
  color: '#ffffff',
  weight: 2,
  opacity: 1,
};
const SCHEDULED_STYLE: PathOptions = {
  fillColor: '#f59e0b',
  fillOpacity: 0.8,
  color: '#ffffff',
  weight: 2,
  opacity: 1,
};

/**
 * City-centre anchors. A single barangay polygon is a few pixels across at city-wide zoom, so the
 * pin gives a resident something to aim at; the polygons still carry the exact boundary once they
 * zoom in. The pin colour mirrors the worst advisory in that city.
 */
const ACTIVE_CITY_ICON = L.divIcon({
  className: 'custom-city-pin',
  html: '<div class="w-5 h-5 rounded-full border-2 border-white bg-red-500 shadow-md transition-transform hover:scale-110"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});
const SCHEDULED_CITY_ICON = L.divIcon({
  className: 'custom-city-pin',
  html: '<div class="w-5 h-5 rounded-full border-2 border-white bg-amber-500 shadow-md transition-transform hover:scale-110"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});
// Boundaries carry no advisory: faint outlines give the map shape without competing for attention.
const NEUTRAL_STYLE: PathOptions = {
  fillColor: '#94a3b8',
  fillOpacity: 0.08,
  color: '#94a3b8',
  weight: 0.5,
  opacity: 0.35,
};

function isBarangayCollection(value: unknown): value is BarangayCollection {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === 'FeatureCollection' && Array.isArray(candidate.features);
}

/** Boundary properties are data read off disk, so they are narrowed instead of trusted. */
function readProperties(feature: unknown): BarangayProperties {
  if (typeof feature !== 'object' || feature === null) {
    return { ADM4_EN: '', ADM3_EN: '' };
  }

  const properties = (feature as { properties?: Partial<BarangayProperties> }).properties;
  return {
    ADM4_EN: properties?.ADM4_EN ?? '',
    ADM3_EN: properties?.ADM3_EN ?? '',
    ADM4_PCODE: properties?.ADM4_PCODE,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

type PopupState = {
  index: Map<string, BarangayIndexEntry>;
  statusFilter: 'all' | 'active' | 'scheduled';
  providerFilter: 'all' | 'maynilad' | 'manila-water';
};

function popupHtml(feature: BarangayProperties, state: PopupState): string {
  const { ADM4_EN: barangay, ADM3_EN: city } = feature;
  const hit = state.index.get(barangayKey(city, barangay));

  const statusBadge = !hit
    ? '<span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-700">Not listed in current advisories</span>'
    : hit.status === 'active'
      ? '<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Active outage</span>'
      : '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Scheduled outage</span>';

  const reasons = hit
    ? `<ul class="mt-2 list-disc space-y-1 pl-4 text-zinc-700">${hit.outages
        .map((outage) => `<li>${escapeHtml(outage.reason)}</li>`)
        .join('')}</ul>`
    : '';

  const href = `/?city=${encodeURIComponent(city)}${
    state.statusFilter !== 'all' ? `&status=${state.statusFilter}` : ''
  }${state.providerFilter !== 'all' ? `&provider=${state.providerFilter}` : ''}`;

  return `<div class="space-y-1 text-sm text-zinc-900">
    <p class="text-base font-bold">${escapeHtml(barangay)}</p>
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">${escapeHtml(city)}</p>
    <p>${statusBadge}</p>
    ${reasons}
    <a href="${escapeHtml(href)}" class="mt-3 block w-full rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-bold text-white! transition-colors hover:bg-blue-700">View Details</a>
  </div>`;
}

type OutageMapProps = {
  outages: Outage[];
  statusFilter: 'all' | 'active' | 'scheduled';
  providerFilter: 'all' | 'maynilad' | 'manila-water';
};

export default function OutageMap({ outages, statusFilter, providerFilter }: OutageMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [boundaries, setBoundaries] = useState<BarangayCollection | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();

    fetch(BOUNDARIES_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`boundary request failed: ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!isBarangayCollection(data)) throw new Error('boundary file is not a FeatureCollection');
        setBoundaries(data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load barangay boundaries', error);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const index = useMemo(() => buildBarangayIndex(outages, new Date()), [outages]);

  // Popup content is built when the user opens a popup, so it must read the latest filters rather
  // than the ones captured when the layer was first created.
  const popupState = useRef<PopupState>({ index, statusFilter, providerFilter });
  useEffect(() => {
    popupState.current = { index, statusFilter, providerFilter };
  }, [index, statusFilter, providerFilter]);

  // One pin per city, carrying every current advisory for that city so the popup can name the
  // count. Restored and cancelled rows are left out: they are not advisories, so an amber pin for
  // them would claim an outage the polygons already draw as neutral.
  const cityPins = useMemo(() => {
    const now = new Date();
    const pins = new Map<
      string,
      {
        city: string;
        coords: [number, number];
        outageIds: Set<string>;
        hasActive: boolean;
      }
    >();

    for (const outage of outages) {
      const status = computeStatus(outage, now);
      if (status !== 'active' && status !== 'scheduled') continue;

      const cityLabels = new Set<string>();
      for (const area of outage.affectedAreas) {
        for (const barangay of area.barangays) {
          if (barangay.city) cityLabels.add(barangay.city);
        }
      }
      if (cityLabels.size === 0 && outage.city) cityLabels.add(outage.city);

      for (const city of cityLabels) {
        const coords = getCityCoords(city);
        if (!coords) continue;

        const key = cityKey(city);
        const existing = pins.get(key);

        if (existing) {
          existing.outageIds.add(outage.id);
          if (status === 'active') existing.hasActive = true;
          continue;
        }

        pins.set(key, {
          city,
          coords,
          outageIds: new Set([outage.id]),
          hasActive: status === 'active',
        });
      }
    }

    return [...pins.values()].map(({ city, coords, outageIds, hasActive }) => ({
      city,
      coords,
      outageCount: outageIds.size,
      hasActive,
    }));
  }, [outages]);

  const style = useMemo(
    () => (feature?: unknown): PathOptions => {
      const properties = readProperties(feature);
      const hit = index.get(barangayKey(properties.ADM3_EN, properties.ADM4_EN));
      if (hit?.status === 'active') return ACTIVE_STYLE;
      if (hit?.status === 'scheduled') return SCHEDULED_STYLE;
      return NEUTRAL_STYLE;
    },
    [index],
  );

  const onEachFeature = useCallback((feature: unknown, layer: L.Layer) => {
    const properties = readProperties(feature);
    layer.bindPopup(() => popupHtml(properties, popupState.current));
  }, []);

  return (
    <div className="space-y-6">
      <MapContainer
        center={mapCenter}
        zoom={11}
        className="h-[70vh] min-h-[600px] w-full rounded-2xl border border-slate-200 shadow-sm z-0"
      >
        <MapRecenter center={mapCenter} />
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        {boundaries && (
          <GeoJSON data={boundaries} style={style} onEachFeature={onEachFeature} />
        )}
        {cityPins.map(({ city, coords, outageCount, hasActive }) => {
          const label = `${city}: ${outageCount} ${outageCount === 1 ? 'outage' : 'outages'}`;

          return (
            <Marker
              key={cityKey(city)}
              position={coords}
              icon={hasActive ? ACTIVE_CITY_ICON : SCHEDULED_CITY_ICON}
              title={label}
            >
              <Popup>
                <div className="p-2 text-center">
                  <strong className="text-lg text-slate-900">{city}</strong>
                  <br />
                  <span className="text-sm text-zinc-600">
                    {outageCount} {outageCount === 1 ? 'outage' : 'outages'}
                  </span>
                  <br />
                  <Link
                    href={`/?city=${encodeURIComponent(city)}`}
                    className="mt-2 inline-block bg-blue-600 text-white! px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
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
