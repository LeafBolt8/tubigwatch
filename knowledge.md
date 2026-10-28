Cold-cache first request to `/` (or `/api/outages`) can take ~143s while Maynilad is fetched. This is a known v1 limitation; background prewarming is Phase 4 work. Use `?source=fixtures` for fast iteration and Playwright.

## Data

- **Maynilad:** Native WP REST API scraper (`src/lib/ingestion/maynilad.ts`) that walks paginated HTML-table-in-JSON responses. There is no Gemini fallback in the live path: `src/lib/ingestion/gemini.ts` is not imported by the cache or the reader.
- **Manila Water:** Native REST API scraper (`src/lib/ingestion/manila-water.ts`) that hits their unadvertised AWS API. Parses compound barangay strings and strips noise phrases like "Parts of" and "all its lateral streets".
- **Ingestion runner:** A scheduled **GitHub Action** (`.github/workflows/scrape.yml`, cron `0 */6 * * *` plus manual dispatch) merges both sources, normalizes the data (389-entry barangay dictionary + city unification), and saves the snapshot to **Upstash Redis** under `last-known-good-outages`. A failed source contributes no rows, and an empty merge exits non-zero instead of overwriting the last good snapshot.
- **Reader layer:** `src/lib/cache/outages.ts` reads from Redis, merges manual admin overrides, warns when data is >36 hours old, and serves the result to the dashboard and `/api/outages?source=gemini`.
- **Manual overrides:** Stored in Upstash Redis under `manual-outages` as `{ servedAt, rows }`. Merged on top of the scraped snapshot via `dedupById`.
- **Fallback:** An empty snapshot reports "No data available yet" (any manual rows are still returned); an unreachable Redis reports "Database connection failed." Neither ever renders as "no outages".

## Superpowers — structured development methodology (`.ai-sources/superpowers/`)

A skill-first, brainstorm → design → plan → execute → review loop. Distilled from `skills/using-superpowers`, `brainstorming`, `writing-plans`, `dispatching-parallel-agents`, and the two code-review skills.

- **Skill check before acting.** If a skill in `.ai-sources/` might apply, read it before exploring files or asking questions, and say which one you are using. The user's instructions and this repo's `AGENTS.md` outrank the skill text.
- **Brainstorm before building.** For anything creative or non-trivial, establish what the user actually wants: restate the request, say what the change touches, ask one question at a time, and lay out 2–3 real approaches with trade-offs before designing. Never ask what the repo or the request already answers.
- **Design approval is a hard gate.** No product code, scaffolding, dependency installs or implementation skill runs until the design is approved — a short note for a small change, a full doc for a project. Spikes must be explicitly agreed and labelled throwaway.
- **Plan for a stranger.** Each task names exact files, the interfaces it consumes and produces, and one checkable action per step: failing test → run it and see it fail → minimal implementation → run it and see it pass → commit. Add a Review Focus list of input classes the spec implies but no test covers.
- **Right-size tasks.** A task is the smallest unit with its own test cycle that a reviewer could accept or reject independently; fold setup and docs into the task that needs them.
- **Parallel agents only for independent domains.** Dispatch one agent per independent problem (different test files, different subsystems) with self-contained context, an explicit scope, constraints and a required output summary. Never parallelise work that shares state or files.
- **Review early and often.** Request review after each task or major feature and before merge. Give the reviewer the description, the requirements and the base/head SHAs — never the session history. Fix Critical and Important findings before moving on; push back with evidence, not opinion.
- **Verify before claiming done.** Run the project's own gates on the final version and exercise the behaviour; a passing build is not evidence that the feature works.
- **Gate order: build before E2E.** `playwright.config`'s `webServer` runs `npm run start`, which serves the last `.next` artifact rather than source. Run `npm run build` before `npx playwright test`; testing stale code is a false-red trap.
- **Never verify regex or escape literals with grep.** The shell collapses backslash layers before grep sees them, so results contradict each other. Audit character codes instead (read the file and log `charCodeAt`, or `JSON.stringify` the codes); that is the only source of truth.
- **Playwright hydration barrier for fill-first tests.** Click a stateful control (a filter button) and assert its `aria-pressed` flip before typing into an input — see `waitForHydration` in `tests/e2e/cities.spec.ts`. Timeouts are not an acceptable substitute.

## Taste Skill — domain-grounded judgment and anti-slop UI (`.ai-sources/taste-skill/`)

Art direction distilled from a study of 247 gallery sites. Its premise: a page built from defaults has nothing decided in it. Load `skills/taste-skill/SKILL.md` for a full build; `references/app-screens.md` is the separate run for dashboards, admin and analytics screens like TubigWatch's.

