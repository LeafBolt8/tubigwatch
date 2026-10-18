# TubigWatch

Metro Manila water outage tracker for Maynilad service advisories.

**Live App:** [https://tubigwatch.vercel.app/](https://tubigwatch.vercel.app/)

## Overview

TubigWatch is a Progressive Web App designed for high-contrast, low-bandwidth readability during typhoons and water interruptions.

Instead of relying on fragile HTML scraping—which is often blocked by Cloudflare—the app uses the **Google Gemini API (`gemini-3.8-flash`) with URL Context** to read the official Maynilad advisories page, extract the unstructured HTML tables, and validate the data against strict Zod schemas.

*Note: Manila Water extraction is paused for v1 due to aggressive Cloudflare bot protection on their advisory pages.*

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19
- **Language:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS v4
- **Data Extraction:** Google Gemini API (`@google/genai`)
- **Validation:** Zod
- **Testing:** Vitest, Playwright
- **CI/CD:** GitHub Actions, Vercel

## How the AI Pipeline Works

1. **Fetch:** The app calls Gemini with the Maynilad advisory URL.
2. **Extract:** Gemini reads the page, ignores non-outage sections (like septic tank schedules), and extracts the emergency and scheduled interruption tables.
3. **Normalize:** Gemini is explicitly prompted to split messy strings (e.g., "Brgys. 198 to 220") into individual barangay objects.
4. **Validate:** The raw AI response is hydrated into our strict `OutageSchema` using Zod.
5. **Cache:** The validated data is cached for 24 hours to prevent API rate limits and ensure instant subsequent page loads.

## Quality Gates

Every commit must pass:
- `npm run typecheck` — TypeScript strict
- `npm run lint` — ESLint + anti-slop guardrail
- `npm test` — Vitest + guardrail tests
- `npm run build` — Next.js production build
- `npm run e2e` — Playwright (UI tests)

## Local Development

```bash
npm install
npm run dev
```

(Note: You will need a `GEMINI_API_KEY` in your `.env.local` file to test live extraction, or use `/?source=fixtures` to test the UI locally).
