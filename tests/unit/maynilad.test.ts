import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHtmlTable, ParseError, isEmptyFragment } from '@/lib/ingestion/parse-html-table';
import { parseMayniladDate, parseMayniladTimeWindow } from '@/lib/ingestion/parse-maynilad';
import { normalizeBarangays } from '@/lib/ingestion/barangay-normalize';
import { rowToPartialOutage } from '@/lib/ingestion/row-to-partial-outage';
import { fetchMayniladOutages } from '@/lib/ingestion/maynilad';
import { OutageSchema } from '@/lib/schemas/outage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '..', '..', 'src', 'lib', 'ingestion', '__fixtures__', 'raw');

function readRaw(name: string): string {
  return fs.readFileSync(path.join(RAW_DIR, name), 'utf8');
}

// ---------- parse-html-table: fixture bytes ----------

const emergencyRaw = readRaw('maynilad-wp_jsoninterruptionsemergency.json');
const rotationalRaw = readRaw('maynilad-wp_jsoninterruptionsrotational.json');

describe('parseHtmlTable (Maynilad fragment)', () => {
  test('parses the saved emergency fixture: 5 rows, 7 columns', () => {
    const parsed = JSON.parse(emergencyRaw) as string;
    const table = parseHtmlTable(parsed);
    expect(table.headers).toEqual([
      'City',
      'Barangay',
      'Specific Area',
      'From',
      'To',
      'Time',
      'Reason',
    ]);
    expect(table.rows).toHaveLength(5);
  });

  test('each emergency row has exactly 7 cells', () => {
    const table = parseHtmlTable(JSON.parse(emergencyRaw) as string);
    for (const row of table.rows) {
      expect(row).toHaveLength(7);
    }
  });

  test('decodes common HTML entities in cells', () => {
    const fragment =
      '<table class="advisory-table"><thead><th>City</th><th>Barangay</th></tr>' +
      '<tr><td>Quezon City &amp; Manila</td><td>Brgy. &quot;Holy Spirit&quot;</td></tr></table>';
    const table = parseHtmlTable(fragment);
    expect(table.headers).toEqual(['City', 'Barangay']);
    expect(table.rows).toEqual([['Quezon City & Manila', 'Brgy. "Holy Spirit"']]);
  });

  test('isEmptyFragment is true for the rotational empty fragment', () => {
    expect(isEmptyFragment(JSON.parse(rotationalRaw) as string)).toBe(true);
  });

  test('throws ParseError on input with no advisory-table', () => {
    expect(() => parseHtmlTable('just a string with no table')).toThrow(ParseError);
  });

  test('throws ParseError when a row has the wrong number of cells', () => {
    const fragment =
      '<table class="advisory-table"><thead><th>A</th><th>B</th></tr>' +
      '<tr><td>1</td></tr></table>';
    expect(() => parseHtmlTable(fragment)).toThrow(ParseError);
  });
});

// ---------- parse-maynilad: date + time ----------

