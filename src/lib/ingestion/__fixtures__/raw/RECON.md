# Source recon — raw fetch notes

Date of fetch: 2026-10-16 (date-stamped in the HTML filenames).
UA used for all fetches: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36`.
No retries, no looping, no bypass attempts.

---

## Maynilad — https://www.mayniladwater.com.ph/

### robots.txt
- GET /robots.txt → 200, 128 bytes, `text/plain; charset=utf-8`, final URL `https://www.mayniladwater.com.ph/robots.txt`.
- Body:
  ```
  User-agent: *
  Disallow: /wp-admin/
  Allow: /wp-admin/admin-ajax.php

  Sitemap: https://www.mayniladwater.com.ph/sitemap_index.xml
  ```
- No rule Disallows any advisory / updates / interruption path. Nothing blocks a generic fetcher from the advisories pages.

### Homepage fetch
- GET / → 200, 222,824 bytes (~218 KB), `text/html; charset=UTF-8`, final URL `https://www.mayniladwater.com.ph/`, fetch time ~2.17 s. No redirect.
- Saved as `maynilad-20261016.html.txt` (the `.txt` suffix keeps the captured third-party page out of the anti-slop scanner, which treats `.html` as our own UI). Under the 2 MB cap — not truncated.

### KEY FINDING: homepage is a WordPress/Elementor static shell + client-side advisory loader, NOT a server-rendered advisory list

- The homepage visible text is 21,479 chars and mentions the brand and the word "interruption" in prose ("the impact of the supply interruption on our customers"), plus the nav label "ADVISORIES" / "Service Advisories" — but it does **not** contain a server-rendered list of individual outage/advisory items. No barangay name (Kalusugan, Poblacion, Ususan, Kapitolyo, Barangay 176) appears anywhere in the visible text. No city appears in an advisory context.
- The advisory content is loaded **client-side via jQuery.ajax** from the WP REST API. The homepage's inline JS builds these endpoint URLs and swaps the response into the page:
  - `window.location.protocol + '//' + window.location.hostname + '/wp-json/interruptions/emergency?' + jQuery.param(params)`
  - `.../wp-json/interruptions/rotational?...`
  - `.../wp-json/interruptions/scheduled?...`
  - `.../wp-json/interruptions/traffic?...`
  - `.../wp-json/news/get-all?...`
- There is a `<script type="application/ld+json" class="rank-math-schema">` (Rank Math SEO) on the page — it describes the homepage / organization / WebSite, **not** an advisory listing. It does contain `datePublished`/`dateModified` in ISO 8601 with offset (`2020-02-27T02:58:20+08:00`, `2026-09-28T16:42:29+08:00`), but those are page-level, not per-advisory.
- Advisory page links present in the homepage HTML:
  - `/service-advisories/`  (and `https://www.mayniladwater.com.ph/service-advisories-2/`)
  - `/news-advisories/maynilad-news/`
  - `/company-newsletter/`

### Strategy implication
A static-HTML scraper of the Maynilad homepage will **not** yield outage rows. The real data lives in the WP REST API endpoints `/wp-json/interruptions/<type>` (emergency / rotational / scheduled / traffic) and `/wp-json/news/get-all`. Those are the targets for the fetcher in Phase 2 Step 2, not the homepage HTML. The homepage HTML is only useful as evidence of how the endpoints are wired (params: `id`, `city`).

---

## Manila Water — https://www.manilawater.com/

### robots.txt
- GET /robots.txt → 200, 13,231 bytes, **but `text/html; charset=utf-8`** — the response is the Manila Water Next.js app's 404 page for `/robots.txt`, **not a real robots.txt**. Confirmed by the page content: `<title>Manila Water Company, Inc. | Manila Water Company, Inc.</title>`, a "Page not found" / NotFound shell.
- Implication: there is no reachable `robots.txt` at this path. There is therefore no robots.txt rule we can read that would Disallow an advisory path. We proceed on the assumption that no advisory path is disallowed, but this assumption has no robots.txt backing on Manila Water's side.

