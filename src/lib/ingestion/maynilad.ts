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
//   - Pagination cursor: the homepage's own "Load More" handler sends the container's data-next as the
//     `id` param (`var params = { city: cityFilter, id: jQuery('#emergency_sched').attr('data-next') }`)
//     and reads `response.html` / `response.next` back, so a continuation is `?id=<data-next>` and its
//     answer is { next, html } where html is a bare <tr> list with no <table> and no <thead>, and
//     `next` arrives as a JSON number, not a string.
//     `?page=` and `?next=` do nothing (recon round 3) — only `?id=<cursor>` paginates.
//   - Pagination rules: at most MAX_PAGES pages per endpoint, a PAGE_GAP_MS pause before each cursor
//     request, and a page whose body is byte-identical to the previous one ends the loop (data-page and
//     data-next live inside the body, so identical bytes mean the cursor is not moving). Stopping at the
//     cap rather than at a natural end sets `truncated` — that means rows we did not read, and the UI
//     must not present the outage list as complete when it is set.
//   - Every result carries per-endpoint counters (`endpoints`), including a `stoppedReason` so a
//     capped read is distinguishable from a finished one: 'byte-identical' (a page repeated the
//     previous body), 'data-max-reached' (the server handed back no new cursor — what reaching the
//     last advertised page looks like on the wire, and also what an endpoint with no cursor at all
//     reports), 'cap-hit' (a live cursor was left unread at MAX_PAGES) or 'fetch-error'.
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
  parseHtmlRows,
  type ParsedTable,
  isEmptyFragment,
  ParseError,
} from './parse-html-table';
import { rowToPartialOutage, type PartialOutageRow } from './row-to-partial-outage';
import { deriveProvince } from '@/lib/utils/province';

const MAYNI_BASE = 'https://www.mayniladwater.com.ph/wp-json/interruptions';
const ENDPOINTS = ['emergency', 'scheduled', 'rotational'] as const;
type MayniladEndpoint = (typeof ENDPOINTS)[number];

const THROTTLE_MS = 1000;
const FETCH_TIMEOUT_MS = 60_000;

/** Hard cap on pages per endpoint (page 1 included). */
const MAX_PAGES = 20;
/** Pause before asking for another page, so a paginated run stays gentle. */
const PAGE_GAP_MS = 500;

export type MayniladFetchResult = {
  outages: OutageSchemaType[];
  freshness: import('@/lib/schemas/freshness').DataFreshness;
  sourceErrors: string[];
  fetchedAt: Date;
  /** Total page requests made across all endpoints (page 1 of each endpoint counts as one). */
  pagesFetched: number;
  /** True when an endpoint stopped because of MAX_PAGES while a cursor was still live. */
  truncated: boolean;
  /** Per-endpoint counters, in ENDPOINTS order — one entry per endpoint, errored ones included. */
  endpoints: MayniladEndpointStats[];
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

// ---------- fetch one endpoint (paginated) ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch a URL through the throttle and hand back its body, refusing non-JSON answers. */
async function fetchJsonText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await throttledFetch(url, signal);

  if (!res.ok) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) {
    throw new Error(`${url} returned content-type ${res.headers.get('content-type')}, expected application/json`);
  }

  try {
    return await res.text();
  } catch (err) {
    throw new Error(`failed to read body from ${url}: ${err}`);
  }
}

/**
 * The pagination cursor is the wrapper's data-next attribute, so page 1's fragment already carries
 * the cursor for page 2 — no extra request is needed to find it.
 */
function readDataNext(fragment: string): string {
  const m = /data-next="([^"]*)"/.exec(fragment);
  return m ? m[1]!.trim() : '';
}