describe('parseMayniladDate', () => {
  test('October 15, 2026 -> 2026-10-14T16:00:00.000Z (midnight Manila = 16:00 UTC previous day)', () => {
    expect(parseMayniladDate('October 15, 2026').toISOString()).toBe('2026-10-14T16:00:00.000Z');
  });

  test('October 01, 2026 (leading-zero day) parses', () => {
    expect(parseMayniladDate('October 01, 2026').toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });

  test('throws on unrecognized format', () => {
    expect(() => parseMayniladDate('not a date')).toThrow();
  });
});

describe('parseMayniladTimeWindow', () => {
  test('handles uppercase PM/AM', () => {
    expect(parseMayniladTimeWindow('11:00 PM to 6:00 AM')).toEqual({
      startH: 23,
      startM: 0,
      endH: 6,
      endM: 0,
    });
  });

  test('handles lowercase pm/am (observed verbatim in the Manila row)', () => {
    expect(parseMayniladTimeWindow('10:00 pm to 6:00 am')).toEqual({
      startH: 22,
      startM: 0,
      endH: 6,
      endM: 0,
    });
  });

  test('handles 12 AM/PM edge cases', () => {
    expect(parseMayniladTimeWindow('12:00 AM to 12:00 PM')).toEqual({
      startH: 0,
      startM: 0,
      endH: 12,
      endM: 0,
    });
  });

  test('throws on unrecognized format', () => {
    expect(() => parseMayniladTimeWindow('not a time')).toThrow();
  });
});

// ---------- normalizeBarangays ----------

describe('normalizeBarangays', () => {
  test('Brgy. Holy Spirit -> one official barangay', () => {
    expect(normalizeBarangays('Brgy. Holy Spirit')).toEqual([
      { name: 'Holy Spirit', confidence: 'official' },
    ]);
  });

  test('Brgys. 160, 162 and 163 -> three official barangays', () => {
    expect(normalizeBarangays('Brgys. 160, 162 and 163')).toEqual([
      { name: '160', confidence: 'official' },
      { name: '162', confidence: 'official' },
      { name: '163', confidence: 'official' },
    ]);
  });

  test('range + and form stays inferred (Anabu II-C to ... Malagasang II-A to ...)', () => {
    const range =
      'Brgys. Anabu II-C to Anabu II-E, Malagasang I-D to Malagasang I-G and Malagasang II-A to Malagasang II-F';
    expect(normalizeBarangays(range)).toEqual([{ name: range, confidence: 'inferred' }]);
  });

  test('strips trailing ", <City>" when mixed into the area cell', () => {
    // Observed verbatim in the emergency fixture: "at Don Jose Street, Quezon City".
    expect(normalizeBarangays('at Don Jose Street, Quezon City')).toEqual([
      { name: 'at Don Jose Street', confidence: 'official' },
    ]);
  });
});

// ---------- rowToPartialOutage ----------

const EMERGENCY_HEADER: string[] = [
  'City',
  'Barangay',
  'Specific Area',
  'From',
  'To',
  'Time',
  'Reason',
];

describe('rowToPartialOutage', () => {
  test('Quezon City Holy Spirit row maps cleanly', () => {
    const row = rowToPartialOutage(
      [
        'Quezon City',
        'Brgy. Holy Spirit',
        'at Don Jose Street, Quezon City',
        'October 15, 2026',
        'October 16, 2026',
        '11:00 PM to 6:00 AM',
        'Network Repair Activity',
      ],
      'emergency',
      EMERGENCY_HEADER,
    )!;
    expect(row.city).toBe('Quezon City');
    expect(row.specificArea).toBe('at Don Jose Street');
    expect(row.barangays).toEqual([{ name: 'Holy Spirit', confidence: 'official' }]);
    // 11:00 PM Manila on Oct 15 = 15:00 UTC Oct 15; 6:00 AM Manila on Oct 16 = 22:00 UTC Oct 15.
    expect(row.startsAt?.toISOString()).toBe('2026-10-15T15:00:00.000Z');
    expect(row.endsAt?.toISOString()).toBe('2026-10-15T22:00:00.000Z');
    expect(row.reason).toBe('Network Repair Activity');
    expect(row.status).toBe('active');
  });

  test('Caloocan 160/162/163 row -> three official barangays', () => {
    const row = rowToPartialOutage(
      [
        'Caloocan City ',
        'Brgys. 160, 162 and 163',
        'at Reparo corner Tullahan, Lucas Cuadra and Tullahan corner Petron, Sto. Nino, Caloocan City',
        'October 15, 2026',
        'October 16, 2026',
        '10:00 PM to 6:00 AM ',
        'Network Repair Activity ',
      ],
      'emergency',
      EMERGENCY_HEADER,
    )!;
    expect(row.barangays).toEqual([
      { name: '160', confidence: 'official' },
      { name: '162', confidence: 'official' },
      { name: '163', confidence: 'official' },
    ]);
  });

  test('rotational (no To column) still parses with endsAt null', () => {
    const rotHeader: string[] = ['City', 'Barangay', 'Specific Area', 'From', 'Time', 'Reason'];
    const row = rowToPartialOutage(
      ['Quezon City', 'Brgy. X', 'at Some Place', 'October 15, 2026', '10:00 PM to 6:00 AM', 'Something'],
      'rotational',
      rotHeader,
    )!;
    expect(row.endsAt).toBeNull();
    expect(row.status).toBe('scheduled');
  });

  test('a row with an unparseable date keeps startsAt null (skipped, not fatal)', () => {
    const row = rowToPartialOutage(
      ['Quezon City', 'Brgy. X', 'at Place', 'bad-date', 'October 16, 2026', '', 'Something'],
      'emergency',
      EMERGENCY_HEADER,
    )!;
    expect(row.startsAt).toBeNull();
    expect(row.reason).toBe('Something');
    expect(row.status).toBe('active');
  });

  test('fetchMayniladOutages returns separate outages for rows from different cities', async () => {
    const fragment =
      '<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th><th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>' +
      '<tr><td>Pasay City</td><td>Brgy. BF Homes</td><td>BF Homes Service Center</td><td>October 15, 2026</td><td>October 15, 2026</td><td>6:00 AM to 6:00 PM</td><td>Water Service Interruption</td></tr>' +
      '<tr><td>Quezon City</td><td>Brgy. Baesa</td><td>Baesa Elementary School</td><td>October 15, 2026</td><td>October 15, 2026</td><td>6:00 AM to 6:00 PM</td><td>Water Service Interruption</td></tr>' +
      '</tbody></table>';

    globalThis.fetch = mockMayniladFetch(fragment);

    const result = await fetchMayniladOutages({ maxPages: 1 });

    expect(result.outages).toHaveLength(2);
    expect(result.outages[0]!.affectedAreas[0]!.barangays[0]?.city).toBe('Pasay City');
    expect(result.outages[1]!.affectedAreas[0]!.barangays[0]?.city).toBe('Quezon City');
  });

});

// ---------- grouping + fetch (mocked) ----------


const MAKE_MOCK_RESPONSE = (
  fragment: string,
  status = 200,
  contentType = 'application/json; charset=UTF-8',
) =>
  new Response(JSON.stringify(fragment), {
    status,
    headers: { 'content-type': contentType },
  });

/**
 * Route the mock by endpoint: emergency + scheduled serve `fragment`, rotational serves the saved
 * empty fixture (Maynilad really does return an empty rotational table).
 */
function mockMayniladFetch(fragment: string) {
  return vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    return Promise.resolve(
      url.endsWith('/rotational')
        ? new Response(rotationalRaw, {
            status: 200,
            headers: { 'content-type': 'application/json; charset=UTF-8' },
          })
        : MAKE_MOCK_RESPONSE(fragment),
    );
  });
}

