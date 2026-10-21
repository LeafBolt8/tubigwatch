# TubigWatch — System Architecture

Status: v1 design locked. Scaffolding begins in the next task.

## 1. Product Summary
TubigWatch is a Progressive Web App that surfaces water service interruptions and advisories for Metro Manila residents served by Maynilad and Manila Water. It is designed for the worst case: a typhoon, no power, weak mobile data, a resident deciding whether to fill buckets now or wait. Every decision below serves that scenario.

## 2. Tech Stack (locked; substitutions require a written reason)
| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 24 | Already installed. Native test runner, native fetch, native .env. |
| Framework | Next.js 15 (App Router) + React 19 | Server components reduce client JS; matters on 3G. |
| Language | TypeScript 5.x, strict: true, noUncheckedIndexedAccess: true | Type safety is a gate, not a preference. |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) | Utility-first, accessible primitives, no runtime CSS-in-JS. |
| Validation | Zod 3.x | Every byte from an external source is parsed, never trusted. |
| Server state | Native fetch + Next.js cache tags | Revalidate hourly per source; no SWR/React Query at v1. |
| Client state | useState / useReducer only | No Redux/Zustand/Jotai. The app has <5 pieces of client state. |
| PWA | Hand-rolled service worker (public/sw.js) | next-pwa is unmaintained; we control the cache strategy. |
| Testing | Vitest (unit) + Playwright (e2e) | Vitest is fast; Playwright is the only honest e2e tool. |
| Lint | ESLint 9 flat config + scripts/check-antislop.mjs | Existing checker becomes part of `npm run lint`. |
| Package manager | npm | Matches the environment; no pnpm/yarn fights on Windows. |

Rejected on purpose: any UI kit beyond shadcn, any client state library, any CSS-in-JS, any ORM (no DB at v1), any auth provider (no accounts at v1).

## 3. Data Model (Zod-first)
All schemas live in `src/lib/schemas/`. Each schema exports a matching `z.infer` type. Types are never hand-written when a schema can derive them.

- `ConcessionaireSchema` — enum: "maynilad" | "manila-water".
- `OutageStatusSchema` — enum: "scheduled" | "active" | "restored" | "cancelled" | "unknown".
- `BarangaySchema` — { name, city, province: z.enum(["Metro Manila", "Rizal", "Cavite", "Laguna", "Bulacan"]) — derived from city_municipality via deriveProvince(), psgcCode? }.
- `AffectedAreaSchema` — { barangays: BarangaySchema[], streets?: string[], notes?: string }.
- `OutageSchema` — canonical shape:
  - id (stable hash of concessionaire + startsAt + affected area)
  - concessionaire
  - status
  - reason (free text, sanitized)
  - startsAt (ISO 8601 with timezone)
  - endsAt? (ISO 8601)
  - estimatedRestoration? (ISO 8601; may differ from endsAt)
  - affectedAreas: AffectedAreaSchema[]
  - source: { url, fetchedAt, raw }
  - confidence: "official" | "inferred"
- `TankerScheduleSchema` — { id, concessionaire, location, arrivalWindow, notes }.
- `AdvisorySchema` — non-outage notices (pressure, quality).

Every schema is `.strict()`. Parse failures are logged with the raw payload for debugging and never surfaced raw to users.

## 4. Ingestion Layer
- Sources:
  - Maynilad: WP REST endpoints `/wp-json/interruptions/{emergency,scheduled,rotational,traffic}`. Each returns a JSON object whose value is a STRING containing an HTML `<table class="advisory-table">` fragment (NOT a JSON array of objects). The Maynilad fetcher (`src/lib/ingestion/maynilad.ts`) fetches these, parses the HTML table fragment with a dependency-free tokenizer, normalizes rows into `Outage[]`, and validates each through `OutageSchema`. Endpoints are slow (20–30s observed); timeout is 60s. One request per second max (in-process throttle). Dev mode falls back to `src/lib/ingestion/__fixtures__/raw/` when live fetch fails and marks the UI "demo data". No HTML scraping of Maynilad pages is required.
  - Manila Water: **Cloudflare-blocked at every probed path** (homepage + `/service-updates` + `/advisories` + `/customer-service/service-updates` all returned 403 challenge pages in recon round 2). At v1, Manila Water is fixtures-only: `src/lib/ingestion/__fixtures__/` provides realistic Metro Manila samples, and the Manila Water fetcher will not be written until a reachable path is confirmed (Phase 4 revisit). If a future Manila Water subpage returns real content, the parser will follow the same HTML-table-fragment shape if that's what Manila Water serves; otherwise a page-specific parser is written then.