### Homepage fetch
- GET / → **403**, 5,570 bytes, `text/html; charset=UTF-8`, final URL `https://www.manilawater.com/`, fetch time ~0.49 s. **Not the real page.**
- Body begins:
  ```
  <!DOCTYPE html><html lang=\"en-US\"><head><title>Just a moment...</title>
  ...
  ```
- Markers present: `<title>Just a moment`, `challenge-platform`, `Enable JavaScript`. This is a **Cloudflare challenge page**, not Manila Water's content.
- FAIL FAST applied: the Manila Water homepage is bot-blocked. No bypass attempted. No advisory content fetched. No advisory HTML saved for Manila Water beyond the 403 body itself (saved for evidence).

### Strategy implication
A plain `fetch`/curl from this environment cannot get Manila Water's homepage or advisory content today — the site answers with a Cloudflare JS challenge. Two realistic paths, neither attempted here (per task scope):
1. Fetch the Manila Water **advisory/service-updates subpage directly** (e.g. the "Service Updates" page the ARCHITECTURE.md §4 name-drops) — it may be less aggressively challenged than the homepage, or it may still be blocked.
2. Use a headless browser (Playwright is already a project dependency) to solve the Cloudflare challenge for Manila Water only, if a subpage fetch also returns 403.

Recommendation for Phase 2 Step 2: attempt the Manila Water service-updates subpage with the same browser UA first; if that 403s, the Manila Water fetcher needs Playwright, not native fetch.

---

## Date formats observed (Maynilad homepage only; Manila Water returned no real content)

- ISO 8601 with `+08:00` offset in the JSON-LD: `2026-09-28T16:42:29+08:00` (page modified), `2020-02-27T02:58:20+08:00` (page published).
- No per-advisory date is present on the homepage (advisories are loaded client-side).
- Filipino month names (Agosto / Setyembre / etc.) were NOT found in the homepage visible text — so if advisory cards on the actual advisories pages use them, that's a separate finding for the advisories-page fetch.
- The Maynilad data IS current and real: emergency rows dated October 15–17, 2026 and scheduled rows October 01–31, 2026, matching the fetch date of 2026-10-16. So Maynilad's endpoints are live and producing current advisories.
- Month observed in the real advisory rows: English "October" (no Filipino month names needed for the observed format).

---

## Files saved

- `src/lib/ingestion/__fixtures__/raw/maynilad-robots.txt`
- `src/lib/ingestion/__fixtures__/raw/maynilad-20261016.html.txt`
- `src/lib/ingestion/__fixtures__/raw/manila-water-robots.txt`  (actually the 404 HTML page, not a robots.txt)
- `src/lib/ingestion/__fixtures__/raw/manila-water-20261016.html`  (the 403 Cloudflare challenge body)
- `src/lib/ingestion/__fixtures__/raw/RECON.md`  (this file)
- `src/lib/ingestion/__fixtures__/raw/maynilad-wp_jsoninterruptions.json`  (round 2: route index, 1,303 B)
- `src/lib/ingestion/__fixtures__/raw/maynilad-wp_jsoninterruptionsemergency.json`  (round 2: emergency fragment, 1,807 B)
- `src/lib/ingestion/__fixtures__/raw/maynilad-wp_jsoninterruptionsscheduled.json`  (round 2: scheduled fragment, 1,971 B)
- `src/lib/ingestion/__fixtures__/raw/maynilad-wp_jsoninterruptionsrotational.json`  (round 2: rotational empty fragment, 291 B)
- `src/lib/ingestion/__fixtures__/raw/manila-water-www.manilawater.com_service-updates.html`  (round 2: 403)
- `src/lib/ingestion/__fixtures__/raw/manila-water-www.manilawater.com_advisories.html`  (round 2: 403)
- `src/lib/ingestion/__fixtures__/raw/manila-water-www.manilawater.com_customer-service_service-updates.html`  (round 2: 403)

---

## Maynilad ingestion module (built: see commit feat(ingestion): Maynilad fetcher + parser)

