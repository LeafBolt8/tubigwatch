// Manila Water ingestion module.
//
// Source (recon): the marketing site's Service Advisories table is a client widget
// (`ServiceAdvisoryWidget`) backed by a Next.js Server Action, but that action only proxies an
// open REST endpoint documented by its own pagination block:
//
//   https://rcoi17pzkj.execute-api.ap-southeast-1.amazonaws.com/api/get-service-advisories?page=N
//
// That endpoint needs no auth, no cookies and no browser user-agent; it answers
// `application/json` with `{ data: [...], pagination: { last_page, next_page_url, total } }`.
// Rows are already structured:
//
//   { _id, activity, places: string[], city_municipality, location_of_activity, start_date, end_date }
//
// No HTML parsing and no AI extraction is involved — this replaces the Gemini `urlContext` call
// that used to read the Manila Water page.
//
// Data quirks this module absorbs:
//   - `places` is prose, not a barangay array: ["Portions of Brgy. San Jose"],
//     ["Portions of Brgy. Sta Cruz and Brgy. Mambugan"]. placesToBarangays() strips the
//     "Portions of" preamble and splits on , ; & and the word "and".
//   - `start_date` / `end_date` are naive local strings ("2026-10-20 22:00:00") with no offset.
//     They are Manila wall-clock time and must be read as +08:00, or every outage shifts 8 hours.
//   - `city_municipality` can be compound ("Pasig & Taguig City") or outside Metro Manila
//     ("Rodriguez, Rizal", "Antipolo, Rizal", "Taytay, Rizal"). Compound strings are passed
//     through untouched so normalizeOutages() can explode them per barangay via the dictionary.
//
// Pagination: walk ?page=1..last_page, capped at MAX_PAGES. Reaching the cap with pages still
// unread is reported as a sourceError — a truncated read must never look like a short list of
// outages (see the "no data vs no outages" rule).
//
// Failure behaviour: a failing page contributes a sourceError and stops the walk with whatever
// rows were already validated. Outages are never invented to fill a gap.

import { OutageSchema } from '@/lib/schemas/outage';
import type { Outage } from '@/lib/schemas/outage';
import type { Barangay } from '@/lib/schemas/barangay';

const MW_API =
  'https://rcoi17pzkj.execute-api.ap-southeast-1.amazonaws.com/api/get-service-advisories';

const FETCH_TIMEOUT_MS = 30_000;

/** Hard cap on pages walked (page 1 included). */
const MAX_PAGES = 5;

/** `city_municipality` is the only city signal in the payload, so it is reused verbatim. */
const MW_PROVINCE = 'Metro Manila' as const;

type MwApiRow = {
  _id: string;
  activity: string;
  places: string[];
  city_municipality: string;
  location_of_activity: string;
  start_date: string;
  end_date: string;
};

export type ManilaWaterFetchResult = {
  outages: Outage[];
  sourceErrors: string[];
};

/**
 * Parses a naive Manila wall-clock timestamp as +08:00.
 * "2026-10-20 22:00:00" (22:00 in Manila) is 2026-10-20T14:00:00Z.
 */
export function parseMwDate(s: string): Date {
  return new Date(`${s.trim().replace(' ', 'T')}+08:00`);
}

/**
 * Turns the prose `places` strings into one barangay per piece.
 *
 * `places` entries are free text written for humans: "Portions of Brgy. San Jose",
 * "Portions of Brgy. Sta Cruz and Brgy. Mambugan", "Brgy. PInagbuhatan and Brgy. Napindan".
 * The city is not in this field, so every piece inherits the row's `city_municipality`.
 */
export function placesToBarangays(places: string[], city: string): Barangay[] {
  const barangays: Barangay[] = [];

  for (const place of places) {
    const pieces = place
      .replace(/^portions?\s+of\s+/i, '')
      .split(/[,;&]|\band\b/i)
      .map((p) => p.trim().replace(/^brgys?\.?\s*/i, '').trim())
      .filter(Boolean);

    for (const piece of pieces) {
      barangays.push({ name: piece, city, province: MW_PROVINCE });
    }
  }

  return barangays;
}

/** Before the window = scheduled, after it = restored, inside it = active. */
function deriveStatus(startsAt: Date, endsAt: Date, now: Date): Outage['status'] {
  if (startsAt > now) return 'scheduled';
  if (endsAt < now) return 'restored';
  return 'active';
}

export async function fetchManilaWaterOutages(): Promise<ManilaWaterFetchResult> {
  const outages: Outage[] = [];
  const sourceErrors: string[] = [];
  let page = 1;
  let lastPage = 1;

  try {
    do {
      const res = await fetch(`${MW_API}?page=${page}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        sourceErrors.push(`HTTP ${res.status} on page ${page}`);
        break;
      }

      const json = (await res.json()) as {
        data: MwApiRow[];
        pagination?: { last_page?: number };
      };
      lastPage = json.pagination?.last_page ?? page;

      const now = new Date();
      for (const row of json.data) {
        const startsAt = parseMwDate(row.start_date);
        const endsAt = parseMwDate(row.end_date);

        const candidate = {
          id: `mw-${row._id}`,
          concessionaire: 'manila-water' as const,
          status: deriveStatus(startsAt, endsAt, now),
          reason: row.activity,
          startsAt,
          endsAt,
          affectedAreas: [{ barangays: placesToBarangays(row.places, row.city_municipality) }],
          source: { url: MW_API, fetchedAt: now, raw: JSON.stringify(row) },
          confidence: 'official' as const,
        };

        const parsed = OutageSchema.safeParse(candidate);
        if (parsed.success) {
          outages.push(parsed.data);
        } else {
          const detail = parsed.error.issues[0]?.message ?? 'unknown error';
          sourceErrors.push(`Row ${row._id} failed schema validation: ${detail}`);
        }
      }

      page++;
    } while (page <= lastPage && page <= MAX_PAGES);

    if (page > MAX_PAGES && page <= lastPage) {
      sourceErrors.push(
        `page cap reached at ${MAX_PAGES} of ${lastPage} — later advisories were not read`,
      );
    }
  } catch (err) {
    sourceErrors.push(err instanceof Error ? err.message : String(err));
  }

  return { outages, sourceErrors };
}
