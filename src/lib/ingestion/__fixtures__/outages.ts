// Fictional fixtures. Real ingestion lands in Phase 2 Step 2.
// All timestamps are real Date objects — the schemas coerce strings at parse time, and the
// `z.infer` type is `Date`, so fixture literals must be Date instances, not ISO strings.

import { Outage, OutageSchema } from '@/lib/schemas/outage';

/**
 * Timestamps are relative to load time so the sample advisories never age out of the statuses
 * they are meant to demonstrate. The server evaluates fixtures with the real clock, so a fixed
 * calendar date would eventually leave the map with nothing to draw and the tests with nothing
 * to assert.
 */
const offsetDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const UTC = (iso: string) => new Date(iso);

const _outageFixtures: Outage[] = [
  {
    id: 'maynilad-qc-kalusugan-20261016-0600',
    concessionaire: 'maynilad',
    status: 'active',
    reason: 'Emergency repair of a 300mm mainline leak along Quirino Highway.',
    startsAt: offsetDate(-2),
    estimatedRestoration: offsetDate(4),
    affectedAreas: [
      {
        barangays: [
          { name: 'Kalusugan', city: 'Quezon City', province: 'Metro Manila', psgcCode: '137404035' },
        ],
        streets: ['Quirino Highway', 'Balintawak Street'],
        notes: 'Low pressure reported on upper floors along the highway.',
      },
    ],
    source: {
      url: 'https://www.mayniladwater.com.ph/advisories/qc-kalusugan-20261016',
      fetchedAt: UTC('2026-10-16T06:14:00+08:00'),
      raw: 'Interruption: Kalusugan, Quezon City. Emergency mainline repair. 06:00 to 18:00.',
    },
    confidence: 'official',
  },
  {
    id: 'manila-water-makati-poblacion-20261016-0500',
    concessionaire: 'manila-water',
    status: 'active',
    reason: 'Scheduled valve replacement at the Poblacion pumping station ran over its window.',
    startsAt: offsetDate(-2),
    endsAt: offsetDate(4),
    affectedAreas: [
      {
        barangays: [{ name: 'Poblacion', city: 'Makati', province: 'Metro Manila' }],
        streets: ['Jupiter Street', 'Burgos Street'],
      },
    ],
    source: {
      url: 'https://www.manilawater.com/service-updates/poblacion-20261016',
      fetchedAt: UTC('2026-10-16T06:20:00+08:00'),
      raw: 'Service update: Poblacion, Makati. Valve replacement overrun. 05:00 to 20:00.',
    },
    confidence: 'official',
  },
  {
    id: 'manila-water-taguig-ususan-20261017-2200',
    concessionaire: 'manila-water',
    status: 'scheduled',
    reason: 'Interconnection works for the Ususan service line.',
    startsAt: offsetDate(24),
    endsAt: offsetDate(30),
    estimatedRestoration: offsetDate(30),
    affectedAreas: [
      {
        barangays: [{ name: 'Ususan', city: 'Taguig', province: 'Metro Manila', psgcCode: '137607002' }],
        streets: ['Levi Mariano Avenue'],
      },
    ],
    source: {
      url: 'https://www.manilawater.com/service-updates/ususan-20261017',
      fetchedAt: UTC('2026-10-16T07:05:00+08:00'),
      raw: 'Scheduled: Ususan, Taguig. Interconnection works. 22:00 to 04:00.',
    },
    confidence: 'official',
  },
  {
    id: 'manila-water-pasig-kapitolyo-20261018-2300',
    concessionaire: 'manila-water',
    status: 'scheduled',
    reason: 'Reservoir cleaning at the Kapitolyo facility.',
    startsAt: offsetDate(48),
    endsAt: offsetDate(54),
    affectedAreas: [
      {
        barangays: [{ name: 'Kapitolyo', city: 'Pasig', province: 'Metro Manila', psgcCode: '137403013' }],
        streets: ['West Capitol Drive', 'San Rafael Street'],
        notes: 'Residents are advised to store water before 22:00.',
      },
    ],
    source: {
      url: 'https://www.manilawater.com/service-updates/kapitolyo-20261018',
      fetchedAt: UTC('2026-10-16T07:11:00+08:00'),
      raw: 'Scheduled: Kapitolyo, Pasig. Reservoir cleaning. 23:00 to 05:00.',
    },
    confidence: 'official',
  },
  {
    id: 'maynilad-caloocan-176-20261015-0800',
    concessionaire: 'maynilad',
    status: 'restored',
    reason: 'Pipe burst along A. Mabini Street repaired ahead of the published estimate.',
    startsAt: offsetDate(-48),
    endsAt: offsetDate(-24),
    affectedAreas: [
      {
        barangays: [{ name: 'Barangay 176', city: 'Caloocan', province: 'Metro Manila' }],
        streets: ['A. Mabini Street', 'Rizal Avenue Extension'],
      },
    ],
    source: {
      url: 'https://www.mayniladwater.com.ph/advisories/caloocan-176-20261015',
      fetchedAt: UTC('2026-10-16T06:40:00+08:00'),
      raw: 'Restored: Barangay 176, Caloocan. Pipe burst repaired at 15:30.',
    },
    confidence: 'official',
  },
  {
    id: 'maynilad-makati-poblacion-20261019-0100',
    concessionaire: 'maynilad',
    status: 'cancelled',
    reason: 'Planned pressure testing in Poblacion was called off by the operations team.',
    startsAt: offsetDate(72),
    affectedAreas: [
      {
        barangays: [{ name: 'Poblacion', city: 'Makati', province: 'Metro Manila' }],
        streets: ['Kalayaan Avenue'],
      },
    ],
    source: {
      url: 'https://www.mayniladwater.com.ph/advisories/makati-poblacion-20261019',
      fetchedAt: UTC('2026-10-16T07:30:00+08:00'),
      raw: 'Cancelled: Poblacion, Makati. Pressure testing withdrawn.',
    },
    confidence: 'inferred',
  },
  {
    // One row, two cities: exercises compound-label splitting plus the province suffix that must
    // not become a city of its own.
    id: 'manila-water-antipolo-cainta-20261020-0900',
    concessionaire: 'manila-water',
    status: 'active',
    reason: 'Valve replacement along the Antipolo and Cainta boundary.',
    startsAt: offsetDate(-3),
    endsAt: offsetDate(3),
    affectedAreas: [
      {
        barangays: [{ name: 'San Roque', city: 'Antipolo, Rizal', province: 'Rizal' }],
        streets: ['Sumulong Highway'],
      },
      {
        barangays: [{ name: 'Sto. Niño', city: 'Cainta, Rizal', province: 'Rizal' }],
        streets: ['Ortigas Avenue Extension'],
      },
    ],
    source: {
      url: 'https://www.manilawater.com/service-updates/antipolo-cainta-20261020',
      fetchedAt: UTC('2026-10-20T06:30:00+08:00'),
      raw: 'Service update: Antipolo and Cainta, Rizal. Valve replacement. 09:00 to 15:00.',
    },
    confidence: 'official',
  },
];

// Runtime guard: every fixture must parse under the canonical schema. This is the same
// assertion the unit tests run, duplicated here so a bad edit to the array fails at load
// time in any consumer that imports the module (tests, future ingestors).
for (const f of _outageFixtures) {
  OutageSchema.parse(f);
}

export const outageFixtures = _outageFixtures;


