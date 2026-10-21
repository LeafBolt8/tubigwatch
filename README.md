# TubigWatch 💧

**Live App:** [https://tubigwatch.vercel.app](https://tubigwatch.vercel.app) · **Interactive Map:** [https://tubigwatch.vercel.app/map](https://tubigwatch.vercel.app/map)

TubigWatch is a high-contrast, low-bandwidth Progressive Web App (PWA) that tracks water service interruptions for Metro Manila residents. It aggregates live advisories from both Maynilad and Manila Water into a single, unified dashboard.

## 🚀 The Problem

During typhoon season, water advisories are scattered across slow, Cloudflare-protected, mobile-hostile websites. Residents need to know instantly if their barangay is affected so they can store water.

## 🛠️ Architecture & Features

- **Dual-Source Data Ingestion**:
  - **Maynilad:** Uses the Google Gemini API (`gemini-3.8-flash`) with URL Context for primary extraction, with an automatic fallback to their native WP REST API.
  - **Manila Water:** Extracts directly from their unadvertised AWS REST API.
- **Data Normalization Engine**: A 389-entry barangay dictionary that standardizes messy, multi-city strings, corrects misplaced barangays, and unifies city names using heuristic tiebreakers.
- **Offline-First PWA**: A service worker caches the app shell and the last known advisory payload, ensuring the app works when the internet goes down during a storm.
- **Geolocation Priority**: Prompts for browser location to automatically sort the closest city to the top of the dashboard.
- **Interactive Map**: A React-Leaflet map with deep-links that auto-scroll the dashboard to the selected city.
- **Admin Override Panel**: A password-protected route backed by Vercel KV that allows manual injection of advisories if the AI or APIs fail.
- **Real-Time UI**: A 60-second tick automatically hides "Restored" outages and turns "Scheduled" outages into "Active" without a page refresh.

## 💻 Tech Stack

- **Framework:** Next.js 15 (App Router), React 19
- **Language:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS v4 (Custom anti-slop design system)
- **Validation:** Zod (Zero-trust data parsing)
- **Database:** Vercel KV (Upstash Redis)
- **Testing:** Vitest, Playwright, custom anti-slop source guardrail
- **CI/CD:** GitHub Actions, Vercel

## 🧪 Quality Gates

Every commit must pass:

- `npm run typecheck` (TypeScript strict)
- `npm run lint` (ESLint + custom anti-slop guardrail)
- `npm test` (Vitest unit tests + guardrail tests)
- `npm run build` (Next.js production build)

`npm run e2e` runs the Playwright smoke tests against a production build. It is run locally, not wired into CI.

## 🏃‍♂️ Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your GEMINI_API_KEY to .env.local
# (KV_REST_API_URL / KV_REST_API_TOKEN are injected by Vercel in deployment)

# Run the development server
npm run dev
```

To test the UI without hitting the API limits, visit [http://localhost:3000/?source=fixtures](http://localhost:3000/?source=fixtures) to load demo data.