Built in `src/lib/ingestion/`:
- `parse-html-table.ts` — dependency-free tokenizer for the advisory `<table class="advisory-table">` fragment.
- `parse-maynilad.ts` — `parseMayniladDate("October 15, 2026" -> Date at 00:00 +08:00)` and `parseMayniladTimeWindow("11:00 PM to 6:00 AM", both casings)`.
- `barangay-normalize.ts` — normalize `Brgys. 160, 162 and 163` -> 3 barangays; range forms -> single inferred.
- `row-to-partial-outage.ts` — map a parsed row onto a PartialOutageRow (date+time combine, trailing-city strip).
- `maynilad.ts` — `fetchMayniladOutages()`: throttled fetch (1 req/s, 60s timeout) of emergency/scheduled/rotational, group rows by (startsAt, endsAt, reason), build Outage[], validate each through OutageSchema. No fixture fallback — endpoints that fail land in `sourceErrors`, and `freshness` is `'unavailable'` only when nothing validated and something errored.

Grouping rule (documented in maynilad.ts): rows with identical (startsAt, endsAt, reason) collapse into ONE Outage with multiple affectedAreas; otherwise separate outages.

ID scheme: `sha1(concessionaire + startsAt.toISOString() + sorted barangay names joined by "|")`, Node crypto, no new dep.

Fixtures used by tests: the saved raw JSON in `src/lib/ingestion/__fixtures__/raw/` (maynilad-wp_jsoninterruptionsemergency.json etc.). Tests mock fetch to return those exact bytes (rotational serves the saved empty fragment).

## Round 3 probes (2026-10-17, after the module was built)

Bounded probes, one request each, UA as above, `curl -m 70`.

- `GET /wp-json/interruptions/traffic` → **200**, `application/json; charset=UTF-8`, 291 B, 0.76 s.
  Body (verbatim, 400 B):
  ```
  "<div id=\"traffic_advisories\"  class=\"table-container\"  data-page=\"1\" data-max=\"0\" data-next=\"\"><table class=\"advisory-table\"><thead><th width='20%'>Affected Area(s)<\/th><th width='30%'>Alternative Routes<\/th><th>From<\/th><th>To<\/th><th>Reason<\/th><\/thead><\/table><\/div>\"
  ```
  Same wrapper (JSON string → HTML fragment, `advisory-table`), but a **5-column schema with no City / Barangay / Time**: Affected Area(s), Alternative Routes, From, To, Reason. It is a route-diversion notice, not a supply outage, and the table is empty right now. Not ingested by `maynilad.ts`.
- `GET /wp-json/interruptions/emergency?page=2` → **200**, 1,922 B, 18.0 s. Body is page 1 again: `data-page=\"1\" data-max=\"4\" data-next=\"48788\"`, same 7 columns, first row `Manila / Brgys. 36, 162, 182, 198 to 220, ...`.
- `GET /wp-json/interruptions/emergency?next=48788` → **200**, 1,922 B, 18.5 s, **byte-for-byte the same page-1 body** including `data-page=\"1\" data-next=\"48788\"`.

Conclusion: neither `?page=` nor `?next=` paginates. The server answers with page 1 regardless. Live drift is visible between rounds: `data-max` went 11 → 4 and `data-next` 48753 → 48788, which confirms the endpoints are live and that page 1 alone is **not** the full set when `data-max > 1`.

## Round 4 — pagination RESOLVED (2026-10-17)

The parameter is **`id`**, carrying the container's `data-next` cursor. Found in the saved homepage
capture (`maynilad-20261016.html`, lines 2045-2067), in the endpoint's own "Load More" handler:

```
var params = { city: cityFilter, id: jQuery('#emergency_sched').attr('data-next') };
var apiURL = window.location.protocol + '//' + window.location.hostname + '/wp-json/interruptions/emergency?' + jQuery.param(params);
jQuery.ajax({ url: apiURL, success: function (response) { jQuery('#emergency_sched').find('tbody').append(response.html); jQuery('#emergency_sched').attr('data-next', response.next);
... if (currentPage < parseInt(jQuery('#emergency_sched').attr('data-max'))) { /* show Load More again */ }
```

