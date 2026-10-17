// Maynilad ingestion module.
//
// Sources (from recon rounds 1 + 2):
//   - Maynilad exposes WP REST endpoints:
//       /wp-json/interruptions/emergency
//       /wp-json/interruptions/scheduled
//       /wp-json/interruptions/rotational
//       /wp-json/interruptions/traffic          (not fetched in recon round 2 — fetched on demand)
//     Each returns a JSON object whose VALUE is a STRING containing an HTML <table class="advisory-table">
//     fragment (not a JSON array of objects). See RECON.md.
//   - Endpoints are slow (emergency ~26s, scheduled ~20s in recon). Timeout is 60s.
//   - The wrapper carries data-page / data-max / data-next. Pagination is NOT implemented: both
//     ?page=2 and ?next=<token> returned page 1 again in recon round 3, so we ingest page 1 only.
//     When data-max > 1 there are rows we do not see — do not present the result as complete.
//   - One request per second max (in-process throttle), to be polite to Maynilad's server.
//
// Pipeline:
//   fetch -> parse JSON string -> extract HTML table fragment -> parseHtmlTable() ->
//   rowToPartialOutage() -> group rows -> build Outage[] -> OutageSchema.parse() each -> return.
//
// Failure behaviour:
//   A failing endpoint contributes a message to sourceErrors and is skipped; the others still run.
//   freshness is 'unavailable' only when nothing validated AND something errored. An endpoint that
//   answers with a real empty table (rotational) is a successful fetch with zero outages — never
//   reported as unavailable. No fixture fallback: a network failure must not look like calm water.
//
// Grouping rule:
//   Rows with identical (startsAt, endsAt, reason) collapse into ONE Outage with multiple
//   affectedAreas (one per distinct barangay). Rows that differ in any of those three fields are
//   separate outages.
//   Rationale: Maynilad's table can list the same interruption once per barangay (e.g. Caloocan
//   rows 160/162/163 are the same repair, same window, same reason) — we collapse those so the UI
//   shows one interruption covering multiple barangays, not N duplicates.
//
// ID scheme:
//   sha1(concessionaire + startsAt.toISOString() + sorted-barangay-names-joined-by-"|").
//   Stable, deterministic, no external dep (Node crypto).

import { OutageSchema, OutageConfidence, type Outage as OutageSchemaType } from '@/lib/schemas/outage';
import { createHash } from 'node:crypto';
import {
  parseHtmlTable,
  type ParsedTable,
  isEmptyFragment,
  ParseError,
} from './parse-html-table';
import { rowToPartialOutage, type PartialOutageRow } from './row-to-partial-outage';

const MAYNI_BASE = 'https://www.mayniladwater.com.ph/wp-json/interruptions';
const ENDPOINTS = ['emergency', 'scheduled', 'rotational'] as const;
type MayniladEndpoint = (typeof ENDPOINTS)[number];

const THROTTLE_MS = 1000;
const FETCH_TIMEOUT_MS = 60_000;

export type MayniladFetchResult = {
  outages: OutageSchemaType[];
  freshness: import('@/lib/schemas/freshness').DataFreshness;
  sourceErrors: string[];
  fetchedAt: Date;
};

// ---------- throttled fetch ----------

let lastFetchAt = 0;
function throttledFetch(url: string, signal?: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const wait = Math.max(0, THROTTLE_MS - (now - lastFetchAt));
    setTimeout(() => {
      lastFetchAt = Date.now();
      fetchWithTimeout(url, FETCH_TIMEOUT_MS, signal)
        .then(resolve)
        .catch(reject);
    }, wait);
  });
}

function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { signal: signal ?? ctrl.signal })
    .then((res) => {
      clearTimeout(timer);
      return res;
    })
    .catch((err) => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`fetch timed out after ${timeoutMs}ms: ${url}`);
      }
      throw err;
    });
}

// ---------- fetch one endpoint ----------

async function fetchMayniladEndpoint(
  type: MayniladEndpoint,
  signal?: AbortSignal,
): Promise<{ rows: PartialOutageRow[]; header: string[] }> {
  const url = `${MAYNI_BASE}/${type}`;
  const res = await throttledFetch(url, signal);

  if (!res.ok) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) {
    throw new Error(`${url} returned content-type ${res.headers.get('content-type')}, expected application/json`);
  }

  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    throw new Error(`failed to read body from ${url}: ${err}`);
  }

  // The response is a JSON object whose value is a string containing the HTML fragment.
  // Try to extract that string. The observed shape is a top-level JSON string; defend for
  // the case where it's wrapped in { "something": "<html>..." }.
  let fragment: string | null = null;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === 'string') {
      fragment = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Hunt for the first string value that looks like an HTML fragment.
      const found = findHtmlFragmentValue(parsed);
      if (found) fragment = found;
    }
  } catch {
    throw new Error(`failed to parse JSON from ${url}`);
  }

  if (!fragment) {
    throw new Error(`no HTML fragment found in response from ${url}`);
  }

  if (isEmptyFragment(fragment)) {
    return { rows: [], header: [] };
  }

  let table: ParsedTable;
  try {
    table = parseHtmlTable(fragment);
  } catch (err) {
    if (err instanceof ParseError) {
      throw new Error(`parse error on ${url}: ${err.message}`);
    }
    throw err;
  }

  const header = table.headers;
  const rows: PartialOutageRow[] = [];
  for (const cells of table.rows) {
    const row = rowToPartialOutage(cells, type, header);
    if (row) rows.push(row);
  }
  return { rows, header };
}

