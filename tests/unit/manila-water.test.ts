import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  fetchManilaWaterOutages,
  parseMwDate,
  placesToBarangays,
} from '@/lib/ingestion/manila-water';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('placesToBarangays', () => {
  test('splits "Portions of" prose into separate barangays', () => {
    expect(placesToBarangays(['Portions of Brgy. Sta Cruz and Brgy. Mambugan'], 'Taguig City')).toEqual([
      { name: 'Sta Cruz', city: 'Taguig City', province: 'Metro Manila' },
      { name: 'Mambugan', city: 'Taguig City', province: 'Metro Manila' },
    ]);
  });
});

describe('parseMwDate', () => {
  test('reads a naive timestamp as +08:00', () => {
    expect(parseMwDate('2026-10-20 22:00:00').toISOString()).toBe('2026-10-20T14:00:00.000Z');
  });
});

describe('fetchManilaWaterOutages', () => {
  test('walks both pages and returns one outage per row', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get('page'));
      const body =
        page === 1
          ? {
              data: [
                {
                  _id: 'row-one',
                  activity: 'EMERGENCY Leak Repair',
                  places: ['Portions of Brgy. Sta Cruz and Brgy. Mambugan'],
                  city_municipality: 'Antipolo, Rizal',
                  location_of_activity: 'Along Sumulong Highway',
                  start_date: '2026-10-20 22:00:00',
                  end_date: '2026-10-21 04:00:00',
                },
              ],
              pagination: { current_page: 1, last_page: 2, next_page_url: 'https://example.test?page=2' },
            }
          : {
              data: [
                {
                  _id: 'row-two',
                  activity: 'Line Meter & Strainer Declogging',
                  places: ['Portions of Brgy. San Jose'],
                  city_municipality: 'Rodriguez, Rizal',
                  location_of_activity: 'Kalantas/Narra',
                  start_date: '2026-10-21 22:00:00',
                  end_date: '2026-10-22 04:00:00',
                },
              ],
              pagination: { current_page: 2, last_page: 2, next_page_url: null },
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchManilaWaterOutages();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.sourceErrors).toEqual([]);
    expect(result.outages).toHaveLength(2);
    expect(result.outages[0]?.id).toBe('mw-row-one');
    expect(result.outages[0]?.concessionaire).toBe('manila-water');
    expect(result.outages[0]?.affectedAreas[0]?.barangays.map((b) => b.name)).toEqual([
      'Sta Cruz',
      'Mambugan',
    ]);
    // Antipolo is in Rizal, not Metro Manila.
    expect(result.outages[0]?.affectedAreas[0]?.barangays[0]?.province).toBe('Rizal');
    expect(result.outages[1]?.affectedAreas[0]?.barangays[0]?.province).toBe('Rizal');
  });

  test('reports a failing page instead of returning a silent empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream boom', { status: 502 })),
    );

    const result = await fetchManilaWaterOutages();

    expect(result.outages).toEqual([]);
    expect(result.sourceErrors.join(' ')).toContain('502');
  });
});