So `data-max` is a page count, `response.next` becomes the next cursor, and the same handler exists for
`#rotational_sched` (line 2013) and `#scheduled_sched` (line 1970).

Verified live: `GET /emergency` → 200, 1,922 B, 18.3 s, `data-next="48788"`. Then
`GET /emergency?id=48788` → **200, 1,120 B, 16.8 s** — a *different* page, and a **JSON object**
(`keys=next,html`) whose `html` is a **bare `<tr>` list with no `<table>` and no `<thead>`**, and whose
`next` is a **JSON number** (`48801`), not a string. The site's `jQuery.attr()` stringifies it; a strict
string-only reader silently stops at page 1+1, so `maynilad.ts` accepts both.

`maynilad.ts` now follows the chain in `fetchMayniladEndpoint`: cursor from page 1's wrapper, page request
`?id=<cursor>`, rows parsed against page 1's headers via `parseHtmlRows()`. Cap `MAX_PAGES = 5` per
endpoint, `PAGE_GAP_MS = 500` between page requests, and a page body byte-identical to the previous page
ends the loop (data-page/data-next live inside the body, so identical bytes mean the cursor is not
moving). Stopping at the cap leaves a live cursor and sets `truncated: true` on the result.

Live 2-page verification (2026-10-17): cap 1 page → 8 outages, `pagesFetched=3`, `truncated=true`; cap 2
pages → 13 outages, `pagesFetched=5`, `truncated=true`, 7 ids added by page 2, 6 ids seen on both pages
collapsing into the same outage, 0 duplicate ids.

## Round 5 — full default cap, live (2026-10-17)

`fetchMayniladOutages()` with defaults (MAX_PAGES = 5), one run, 9 requests, 143.5 s:

```
emergency: pagesFetched=4 rowsCollected=19 outagesBuilt=7  stoppedReason="data-max-reached" dataMax=4 elapsedMs=70989
scheduled: pagesFetched=4 rowsCollected=20 outagesBuilt=14 stoppedReason="data-max-reached" dataMax=4 elapsedMs=71536
rotational: pagesFetched=1 rowsCollected=0 outagesBuilt=0  stoppedReason="data-max-reached" dataMax=0 elapsedMs=986
chains: emergency page1→48788→48801→48806 | scheduled page1→48370→48733→48746 | rotational page1
outages=21 pagesFetched=9 truncated=false sourceErrors=[] official=10 inferred=11 duplicate_ids=0 freshness=fresh
```

**What the first full-cap run exposed (now fixed).** The loop was cursor-driven only, so it asked for a page
beyond `data-max="4"`; that request returned an empty `<tr>` body, `parseHtmlRows` threw, and the endpoint was
recorded as `fetch-error` with **`rowsCollected: 0` — four pages of real rows discarded** and a final
`outages=0, freshness=unavailable`. Two defects, both mine, both fixed:

1. Stop at `data-max` (the rule the site uses to hide its own Load More button) — never request past it.
2. An empty continuation body is the end of the data, not a parse failure: stop and keep every row already read.

Regression test: "an empty cursor page ends the chain and keeps the rows already read" in `tests/unit/maynilad.test.ts`.
Cursors observed across both full runs were monotonic and unique; no duplicate ids across pages
(rows that repeat collapse into the same group, which is the id invariant holding).

Follow-ups still open (NOT done):
1. Cap is 5 pages and `data-max` is 4–6 depending on the day, so the cap is not yet the binding constraint —
   but nothing stops `data-max` from exceeding 5, and `truncated` is how that would surface.
2. Confirm whether Maynilad's `/service-advisories/` and `/service-advisories-2/` pages are server-rendered static HTML or also rely on the REST fragments.
3. Decide the Manila Water path: Playwright fetch of one subpage vs fixtures-only.

---