function findHtmlFragmentValue(obj: Record<string, unknown>): string | null {
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().startsWith('<')) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = findHtmlFragmentValue(v as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------- grouping ----------

/** Grouping key: rows that share these three are the same interruption. */
function groupKey(row: PartialOutageRow): string {
  const sa = row.startsAt?.toISOString() ?? '___null___';
  const ea = row.endsAt?.toISOString() ?? '___null___';
  const r = row.reason.trim().toLowerCase();
  return `${sa}||${ea}||${r}`;
}

// ---------- build Outage ----------

function buildOutage(
  rows: PartialOutageRow[],
  type: MayniladEndpoint,
): OutageSchemaType | null {
  // Smallest startsAt among the group = the outage startsAt.
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let unanchored = false;
  const barangaySet = new Map<string, string>(); // name -> city
  const reasons = new Set<string>();

  for (const r of rows) {
    reasons.add(r.reason.trim());
    if (r.startsAt) {
      if (!startsAt || r.startsAt < startsAt) startsAt = r.startsAt;
    } else {
      // A row with no anchored start can't form an outage.
      unanchored = true;
    }
    // endsAt = latest end among the group, but only if consistent; if mixed, prefer the latest.
    if (r.endsAt) {
      if (!endsAt || r.endsAt > endsAt) endsAt = r.endsAt;
    }
    for (const b of r.barangays) {
      barangaySet.set(b.name, r.city || b.name);
    }
  }

  // Affected areas: one entry per distinct barangay, with city.
  const affectedAreas = [...barangaySet.entries()].map(([name, city]) => ({
    barangays: [{ name, city, province: 'Metro Manila' as const, psgcCode: undefined }],
    streets: [] as string[],
    notes: '',
  }));

  const reason = [...reasons][0] ?? '';

  // If any row in the group had an inferred barangay, mark the whole outage inferred.
  const anyInferred = rows.some((r) => r.barangays.some((b) => b.confidence === 'inferred'));
  const confidence: OutageConfidence = anyInferred ? 'inferred' : 'official';

  // If any row in the group had no parseable start, drop the whole group rather than
  // building an outage with an unanchored start.
  if (unanchored || !startsAt) return null;

  // ID
  const sortedNames = [...barangaySet.keys()].sort();
  const id = makeOutageId('maynilad', startsAt, sortedNames);

  return {
    id,
    concessionaire: 'maynilad',
    status: rows[0]?.status ?? 'unknown',
    reason,
    startsAt,
    endsAt: endsAt ?? undefined,
    estimatedRestoration: undefined,
    affectedAreas,
    source: {
      url: `${MAYNI_BASE}/${type}`,
      fetchedAt: new Date(),
      raw: '',
    },
    confidence,
  };
}

function makeOutageId(
  concessionaire: string,
  startsAt: Date | null,
  barangayNames: string[],
): string {
  const sa = startsAt?.toISOString() ?? 'none';
  const key = [concessionaire, sa, ...barangayNames.sort()].join('|');
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// ---------- public API ----------

export async function fetchMayniladOutages(opts?: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<MayniladFetchResult> {
  const fetchedAt = new Date();
  const sourceErrors: string[] = [];
  const allRows: Array<{ row: PartialOutageRow; type: MayniladEndpoint }> = [];

  for (const type of ENDPOINTS) {
    try {
      const { rows } = await fetchMayniladEndpoint(type, opts?.signal);
      for (const row of rows) {
        allRows.push({ row, type });
      }
    } catch (err) {
      sourceErrors.push(`${type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Group rows by (startsAt, endsAt, reason) and build one Outage per group.
  const groups = new Map<string, Array<{ row: PartialOutageRow; type: MayniladEndpoint }>>();
  for (const entry of allRows) {
    const k = groupKey(entry.row);
    let g = groups.get(k);
    if (!g) {
      g = [];
      groups.set(k, g);
    }
    g.push(entry);
  }

  const outages: OutageSchemaType[] = [];
  for (const entries of groups.values()) {
    // Build one outage from the group. Use the type of the first entry as the source URL context.
    const first = entries[0]!;
    const outage = buildOutage(entries.map((e) => e.row), first.type);
    // Ungroupable rows (no anchored start) are dropped rather than guessed at.
    if (!outage) continue;
    // Re-fetch source URL to the specific endpoint we used (best effort).
    outage.source.url = `${MAYNI_BASE}/${first.type}`;
    outage.source.fetchedAt = fetchedAt;
    outages.push(outage);
  }

  // Validate every built outage through the schema. A failing outage is dropped (logged to
  // sourceErrors) rather than failing the whole fetch.
  const validated: OutageSchemaType[] = [];
  for (const o of outages) {
    const result = OutageSchema.safeParse(o);
    if (result.success) {
      validated.push(result.data);
    } else {
      sourceErrors.push(`outage validation failed: ${JSON.stringify(result.error.issues)}`);
    }
  }

  // Freshness: 'unavailable' only if ALL endpoints failed.
  const freshness =
    validated.length === 0 && sourceErrors.length > 0 ? 'unavailable' : 'fresh';

  return { outages: validated, freshness, sourceErrors, fetchedAt };
}
