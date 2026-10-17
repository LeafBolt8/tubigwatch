# TubigWatch

Metro Manila water outage tracker for Maynilad and Manila Water service advisories.

**Status:** Phase 2 (data layer) complete. Maynilad REST API integration verified live. UI in progress.

## Quickstart

npm install
npm run dev

text

## Quality gates

Every change must pass:
- `npm run typecheck` — TypeScript strict
- `npm run lint` — ESLint + anti-slop guardrail
- `npm test` — Vitest + guardrail tests
- `npm run build` — Next.js production build
- `npm run e2e` — Playwright (UI-affecting changes only)

## Docs

See `ARCHITECTURE.md`, `knowledge.md`, `AGENTS.md`.