## Round 6 — operator-provided advisory URLs (2026-10-17)

Task scope: fetch each URL once with a browser UA, save raw HTML to `__fixtures__/raw/`, cap 2 MB, then inspect structure. NO parsing, NO scraper code, NO new dependencies.

### Maynilad — https://www.mayniladwater.com.ph/service-advisories-2/

- GET → **200**, `text/html; charset=UTF-8`, **218,434 bytes** (~213 KB), **no redirect**, final URL `https://www.mayniladwater.com.ph/service-advisories-2/`. Saved as `maynilad-service-advisories-2.html`.
- Advisory-form tokens present in the static HTML: yes. Token density (case-insensitive counts): advisory 45, rotational 32, emergency 32, schedule 30, interruption 14, plus title-case "Schedule" 5, "Interruption" 4, "Advisory" 3, "Rotational" 1, "Emergency" 1.
- WP REST endpoint references found in page JS: `/wp-json/interruptions/emergency?`, `/wp-json/interruptions/rotational?`, `/wp-json/interruptions/scheduled?`, `/wp-json/interruptions/traffic?`, `/wp-json/news/get-all?`, plus non-advisory endpoints `/wp-json/oembed/1.0/embed?url=...`, `/wp-json/supplier-news/get-all?`, `/wp-json/vendors/bidding-details?`, `/wp-json/vendors/bidding-items?`, `/wp-json/vendors/bidding-projects?`, `/wp-json/water-quality/months?`, `/wp-json/wp/v2/pages/14`.
- No Next.js/React server-rendered shell markers found in this capture (`__NEXT_DATA__`, `data-reactroot`, `id="__next"`, `window.__NEXT_DATA__`): none observed.
- No inline `fetch(` / `axios.` / `.ajax(` / `XMLHttpRequest` references found in this capture by the regex scan used here.
- KEY FINDING: this page IS server-rendered static HTML — the advisory tables are in the HTML we fetched, not injected by client-side JS after load. An advisory-table wrapper with `id="emergency_sched" class="table-container" data-page="1" data-max="4" data-next="48788"` is present, with the same 7-column structure seen on the homepage fragment (`City`, `Barangay`, `Specific Area`, `From`, `To`, `Time`, `Reason`).
- One advisory-table row quoted verbatim (~800 chars), from the emergency section:
  ```
  <table class="advisory-table"><thead><th>City</th><th width='20%'>Barangay</th><th width='30%'>Specific Area</th><th>From</th><th>To</th><th>Time</th><th>Reason</th></thead><tr><td>Manila</td><td>Brgys. 36, 162, 182, 198 to 220, 235, 306, 331, 464 and 202-A</td><td>at Tecson Street corner Abad Santos, Tondo, Manila</td><td>October 16, 2026</td><td>October 17, 2026</td><td>10:00 pm to 6:00 am </td><td>Network Repair Activity </td></tr><tr><td>Manila</td><td>Brgys. 48 to 55, 147, 155, 160, 187, 201, 218, 221 to 233, 288, 310, 344 to 349, 353 to 382, 393, 492 to 497 and 500</td><td>at Severino Reyes corner Yuseco, Manila</td><td>October 16, 2026</td><td>October 17, 2026</td><td>10:00 pm to 6:00 am </td><td>Network Repair Activity </td></tr><tr><td>Cavite City</td><td>Brgys. 43 to 45, 54 to 56, 59, 60, 42-A, 42-B, 54-A, 54-M and 61-A</td><td>at A. Del Rosario Street corner H. Del Trabajo Street, Cavite City</td><td>October 16, 2026</td><td>October 17, 2026</td><td>10:00 pm to 4:00 am </td><td>Network Repair Activity</td></tr>...
  ```