describe('fetchMayniladOutages (mocked)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('two identical rows collapse into ONE Outage with one affectedArea', async () => {
    const fragment = `<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th><th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>
<tr><td>Quezon City</td><td>Brgy. Holy Spirit</td><td>at Don Jose Street</td><td>October 15, 2026</td><td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Network Repair Activity</td></tr>
<tr><td>Quezon City</td><td>Brgy. Holy Spirit</td><td>at Don Jose Street</td><td>October 15, 2026</td><td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Network Repair Activity</td></tr>
</tbody></table>`;

    globalThis.fetch = mockMayniladFetch(fragment);
    const result = await fetchMayniladOutages();

    expect(result.sourceErrors).toHaveLength(0);
    expect(result.freshness).toBe('fresh');
    expect(result.outages).toHaveLength(1);
    const o = result.outages[0];
    expect(o).toBeDefined();
    if (!o) throw new Error('expected one outage');
    expect(o.affectedAreas).toHaveLength(1);
    expect(o.affectedAreas[0]?.barangays).toEqual([
      { name: 'Holy Spirit', city: 'Quezon City', province: 'Metro Manila', psgcCode: undefined },
    ]);
    expect(OutageSchema.safeParse(o).success).toBe(true);
  });

  test('rows that differ in reason stay separate outages', async () => {
    const fragment = `<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th><th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>
<tr><td>Quezon City</td><td>Brgy. A</td><td>at Place A</td><td>October 15, 2026</td><td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair X</td></tr>
<tr><td>Quezon City</td><td>Brgy. A</td><td>at Place A</td><td>October 15, 2026</td><td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair Y</td></tr>
</tbody></table>`;

    globalThis.fetch = mockMayniladFetch(fragment);
    const result = await fetchMayniladOutages();
    expect(result.outages).toHaveLength(2);
  });

  test('follows data-next as ?id=, adds page 2, and stops when page 3 repeats it', async () => {
    // Page 1 carries the cursor in its wrapper, exactly as the live endpoint does.
    const pageOne =
      '<div id="emergency_sched" class="table-container" data-page="1" data-max="9" data-next="111">' +
      '<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th>' +
      '<th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>' +
      '<tr><td>Quezon City</td><td>Brgy. One</td><td>at One</td><td>October 15, 2026</td>' +
      '<td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair One</td></tr>' +
      '</tbody></table></div>';

    // A cursor response is { next, html } with a bare <tr> list — no <table>, no <thead> — and the
    // live endpoint sends `next` as a number, so the mock does too.
    const pageTwo = JSON.stringify({
      next: 222,
      html:
        '<tr><td>Quezon City</td><td>Brgy. Two</td><td>at Two</td><td>October 16, 2026</td>' +
        '<td>October 17, 2026</td><td>10:00 PM to 6:00 AM</td><td>Repair Two</td></tr>' +
        '<tr><td>Quezon City</td><td>Brgy. Three</td><td>at Three</td><td>October 16, 2026</td>' +
        '<td>October 17, 2026</td><td>10:00 PM to 6:00 AM</td><td>Repair Three</td></tr>',
    });

    const requested: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      requested.push(url);
      const ok = {
        status: 200,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      };
      if (url.endsWith('/emergency')) return Promise.resolve(new Response(JSON.stringify(pageOne), ok));
      // Page 3 is byte-identical to page 2, so the loop must stop there. Cursor responses are
      // already JSON text ({ next, html }), so they are not stringified a second time.
      if (url.includes('/emergency?id=')) return Promise.resolve(new Response(pageTwo, ok));
      return Promise.resolve(
        new Response(rotationalRaw, {
          status: 200,
          headers: { 'content-type': 'application/json; charset=UTF-8' },
        }),
      );
    });

    const result = await fetchMayniladOutages();

    expect(result.sourceErrors).toEqual([]);
    expect(result.outages.map((o) => o.reason).sort()).toEqual([
      'Repair One',
      'Repair Three',
      'Repair Two',
    ]);
    expect(result.pagesFetched).toBe(5); // emergency 3 (page 1, ?id=111, ?id=222) + other two
    expect(result.truncated).toBe(false);
    expect(requested.filter((u) => u.includes('/emergency'))).toEqual([
      expect.stringContaining('/emergency'),
      expect.stringContaining('/emergency?id=111'),
      expect.stringContaining('/emergency?id=222'),
    ]);
    // Five requests at the 1s politeness throttle plus two 500ms cursor gaps outlast the default.
  }, 15_000);

  test('an empty cursor page ends the chain and keeps the rows already read', async () => {
    // Seen live on the request past data-max: an empty <tr> body is the end of the data, not a parse
    // failure. Treating it as fatal used to throw away every row collected before it.
    const pageOne =
      '<div id="emergency_sched" class="table-container" data-page="1" data-max="9" data-next="111">' +
      '<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th>' +
      '<th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>' +
      '<tr><td>Quezon City</td><td>Brgy. One</td><td>at One</td><td>October 15, 2026</td>' +
      '<td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair One</td></tr>' +
      '</tbody></table></div>';

    const requested: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      requested.push(url);
      const ok = { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } };
      if (url.endsWith('/emergency')) return Promise.resolve(new Response(JSON.stringify(pageOne), ok));
      if (url.includes('/emergency?id=')) {
        return Promise.resolve(new Response(JSON.stringify({ next: 222, html: '' }), ok));
      }
      return Promise.resolve(new Response(rotationalRaw, ok));
    });

    const result = await fetchMayniladOutages();

    expect(result.sourceErrors).toEqual([]);
    expect(result.outages.map((o) => o.reason)).toEqual(['Repair One']);
    expect(result.endpoints[0]?.stoppedReason).toBe('data-max-reached');
    expect(result.endpoints[0]?.rowsCollected).toBe(1);
    expect(result.endpoints[0]?.pagesFetched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(requested.filter((u) => u.includes('/emergency'))).toHaveLength(2);
  }, 15_000);

  test('hitting the page cap stops with a live cursor and reports truncated', async () => {
    // The mirror image of the previous test: the chain keeps moving, so the cap is what stops us and
    // the result has to say so — a capped read is not a complete one.
    const pageOne =
      '<div id="emergency_sched" class="table-container" data-page="1" data-max="9" data-next="111">' +
      '<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th>' +
      '<th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>' +
      '<tr><td>Quezon City</td><td>Brgy. One</td><td>at One</td><td>October 15, 2026</td>' +
      '<td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair One</td></tr>' +
      '</tbody></table></div>';

    const pageTwo = JSON.stringify({
      next: 222,
      html:
        '<tr><td>Quezon City</td><td>Brgy. Two</td><td>at Two</td><td>October 16, 2026</td>' +
        '<td>October 17, 2026</td><td>10:00 PM to 6:00 AM</td><td>Repair Two</td></tr>',
    });

    const requested: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      requested.push(url);
      const ok = { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } };
      if (url.endsWith('/emergency')) return Promise.resolve(new Response(JSON.stringify(pageOne), ok));
      // Only ?id=111 may be asked for: maxPages is 2, so page 1 + this page is all we are allowed.
      if (url.endsWith('/emergency?id=111')) {
        return Promise.resolve(new Response(pageTwo, ok));
      }
      if (url.includes('/emergency?id=')) {
        throw new Error(`requested past the cap: ${url}`);
      }
      return Promise.resolve(new Response(rotationalRaw, ok));
    });

    const result = await fetchMayniladOutages({ maxPages: 2 });

    expect(result.truncated).toBe(true);
    expect(result.endpoints[0]?.stoppedReason).toBe('cap-hit');
    expect(result.endpoints[0]?.pagesFetched).toBe(2);
    expect(result.outages.map((o) => o.reason).sort()).toEqual(['Repair One', 'Repair Two']);
    expect(requested.filter((u) => u.includes('/emergency'))).toHaveLength(2);
  }, 15_000);

  test('a mid-run abort keeps the rows already read and marks the read incomplete', async () => {
    // The overall deadline (or a caller's abort) can fire while a page is in flight. Rows from pages
    // already read must survive that, and the result must not present itself as a complete read.
    const pageOne =
      '<div id="emergency_sched" class="table-container" data-page="1" data-max="9" data-next="111">' +
      '<table class="advisory-table"><thead><tr><th>City</th><th>Barangay</th><th>Specific Area</th>' +
      '<th>From</th><th>To</th><th>Time</th><th>Reason</th></tr></thead><tbody>' +
      '<tr><td>Quezon City</td><td>Brgy. One</td><td>at One</td><td>October 15, 2026</td>' +
      '<td>October 16, 2026</td><td>11:00 PM to 6:00 AM</td><td>Repair One</td></tr>' +
      '</tbody></table></div>';

    const controller = new AbortController();
    const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    globalThis.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const ok = { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } };
      if (url.endsWith('/emergency')) return Promise.resolve(new Response(JSON.stringify(pageOne), ok));
      if (url.includes('/emergency?id=')) {
        // Abort while this page is in flight, exactly as the deadline does.
        controller.abort();
        return Promise.reject(abortError());
      }
      return Promise.resolve(new Response(rotationalRaw, ok));
    });

    const result = await fetchMayniladOutages({ signal: controller.signal });

    expect(result.outages.map((o) => o.reason)).toEqual(['Repair One']);
    expect(result.endpoints[0]?.stoppedReason).toBe('aborted');
    expect(result.truncated).toBe(true);
  }, 15_000);

  test('all endpoints failing yields freshness unavailable + sourceErrors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchMayniladOutages();
    expect(result.outages).toHaveLength(0);
    expect(result.freshness).toBe('unavailable');
    expect(result.sourceErrors.length).toBeGreaterThan(0);
  });
});
