// Map one Maynilad parsed table row onto a PartialOutageRow.
//
// Columns observed verbatim in recon (emergency + scheduled share the same 7 columns):
//   [City, Barangay, Specific Area, From, To, Time, Reason]
//
// Rotational has 6 columns (no To): [City, Barangay, Specific Area, From, Time, Reason]
//
// Mapping:
//   - From + To + Time window -> startsAt / endsAt.
//     If Time is present, startsAt = combineDateAndTime(fromDate, tw), endsAt = combineDateAndTimeEnd(toDate, tw).
//     If Time is absent (shouldn't happen for populated rows, but be defensive), startsAt = fromDate, endsAt = toDate.
//   - Specific Area: strip trailing ", <City>" if mixed (observed once: "at Don Jose Street, Quezon City").
//   - Barangay cell: normalize via normalizeBarangays().
//   - City: attach to each affected area's barangay as the city field.
//
// A row with no parseable date/time is still returned as a PartialOutageRow with nulls so the caller
// can decide to skip it (rather than throwing for one bad row).

import type { OutageConfidence } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';
import type { NormalizedBarangay } from './barangay-normalize';
import { normalizeBarangays } from './barangay-normalize';
import { parseMayniladDate, parseMayniladTimeWindow, combineDateAndTime, combineDateAndTimeEnd } from './parse-maynilad';

export type PartialOutageRow = {
  city: string;
  barangays: NormalizedBarangay[];
  specificArea: string;
  from: Date | null;
  to: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string;
  status: OutageStatus;
  confidence: OutageConfidence;
};

const STATUS_FOR_TYPE: Record<string, OutageStatus> = {
  emergency: 'active',
  scheduled: 'scheduled',
  rotational: 'scheduled',
};

const CONFIDENCE_FOR_TYPE: Record<string, OutageConfidence> = {
  emergency: 'official',
  scheduled: 'official',
  rotational: 'official',
};

export function rowToPartialOutage(
  cells: string[],
  type: 'emergency' | 'scheduled' | 'rotational',
  header: string[],
): PartialOutageRow | null {
  const cityIdx = header.indexOf('City');
  const brgyIdx = header.indexOf('Barangay');
  const areaIdx = header.indexOf('Specific Area');
  const fromIdx = header.indexOf('From');
  const toIdx = header.indexOf('To');
  const timeIdx = header.indexOf('Time');
  const reasonIdx = header.indexOf('Reason');

  const city = cells[cityIdx] || '';
  const brgyRaw = cells[brgyIdx] || '';
  const areaRaw = cells[areaIdx] || '';
  const fromRaw = fromIdx >= 0 ? cells[fromIdx] || '' : '';
  const toRaw = toIdx >= 0 ? cells[toIdx] || '' : '';
  const timeRaw = timeIdx >= 0 ? cells[timeIdx] || '' : '';
  const reasonRaw = reasonIdx >= 0 ? cells[reasonIdx] || '' : '';

  if (!city && !brgyRaw && !areaRaw && !fromRaw && !reasonRaw) {
    return null; // effectively empty row
  }

  // Specific Area: strip trailing ", <City>" if mixed.
  const specificArea = areaRaw.replace(/\s*,\s*[A-Za-z .-]+City$/i, '').trim();

  // Barangay normalization. The brgy cell may itself contain the city (e.g. "Brgy. Holy Spirit" is clean;
  // but "at Don Jose Street, Quezon City" lived in the area cell, not the brgy cell, in the fixture).
  const barangays = normalizeBarangays(brgyRaw || areaRaw);

  // Dates
  let from: Date | null = null;
  let to: Date | null = null;
  try {
    if (fromRaw) from = parseMayniladDate(fromRaw);
  } catch {
    from = null;
  }
  try {
    if (toRaw) to = parseMayniladDate(toRaw);
  } catch {
    to = null;
  }

  // Time window
  let tw = null;
  try {
    if (timeRaw) tw = parseMayniladTimeWindow(timeRaw);
  } catch {
    tw = null;
  }

  // Combine
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (from && tw) {
    startsAt = combineDateAndTime(from, tw);
    if (to && tw) endsAt = combineDateAndTimeEnd(to, tw);
    else endsAt = null;
  } else if (from && !tw) {
    startsAt = from;
    endsAt = to ?? null;
  } else if (!from && tw) {
    // Time window without a From date — can't anchor. Leave startsAt null.
    startsAt = null;
    endsAt = null;
  } else {
    startsAt = null;
    endsAt = null;
  }

  return {
    city,
    barangays,
    specificArea,
    from,
    to,
    startsAt,
    endsAt,
    reason: reasonRaw.trim(),
    status: STATUS_FOR_TYPE[type] ?? 'unknown',
    confidence: CONFIDENCE_FOR_TYPE[type] ?? 'inferred',
  };
}