/** The wrapper's data-max attribute: how many pages the endpoint advertises in total. */
function readDataMax(fragment: string): number | null {
  const m = /data-max="(\d+)"/.exec(fragment);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** The wrapper's data-page attribute: which page this fragment is, counting from 1. */
function readDataPage(fragment: string): number {
  const m = /data-page="(\d+)"/.exec(fragment);
  return m ? Number.parseInt(m[1]!, 10) : 1;
}

/** Why an endpoint stopped. 'fetch-error' is set by the caller of the endpoint fetch. */
export type MayniladStopReason = 'byte-identical' | 'data-max-reached' | 'cap-hit' | 'fetch-error';

/** Per-endpoint counters, so a caller can tell a complete read from a capped one. */
export type MayniladEndpointStats = {
  endpoint: MayniladEndpoint;
  pagesFetched: number;
  rowsCollected: number;
  /**
   * Outages in the returned list whose group holds at least one row from this endpoint. Two
   * endpoints can share a group, so these can sum to more than `outages.length`.
   */
  outagesBuilt: number;
  stoppedReason: MayniladStopReason;
  /** data-max from page 1 (advertised page count), or null when the wrapper did not carry it. */
  dataMax: number | null;
  elapsedMs: number;
};

type EndpointStatsCore = Pick<
  MayniladEndpointStats,
  'pagesFetched' | 'dataMax' | 'stoppedReason'
>;

/** The endpoint fetch reports failures as data instead of throwing, so its progress survives them. */
type EndpointOutcome =
  | { ok: true; rows: PartialOutageRow[]; stats: EndpointStatsCore }
  | { ok: false; error: string; stats: EndpointStatsCore };

async function fetchMayniladEndpoint(
  type: MayniladEndpoint,
  signal: AbortSignal | undefined,
  maxPages: number,
): Promise<EndpointOutcome> {
  const url = `${MAYNI_BASE}/${type}`;
  const progress: EndpointStatsCore = {
    pagesFetched: 0,
    dataMax: null,
    // Covers page 1 offering no cursor at all: the endpoint advertises nothing further.
    stoppedReason: 'data-max-reached',
  };

  try {
    return await fetchMayniladEndpointPages(type, url, signal, maxPages, progress);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stats: { ...progress, stoppedReason: 'fetch-error' },
    };
  }
}

async function fetchMayniladEndpointPages(
  type: MayniladEndpoint,
  url: string,
  signal: AbortSignal | undefined,
  maxPages: number,
  progress: EndpointStatsCore,
): Promise<EndpointOutcome> {
  const body = await fetchJsonText(url, signal);
  progress.pagesFetched++;

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

  progress.dataMax = readDataMax(fragment);

  if (isEmptyFragment(fragment)) {
    return { ok: true, rows: [], stats: { ...progress } };
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

  // Follow the data-next cursor. The loop leaves a non-empty cursor behind only when it stopped at
  // the cap, which is what `truncated` reports.
  let cursor = readDataNext(fragment);
  let previousBody = body;
  let pageIndex = readDataPage(fragment);
  // True once the chain ended on its own terms, so a leftover cursor cannot be mistaken for a cap stop.
  let ended = false;

  while (cursor && progress.pagesFetched < maxPages) {
    if (progress.dataMax !== null && pageIndex >= progress.dataMax) {
      // The same rule the site uses to hide its own Load More button: nothing left to ask for.
      progress.stoppedReason = 'data-max-reached';
      ended = true;
      break;
    }

    await sleep(PAGE_GAP_MS);
    const pageBody = await fetchJsonText(`${url}?id=${encodeURIComponent(cursor)}`, signal);
    progress.pagesFetched++; // the request was made, whether or not it carried anything new

    // data-page and data-next live inside the body: identical bytes mean the cursor did not move,
    // so this is the last distinct page rather than a new one.
    if (pageBody === previousBody) {
      progress.stoppedReason = 'byte-identical';
      ended = true;
      break;
    }

    let html: string | null = null;
    let next: string | null = null;
    try {
      const parsed = JSON.parse(pageBody) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.html === 'string') html = obj.html;
        // The live endpoint sends `next` as a JSON number (48801), not a string — the site's own
        // handler passes it straight to jQuery.attr(), which stringifies. Accept both.
        if (typeof obj.next === 'string' || typeof obj.next === 'number') next = String(obj.next);
      }
    } catch {
      throw new Error(`failed to parse JSON from ${url}?id=${cursor}`);
    }

    if (html === null) {
      throw new Error(`cursor response from ${url}?id=${cursor} had no html rows`);
    }

    if (html.trim() === '') {
      // An empty row list means the server had nothing more for this cursor. That is the end of the
      // chain, not a parse failure: stopping here keeps every row already read. (Seen live on the
      // request past data-max; the data-max check above normally prevents asking at all.)
      progress.stoppedReason = 'data-max-reached';
      ended = true;
      break;
    }

    let pageRows: string[][];
    try {
      pageRows = parseHtmlRows(html, header);
    } catch (err) {
      if (err instanceof ParseError) {
        throw new Error(`parse error on ${url}?id=${cursor}: ${err.message}`);
      }
      throw err;
    }

    for (const cells of pageRows) {
      const row = rowToPartialOutage(cells, type, header);
      if (row) rows.push(row);
    }

    previousBody = pageBody;
    pageIndex++;
    const advanced = next ?? '';
    if (advanced === '' || advanced === cursor) {
      // No new cursor: the server says this was the last page.
      progress.stoppedReason = 'data-max-reached';
      ended = true;
      break;
    }
    cursor = advanced;
  }

  // A cursor still in hand after a stop that was not the chain's own end means the cap stopped us.
  if (!ended && cursor !== '') progress.stoppedReason = 'cap-hit';

  return { ok: true, rows, stats: { ...progress } };
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