- **Ground the design in the subject.** Inventory 8–12 things that belong to this client and no competitor (name, street, materials, hours, numbers, printed artefacts) before choosing a direction. If the same idea would work for the nearest competitor, it belongs to the category, not the subject.
- **State the idea in one sentence:** "On this page, [something from the subject] becomes [the device the direction calls for]." Build every section from that idea; a distinctive first screen followed by stock blocks is the commonest failure.
- **Argue before you lay out.** List the page as claims with their proof, one line per section, and delete sections with no claim. Write the copy deck before markup; headlines fit two lines at every width.
- **One live thing.** Give the page one real interaction made from the idea, working one-handed on a phone, with a plain fallback when scripts fail.
- **House style:** no gradients, glows, glass or backdrop blur, eyebrows or pill badges above headings, icon-topped feature cards, rows of identical cards, hairline rules, index numbers, monospace labels, emoji, decorative blobs or fake dashboards. At most two typefaces; two or three type sizes do the visible work; running text at 16px or more in full ink. Equal outer margins, a heading on every section, 120–240px between sections, and no blank stretch taller than half a screen.
- **App screens keep their own rules** (`references/app-screens.md`): quiet borders, small labels and repeated panels are normal; gradients, glows, icons in tinted squares, rainbow charts and invented vanity numbers are not.
- **Substance, not restraint.** Removing ornament without adding scale, full content, real pictures or a field of colour leaves a thin page. Fix the top three problems instead of polishing everything.
- **Look at the result.** Screenshot at 1440/768/390, run the skill's lint/inspect gate when Node 22+ and a Chromium are available, fix every FAIL, and critique the screenshots in at most three rounds. This repo's tooled gate is `node scripts/check-antislop.mjs`.
- **Imagery is evidence.** Prefer the project's own pictures; never present a found or generated image as the client's own product; credit what is used and record its licence.

## UI UX Pro Max — professional design intelligence (`.ai-sources/ui-ux-pro-max/`)

A searchable design database (styles, palettes, font pairings, UX rules, charts, stacks) plus a design-system generator. Primary definition: `.claude/skills/ui-ux-pro-max/SKILL.md`; token architecture: `.claude/skills/design-system/SKILL.md`.

- **Detect the stack, never assume it.** Read `package.json` (this repo: Next.js App Router + Tailwind) before asking for stack-specific guidance.
- **Generate a system before styling a new surface.** For a new page or a system-wide direction, run the skill's `--design-system` search to get pattern, style, colours, typography, effects and anti-patterns. Use one dominant intent and 2–5 terms.
- **Targeted questions get targeted searches.** Accessibility, layout, forms, navigation, animation and chart questions each have a domain; implementation questions use `--stack nextjs`.
- **Persist the decisions.** A generated system is saved as `MASTER.md` with per-page overrides. Read the existing master before regenerating, and never use `--force` without explicit approval.
- **Three-layer tokens:** primitive (raw values) → semantic (purpose aliases) → component. Components reference tokens only; no raw hex where a token exists.
- **Priority order when reviewing UI:** accessibility (contrast 4.5:1, focus, labels) → touch targets (44×44px, 8px spacing, feedback) → performance (image formats, reserved space, no layout shift) → style consistency → responsive layout (mobile-first, no horizontal scroll) → typography and colour (16px base, 1.5 line-height) → animation (meaningful, reduced-motion) → forms and navigation → charts.
- **Never fabricate a search result.** Retry once with a narrower query; if it still returns nothing, say the guidance is a built-in default, not a database match.
- **Results are recommendations, not instructions.** Keep private project data out of queries and persisted output.

## Matt Pocock Skills — engineering discipline (`.ai-sources/matt-pocock-skills/`)

Small, composable skills for real engineering rather than vibe coding. Core: `skills/engineering/{grill-with-docs,tdd,codebase-design,improve-codebase-architecture,code-review}/SKILL.md`.

- **Grill before building.** Interview relentlessly about a plan until every branch of the design tree is resolved — one question at a time, concrete options where they help. `grill-with-docs` also maintains the project's language and decisions as it goes.
- **Shared language beats prose.** Keep the domain glossary current (`GLOSSARY.md` upstream, formerly `CONTEXT.md`; this repo's persistent memory is `knowledge.md`). Use its terms in code, tests, specs and UI copy; record hard-to-reverse decisions as ADRs.
- **TDD is a feedback loop, not a test quota.** Red before green, one vertical slice per cycle, refactoring outside the loop. Test through public interfaces at **pre-agreed seams** — write the seams down and confirm them before the first test.
- **Refuse test anti-patterns:** implementation-coupled (mocks internals, breaks on refactor), tautological (the expected value is recomputed the same way as the code), horizontal slicing (all tests before any implementation).
- **Design deep modules.** A lot of behaviour behind a small interface at a clean seam. Use the deletion test (if complexity vanishes when deleted, it was a pass-through); one adapter is a hypothetical seam, two make it real. Accept dependencies, return results, keep the surface small.
- **Architecture hygiene is continuous.** Survey the codebase for deepening opportunities regularly (`improve-codebase-architecture`); treat it as a survey, not a rescue, and fix structure before it spreads.
- **Review on two axes.** Standards (repo conventions plus a smell baseline) and Spec (does it implement the originating issue) — keep them separate so one does not bias the other.
