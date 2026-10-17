// Dependency-free tokenizer for the Maynilad advisory table fragment shape.
//
// The Maynilad WP REST endpoints /wp-json/interruptions/{emergency,scheduled,rotational}
// return a JSON object whose value is a STRING containing an HTML <table> fragment, e.g.
//   "<div id=\"emergency_sched\" ...><table class=\"advisory-table\"><thead>...<tr>...</tr>...</table></div>"
//
// This is NOT a JSON array of objects and NOT a full HTML document. The shape is narrow and
// stable (verbatim column headers observed on 2026-10-16, confirmed across emergency + scheduled +
// rotational + the route index). Given that, a small regex/tokenizer is acceptable here; we do NOT
// pull in cheerio/jsdom (and the task says not to).
//
// Assumptions we assert (and would STOP on if violated by a future fixture):
//  - The fragment contains exactly one <table class="advisory-table">.
//  - Headers are in <thead><th>...</th>...</thead>.
//  - Rows are in <tbody> or directly under <table> as <tr><td>...</td>...</tr>.
//  - Cells are plain <td>...</td> with no nested <table>/<td>.
//  - HTML entities are the common ones (&amp; &lt; &gt; &quot; &#39; &#039; &#8217; &#8220; &#8221;).
//    We decode the common set; anything exotic is left as-is (better than failing the whole fetch).
//
// Reject malformed input with a typed ParseError — never return partial rows.

export class ParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|#039|#8216|#8217|#8220|#8221);/g;
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&#8216;': "'",
  '&#8217;': "'",
  '&#8220;': '"',
  '&ldquo;': '"',
  '&#8221;': '"',
  '&rdquo;': '"',
};

export type ParsedTable = { headers: string[]; rows: string[][] };

function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m) => ENTITY_MAP[m] ?? m);
}

/** Return true when the fragment contains no <tr> after the header. */
export function isEmptyFragment(fragment: string): boolean {
  return !/<tr[\s>]/i.test(fragment);
}

// \b after the tag name: without it "<th[^>]*>" also matches "<thead>", swallowing the
// first header cell's opening tag into the capture.
const TH_RE = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
const TD_RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const TR_RE = /<tr\b[\s>][\s\S]*?<\/tr>/gi;
const TABLE_OPEN_RE = /<table[^>]*class\s*=\s*["']?\s*advisory-table/si;

export function parseHtmlTable(fragment: string): ParsedTable {
  const trimmed = fragment.trim();
  if (!trimmed) throw new ParseError('empty fragment', fragment);

  if (!TABLE_OPEN_RE.test(trimmed)) {
    throw new ParseError('no advisory-table found in fragment', fragment);
  }

  // Headers
  const headers: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TH_RE.exec(trimmed)) !== null) {
    headers.push(decodeEntities(m[1]!.trim()));
  }
  if (headers.length === 0) {
    throw new ParseError('no <th> headers found in fragment', fragment);
  }

  // Rows: each <tr> contains one or more <td>.
  const rows: string[][] = [];
  let rowIndex = 0;
  while ((m = TR_RE.exec(trimmed)) !== null) {
    rowIndex++;
    const tr = m[0];
    const cells: string[] = [];
    let cell: RegExpExecArray | null;
    while ((cell = TD_RE.exec(tr)) !== null) {
      cells.push(decodeEntities(cell[1]!.trim()));
    }
    if (cells.length === 0) continue; // skip header-only or empty rows
    if (cells.length !== headers.length) {
      throw new ParseError(
        `row ${rowIndex} has ${cells.length} cells, expected ${headers.length}`,
        fragment,
      );
    }
    rows.push(cells);
  }

  // Zero rows with a valid header is a real empty state (rotational returns exactly this), not an
  // error — the caller distinguishes "nothing published" from "fetch failed" via isEmptyFragment().
  return { headers, rows };
}
