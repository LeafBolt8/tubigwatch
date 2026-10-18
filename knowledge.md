Cold-cache first request to `/` (or `/api/outages`) can take ~143s while Maynilad is fetched. This is a known v1 limitation; background prewarming is Phase 4 work. Use `?source=fixtures` for fast iteration and Playwright.

## Data

- Primary source: Maynilad service advisories via Google Gemini API (`gemini-3.8-flash`) with URL Context; extracted into strict Zod schemas (`OutageSchema`, `AffectedAreaSchema`, `BarangaySchema`, etc.) in `src/lib/schemas`.
- Manila Water is paused for v1 (Cloudflare bot protection on their advisory pages); its extraction returns a `manila-water:` source error and no outage rows.
- The Gemini prompt explicitly instructs extraction from both the Emergency and Scheduled interruption tables and normalization of messy barangay lists/ranges.
- Validated outages are cached via Next.js `unstable_cache` (24h Gemini path, 15m native Maynilad path in `src/lib/cache/outages.ts`).