/** Grouping key: rows that share these four are the same interruption. */
function groupKey(row: PartialOutageRow): string {
  const sa = row.startsAt?.toISOString() ?? '___null___';
  const ea = row.endsAt?.toISOString() ?? '___null___';
  const r = row.reason.trim().toLowerCase();
  const c = row.city ? row.city.trim().toLowerCase() : '___unknown___';
  return `${c}||${sa}||${ea}||${r}`;
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
    barangays: [{ name, city, province: deriveProvince(city), psgcCode: undefined }],
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
  /** Page cap per endpoint; defaults to MAX_PAGES. Mainly for bounded smoke runs. */
  maxPages?: number;
}): Promise<MayniladFetchResult> {
  const fetchedAt = new Date();
  const sourceErrors: string[] = [];
  const allRows: Array<{ row: PartialOutageRow; type: MayniladEndpoint }> = [];
  const maxPages = Math.max(1, opts?.maxPages ?? MAX_PAGES);
  let pagesFetched = 0;
  let truncated = false;
  const endpoints: MayniladEndpointStats[] = [];

  for (const type of ENDPOINTS) {
    const startedAt = Date.now();
    const outcome = await fetchMayniladEndpoint(type, opts?.signal, maxPages);
    pagesFetched += outcome.stats.pagesFetched;
    if (outcome.stats.stoppedReason === 'cap-hit') truncated = true;
    if (!outcome.ok) sourceErrors.push(`${type}: ${outcome.error}`);
    for (const row of outcome.ok ? outcome.rows : []) {
      allRows.push({ row, type });
    }
    endpoints.push({
      endpoint: type,
      rowsCollected: outcome.ok ? outcome.rows.length : 0,
      outagesBuilt: 0, // filled in once the groups are validated
      elapsedMs: Date.now() - startedAt,
      ...outcome.stats,
    });
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
  const outageOrigins: MayniladEndpoint[][] = [];
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
    outageOrigins.push([...new Set(entries.map((e) => e.type))]);
  }

  // Validate every built outage through the schema. A failing outage is dropped (logged to
  // sourceErrors) rather than failing the whole fetch.
  const validated: OutageSchemaType[] = [];
  const validatedOrigins: MayniladEndpoint[][] = [];
  for (let i = 0; i < outages.length; i++) {
    const result = OutageSchema.safeParse(outages[i]);
    if (result.success) {
      validated.push(result.data);
      validatedOrigins.push(outageOrigins[i]!);
    } else {
      sourceErrors.push(`outage validation failed: ${JSON.stringify(result.error.issues)}`);
    }
  }

  // Attribute each surviving outage back to every endpoint that fed its group.
  for (const stats of endpoints) {
    stats.outagesBuilt = validatedOrigins.filter((types) => types.includes(stats.endpoint)).length;
  }

  // Freshness: 'unavailable' only if ALL endpoints failed.
  const freshness =
    validated.length === 0 && sourceErrors.length > 0 ? 'unavailable' : 'fresh';

  return {
    outages: validated,
    freshness,
    sourceErrors,
    fetchedAt,
    pagesFetched,
    truncated,
    endpoints,
  };
}