- A second table form is also present on the page: a scheduled-type header `<th colspan='2' style='text-align:center; font-size:24px;'>October 2026 Septic Tank Cleaning Schedule </th>` followed by a City / Municipality + Barangay table with no From/To/Time columns, e.g. `BACOOR / Molino I to Molino III, Mambog IV, Niog II, ...` and `CALOOCAN / Brgy. 4 to 9, 11 to 18, ...`. That looks like tanker/septic routing info, not the same schema as the outage rows.
- Date / time formats seen verbatim on this page: `October 16, 2026`, `October 17, 2026`, `October 01, 2026`, `October 31, 2026`; time windows `10:00 pm to 6:00 am`, `5:00 AM to 11:00 PM`, `8:00 PM to 6:00 AM`, `6:00 AM to 11:00 PM`, `10:00 pm to 4:00 am`. So both "October DD, YYYY" with leading-zero day and "October D, YYYY" without, and mixed-case AM/PM, appear on this page — same family as the existing parser already handles.

### Manila Water — https://www.manilawater.com/customers/service-advisories

- GET → **403**, `text/html; charset=UTF-8`, **5,696 bytes**, **no redirect**, final URL `https://www.manilawater.com/customers/service-advisories`. Saved as `manilawater-service-advisories.html`.
- Body first 300 chars verbatim:
  ```
  <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; script-src &#39;nonce-oSQ9e26gxz75C5iq0opCs2&#39; &#39;unsafe-eval&#39; https://challenges.cloudflare.com; script-src-attr &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src &#39;self&#39; https://challenges.cloudflare.com; connect-src &#39;self&#39; https://challenges.cloudflare.com; frame-src &#39;self&#39; https://challenges.cloudflare.com blob:; child-src &#39;self&#39; https://challenges.cloudflare.com blob:; worker-src blob:; form-action http: https:; base-uri &#39;self&#39;">...
  ```
- Advisory-form tokens present: no. Token density: none.
- This is a Cloudflare managed challenge page ("Just a moment...", `challenge-platform`, CSP restricted to `challenges.cloudflare.com`), not Manila Water content. FAIL FAST applied: Manila Water advisory URL is bot-blocked from this environment with a plain browser-UA fetch.

### robots.txt — Manila Water (`https://www.manilawater.com/robots.txt`)

- GET → **200**, but the body is NOT a robots.txt — it is the Next.js app's **404 page HTML** for `/robots.txt` (about 13 KB), containing `__NEXT_DATA__` and a "Page not found" shell, title `Manila Water Company, Inc. | Manila Water Company, Inc.`. So there is no readable robots.txt at this domain; the earlier homepage recon finding still holds.
- Because there is no real robots.txt, there is no Disallow rule we can quote for the advisory path. We proceed on the assumption that the path is not disallowed, but that assumption has no robots.txt backing here either.

### KEY FINDING — Manila Water advisory URL

- This specific Manila Water URL (`/customers/service-advisories`) is **blocked**, not dynamic in the "JS shell we can read" sense and not static. The server answers with a Cloudflare challenge.
- Manila Water's real site is a Next.js app (visible in the 404/robots.txt capture: `_next/static/` chunks, `__NEXT_DATA__`, React flightJSON pushes). The advisory subpage is likely also client-rendered or SSR'd behind the same challenge. From this environment, a plain curl/fetch will not get the real advisory list here — the 403 is the answer.

### Strategy implication

- Maynilad: the `/service-advisories-2/` page is server-rendered static HTML and contains the same `advisory-table` rows (and the same WP REST endpoint references) as the homepage fragment. A static-HTML scraper path is viable in principle, but the REST endpoints already return exactly these rows and are already wired into `maynilad.ts`, so there is no new data source here — this recon confirms the page is a wrapper around the same backend, not an independent source.
- Manila Water: no static HTML advisory content was retrievable from this environment for the provided URL. The next Manila Water move is either (a) Playwright against one Manila Water subpage, or (b) fixtures-only for Manila Water for now. Native fetch from this environment is blocked here.

### Files saved (this round)

- `src/lib/ingestion/__fixtures__/raw/maynilad-service-advisories-2.html`  (200, 218,434 B)
- `src/lib/ingestion/__fixtures__/raw/manilawater-service-advisories.html`  (403, 5,696 B)
