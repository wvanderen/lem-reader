---
phase: 01-canonical-article-foundation
plan: 04
subsystem: ui
tags: [css, react, accessibility, error-states, uat-gap-closure, microcopy]

# Dependency graph
requires:
  - phase: 01-canonical-article-foundation/02
    provides: walking-skeleton UI (ArticleView, FixtureList, app.css) whose views this plan refines
  - phase: 01-canonical-article-foundation/03
    provides: curated corpus exercised by the e2e regression sweep
provides:
  - Unified reading-surface inset on main#main (every view inherits calm md/3xl inset)
  - .status card presentation rule (surface-raised + hairline + spacing-scale padding)
  - Full two-line UI-SPEC Copywriting "Error state — open failed" contract in both views
affects: [02-reader-shell, 03-pagination-engine, future status/loading regions rendered inside main#main]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared view inset lives on main#main, not per-view wrappers — avoids flush-edge asymmetry across routes"
    - "Calm status card: surface-raised + hairline + spacing-scale padding; --destructive reserved for icon/border only (no destructive actions in Phase 1)"

key-files:
  created: []
  modified:
    - src/app.css
    - src/routes/ArticleView.tsx
    - src/routes/FixtureList.tsx
    - tests/component/ArticleView.test.tsx
    - tests/component/FixtureList.test.tsx

key-decisions:
  - "Move the reading-surface inset up to main#main instead of adding a per-view wrapper — closes the fixture-list flush-edge gap with one rule and removes the ArticleView/FixtureList asymmetry"
  - "Keep .article-body as the centered 64ch measure only (no padding) so the inset move does not create a double inset; the calm measure stays invariant"
  - "ArticleView error uses <h1> (standalone error page, one-h1-per-page); FixtureList error uses <h2> (the page already has <h1>Saved articles</h1>) — preserves a clean h1→h2 hierarchy"
  - "Status card stays calm (surface-raised + hairline); --destructive is never used for text/background per UI-SPEC reservation"

patterns-established:
  - "main#main owns the shared reading-surface inset for all routes"
  - "Loading/error status regions carry className=status and render structured copy (heading element + <p> body) rather than bare text nodes"

requirements-completed: [DOC-01]

# Metrics
duration: 11 min
completed: 2026-07-29
status: complete
---

# Phase 01 Plan 04: UAT Gap Closure (Fixture-list Inset + Error-state Copy) Summary

**Unified the reading-surface inset on `main#main` and rendered the full two-line UI-SPEC error contract inside a calm `.status` card — closing UAT gaps 1 (fixture-list flush-edge heading) and 2 (bare error string) with zero test regressions.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-29T14:47:33Z
- **Completed:** 2026-07-29T14:58:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Closed Gap 1 (UAT test 2, cosmetic): every view now inherits a comfortable md/3xl inset from `main#main` — the "Saved articles" heading and fixture cards are no longer flush against the viewport edge at narrow widths.
- Closed Gap 2 (UAT test 9, minor): the invalid-article error state renders the full two-line UI-SPEC §Copywriting "Error state — open failed" contract — the "Couldn't open this article." heading plus the guidance body "The article could not be loaded. Select it again from the list, or try a different article." — in a styled calm card in both ArticleView and FixtureList.
- No regressions: all 99 prior unit tests and all 42 prior e2e tests (open-every-fixture + axe-core a11y across Chromium/Firefox/WebKit) remain green; the article-ready view is visually unchanged (calm 64ch measure preserved, no double inset).

## Task Commits

Each task was committed atomically:

1. **Task 1: Unify view inset on main#main + add .status card styling** — `8612354` (style)
2. **Task 2: Render two-line error contract + .status className in both views** — `c6792a5` (feat)

## Files Created/Modified
- `src/app.css` — new `main#main` shared-inset rule; `.article-body` trimmed to the centered 64ch measure only; new `.status` card rule plus `.status p` and `.status h1, .status h2` descendants.
- `src/routes/ArticleView.tsx` — error/loading branch renders structured output (loading `<p>`; error `<h1>` + guidance `<p>`) and the status div carries `className="status"`.
- `src/routes/FixtureList.tsx` — status region renders structured output (loading `<p>`; error `<h2>` + guidance `<p>`) and carries `className="status"`.
- `tests/component/ArticleView.test.tsx` — both error tests assert the guidance body sentence and `getByRole("status")`.
- `tests/component/FixtureList.test.tsx` — the error test asserts the guidance body sentence and `getByRole("status")`.

## Decisions Made
- Inset unification on `main#main` (not a per-view wrapper) — single rule closes the asymmetry with no double inset.
- Heading-level split by page context: `<h1>` on the standalone ArticleView error page, `<h2>` on the FixtureList page (which already has the `<h1>Saved articles</h1>`) — preserves one-h1-per-page.
- The status card stays calm (surface-raised + hairline); `--destructive` is reserved for icon/border per UI-SPEC, and Phase 1 has no destructive actions.
- Loading copy wording is unchanged; only wrapped in a `<p>` for structure. No internal jargon ("fixture", "Zod", "schema", "IndexedDB") leaks into user-facing copy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 01 UAT gaps 1 and 2 are closed; the remaining gap-closure plans (01-05 footnote/router collision) and phase verification can proceed.
- The `main#main` shared-inset and `.status` card patterns are now established conventions for future reader-shell / pagination work that renders inside `main#main` or surfaces loading/error state.

## Verification Evidence
- `npm run build` — TypeScript + Vite build green.
- `npm run lint` — ESLint green (no new violations; `react/no-danger` still enforced).
- `npm run test:unit -- --run` — 99 unit/component tests pass (was 99 prior; the 4 updated assertions are part of the 12 component tests, all green).
- `npm run test:e2e` — 42 e2e tests pass across Chromium/Firefox/WebKit (open-every-fixture + axe-core a11y), confirming the `main#main` inset move did not regress article layout or a11y.

## Self-Check: PASSED
- All 5 modified files exist on disk.
- Both task commits present in git log: `8612354` (style), `c6792a5` (feat).
- All plan-level verification commands green (build, lint, 99 unit tests, 42 e2e tests).

---
*Phase: 01-canonical-article-foundation*
*Completed: 2026-07-29*