- Location: `src/lib/ingestion/<concessionaire>.ts` — one module per source, each exporting `fetchOutages(): Promise<Outage[]>` returning validated data or throwing a typed `IngestionError`.
- Pipeline (Maynilad): fetch -> parse JSON string -> extract HTML table fragment -> parseHtmlTable() -> rowToPartialOutage() -> group rows by (startsAt, endsAt, reason) -> build Outage[] -> OutageSchema.parse each -> return.
- Resilience: if one source fails, the other still renders. Failed sources surface a dismissible banner ("Maynilad data delayed" / "Manila Water data delayed"). Never fabricate outages to fill a gap.
- Cache: Next.js fetch cache with `revalidate: 3600` per source tag (`maynilad`, `manila-water`). Manual revalidation endpoint `POST /api/revalidate` protected by a secret.
- Seed data: `src/lib/ingestion/__fixtures__/` contains realistic Metro Manila samples (Quezon City, Makati, Taguig, Pasig, Caloocan) with fictional-but-plausible streets. Dev mode falls back to fixtures when live fetch fails and marks the UI "demo data".

## 5. UI Architecture
- Routes (App Router):
  - `/` — dashboard: active + upcoming outages, filter chips by concessionaire.
  - `/outage/[id]` — detail: timeline, affected barangays, map placeholder, source link.
  - `/search` — city -> barangay -> street drilldown (URL-driven, shareable).
  - `/tankers` — roving tanker schedules.
  - `/about` — data sources, disclaimers, last updated.
- Server Components by default. Client components only for: search input, filter chips, install prompt, auto-refresh ticker.
- Design language (enforced by scripts/check-antislop.mjs):
  - High-contrast. WCAG AA minimum; AAA for status text.
  - Status colors: active = red-600, scheduled = amber-600, restored = emerald-700, cancelled = zinc-500. No gradients.
  - Typography: system stack first, then Inter. Base 16px, never below 14px on mobile.
  - Layout: single column, max 640px on mobile, 1024px on desktop. Works at 320px width.
  - Icons: Lucide only. One icon set.
- Offline behavior: service worker caches the last successful dashboard response and the shell. Offline view shows cached data with a prominent "Last updated: <time>" and a "You are offline" banner. No fake spinners.

## 6. Security & Robustness
- CSP via `next.config.ts` `headers()`: `default-src 'self'`, no `unsafe-inline` for scripts (nonces if needed), `img-src 'self' data: https:`.
- Rate limiting: middleware on `/api/*` — 30 req/min per IP, in-memory map at v1 (documented as v2 -> Redis).
- Input sanitization: every query param goes through Zod before use. Search strings stripped of HTML; length-capped at 100 chars.
- Error boundaries: `app/error.tsx` (route-level) and `app/global-error.tsx` (root). Plain, useful message; never a stack trace.
- Zero-trust parsing: nothing from an external source touches the UI without a Zod parse. Parse failure -> log + drop; never show partially-parsed data.
- No `dangerouslySetInnerHTML` anywhere. Advisory prose rendered as plain text with `white-space: pre-wrap`.

## 7. Folder Structure (target after scaffolding)
tubigwatch/
  .github/workflows/       (antislop.yml already exists)
  .ai-sources/             (gitignored, local reference only)
  public/
    sw.js
    icons/
  scripts/                 (antislop checker + future scripts)
  src/
    app/                   (App Router routes)
    components/            (shared UI, mostly server)
      ui/                  (shadcn primitives)
    lib/
      ingestion/           (per-concessionaire fetchers)
      schemas/             (all Zod schemas)
      utils/
    types/                 (derived types only)
  tests/
    unit/
    e2e/
  AGENTS.md
  ARCHITECTURE.md
  knowledge.md
  package.json             (to be created during scaffolding)
  tsconfig.json            (to be created during scaffolding)
  next.config.ts           (to be created during scaffolding)

## 8. Anti-Hallucination Gates (must pass before any task is reported complete)
1. `npm run typecheck` -> `tsc --noEmit`
2. `npm run lint` -> `eslint . && node scripts/check-antislop.mjs`
3. `npm run test` -> `vitest run`
4. `npm run build` -> `next build`
5. `npm run e2e` -> `playwright test` (only required for UI-affecting changes)

All must exit 0. A task is not complete until the telemetry payload includes verbatim output of every gate that ran.

## 9. Non-Goals for v1
No user accounts. No push notifications. No map integration (placeholder only). No historical analytics. No Tagalog translation (English only at v1; schema is i18n-ready). No admin UI (ingestion is code, not a CMS).
