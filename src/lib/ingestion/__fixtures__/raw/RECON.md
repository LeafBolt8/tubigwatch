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
- Saved as `maynilad-20261016.html`. Under the 2 MB cap — not truncated.

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
  <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
  ...
  ```
- Markers present: `<title>Just a moment`, `challenge-platform`, `Enable JavaScript`. This is a **Cloudflare challenge page**, not Manila Water's content.
- FAIL FAST applied: the Manila Water homepage is bot-blocked. No bypass attempted. No advisory content fetched. No advisory HTML saved for Manila Water beyond the 403 body itself (saved for evidence).

### Strategy implication
A plain `fetch`/curl from this environment cannot get Manila Water's homepage or advisory content today — the site answers with a Cloudflare JS challenge. Two realistic paths, neither attempted here (per task scope):
1. Fetch the Manila Water **advisory/service-updates subpage directly** (e.g. the "Service Updates" page the ARCHITECTURE.md §4 name-drops) — it may be less aggressively challenged than the homepage, or may still be blocked.
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
- `src/lib/ingestion/__fixtures__/raw/maynilad-20261016.html`
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
- `maynilad.ts` — `fetchMayniladOutages()`: throttled fetch (1 req/s, 60s timeout) of emergency/scheduled/rotational, group rows by (startsAt, endsAt, reason), build Outage[], validate each through OutageSchema, dev-mode fixture fallback.

Grouping rule (documented in maynilad.ts): rows with identical (startsAt, endsAt, reason) collapse into ONE Outage with multiple affectedAreas; otherwise separate outages.

ID scheme: `sha1(concessionaire + startsAt.toISOString() + sorted barangay names joined by "|")`, Node crypto, no new dep.

Fixtures used for dev-mode fallback + tests: the saved raw JSON in `src/lib/ingestion/__fixtures__/raw/` (maynilad-wp_jsoninterruptionsemergency.json etc.). Tests mock fetch to return those exact bytes.

Follow-ups still open (NOT done):
1. Confirm Maynilad page-2+ query param by fetching `/wp-json/interruptions/emergency?page=2` (and/or `?next=48753`) and seeing which returns rows.
2. Confirm whether Maynilad's `/service-advisories/` and `/service-advisories-2/` pages are server-rendered static HTML or also rely on the REST fragments.
3. Decide the Manila Water path: Playwright fetch of one subpage vs fixtures-only.
4. Fetch `/wp-json/interruptions/traffic` to see if it shares the HTML-fragment shape.
