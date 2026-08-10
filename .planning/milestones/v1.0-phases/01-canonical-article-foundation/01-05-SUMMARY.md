---
phase: 01-canonical-article-foundation
plan: "05"
subsystem: ui
tags: [react, hash-router, a11y, footnotes, vitest, playwright, jsdom]

# Dependency graph
requires:
  - phase: 01-02
    provides: hash router (App.tsx) + recursive semantic renderer (BlockRenderer.tsx) + walking-skeleton UI
  - phase: 01-03
    provides: curated corpus including figure-heavy fixture (3 footnote-reference blocks + 3 footnote bodies)
provides:
  - "Hash router that distinguishes app routes (#/) from in-page fragment anchors (#fn-N, #fn-ref-N, #main)"
  - "Footnote-body → reference back-link (return anchor with U+21A9 glyph, aria-label 'Return to reference N')"
  - "jsdom component test proving fragment-vs-route distinction (App.test.tsx)"
  - "Real-browser e2e footnote round-trip across Chromium/Firefox/WebKit"
affects: [annotation-anchoring, pagination, location-restoration, reading-position]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Handler-level route/fragment guard: distinguish #/-prefixed routes from bare fragment anchors in the hashchange handler, NOT in parseHash (parseHash must still map bad #/ deep links to the list)"
    - "Schema-derived anchor href/aria-label: fn.id locked to /^fn-\\d+$/ makes the suffix digits-only and injection-safe; React text children auto-escape"

key-files:
  created:
    - tests/component/App.test.tsx
  modified:
    - src/App.tsx
    - src/content/render/BlockRenderer.tsx
    - tests/component/BlockRenderer.test.tsx
    - tests/e2e/open-every-fixture.spec.ts

key-decisions:
  - "Route/fragment distinction lives in the hashchange HANDLER (not parseHash): parseHash must still map an unrecognized #/ deep link to the list (safe landing), so the guard that prevents fragment-only hashes from reaching setView belongs in the handler. This keeps the scroll target mounted so the browser's native scroll succeeds."
  - "Initial useState(() => parseHash()) unchanged: a fragment-only deep link on cold load correctly resolves to the list (no article is mounted yet to preserve)."
  - "Back-link visible glyph is Unicode U+21A9 (↩) as a React text child; aria-label carries the descriptive 'Return to reference N'. No new CSS — anchor inherits global anchor styling (accent color, always underlined); app.css left untouched (owned by sibling 01-04)."

patterns-established:
  - "Fragment-vs-route prefix contract: only #/-prefixed hashes are app routes; everything else is a native in-page scroll target. Future in-page anchors (e.g. annotation/highlight targets) inherit this guarantee without router changes."
  - "Footnote round-trip symmetry: forward reference (sup > a id=fn-ref-N href=#fn-N) and back-link (li#fn-N a href=#fn-ref-N) use complementary ids/fragments so the browser scrolls natively in both directions without React involvement."

requirements-completed: [DOC-02]

# Metrics
duration: 3 min
completed: 2026-07-29
status: complete
---

# Phase 01 Plan 05: Footnote round-trip (router guard + back-link) Summary

**Hash router now ignores bare fragment anchors (#fn-N/#fn-ref-N/#main) so footnote references scroll in-page without unmounting the article, plus a Unicode ↩ back-link inside each footnote body**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-29T15:01:06Z
- **Completed:** 2026-07-29T15:03:45Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Closed UAT gap 3 (test 10, major): clicking a footnote reference marker now scrolls to the footnote body without dumping the reader back to the fixture list.
- Implemented the missing footnote-body → reference back-link (return anchor with ↩ glyph + descriptive aria-label) — the forward reference existed but the back direction was never built.
- Added a latent fix for the SkipLink `#main` target (same router guard prevents a skip-link collision that would have unmounted the current view).
- Added the first jsdom component test for the router (App.test.tsx) and the first footnote-interaction e2e, both proving the round-trip across Chromium, Firefox, and WebKit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Router fragment guard + jsdom component test** — `249e285` (feat)
2. **Task 2: Footnote back-link + component and e2e round-trip tests** — `354e38d` (feat)

_Plan metadata commit follows in a separate docs commit._

## Files Created/Modified
- `src/App.tsx` — hashchange handler now guards non-`#/` fragment-only hashes (returns early without setView); `parseHash` signature/return/export and initial `useState(() => parseHash())` unchanged.
- `tests/component/App.test.tsx` (new) — jsdom component test: `parseHash` unit assertions + behavior tests proving `#fn-1`/`#fn-ref-1` keep the article mounted and `#/article/<id>` still swaps list→article.
- `src/content/render/BlockRenderer.tsx` — each footnote `<li>` renders a return anchor (`href=#fn-ref-N`, `aria-label=Return to reference N`, ↩ text child) after the footnote content; forward-reference BlockView unchanged.
- `tests/component/BlockRenderer.test.tsx` — new assertion that `li#fn-1 a[href="#fn-ref-1"]` exists, its aria-label contains "Return to reference", and its textContent is U+21A9.
- `tests/e2e/open-every-fixture.spec.ts` — new `figure-heavy` footnote round-trip (outside the per-fixture loop): forward click → hash `/#fn-\d+` + article still mounted + `li#fn-1` present; back click → hash `/#fn-ref-\d+` + article still mounted.

## Decisions Made
- **Guard placement = handler, not parseHash.** `parseHash` must still map an unrecognized `#/` deep link to the list (safe landing for stale/bad links), so the binary `#/`-prefix check belongs in the `hashchange` handler, which is the only path that prevents a fragment-only hash from reaching `setView` and unmounting the scroll target.
- **Back-link glyph + a11y.** Visible text is the single Unicode return arrow U+21A9 (↩) rendered as a React text child (auto-escaped); the descriptive name lives in `aria-label`. `fn.id` is schema-locked to `/^fn-\d+$/` (Plan 01 Task 2, Pitfall 4) so the interpolated suffix `n` is digits-only and injection-safe in both `href` and `aria-label`. No new CSS — the sibling 01-04 plan owns `app.css`; the anchor inherits the global anchor styling.
- **No change to deep-link / default-load behavior.** `#/article/<id>` still opens the article; empty/non-`#/`-prefixed default still loads the list on a true navigation. The guard short-circuits only `hashchange` events whose hash lacks the `#/` prefix.

## Deviations from Plan

None - plan executed exactly as written. The two coordinated halves (router guard in the handler keeping `parseHash` intact; back-link in the footnotes region keeping the forward reference intact) were implemented as specified. `src/app.css` was left untouched (owned by sibling 01-04).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT gap 3 (the last of the three diagnosed Phase 01 gaps) is closed. The footnote round-trip works across all three browser engines with native in-page scrolling and no view unmounting.
- The `#/`-prefix route/fragment contract established here is inherited by future in-page anchors (annotation/highlight targets, location restoration) without further router changes.
- All Phase 01 plans (01-01 through 01-05) are complete; the phase is ready for verification.

## Self-Check: PASSED

- All 5 task files exist on disk (`src/App.tsx`, `tests/component/App.test.tsx`, `src/content/render/BlockRenderer.tsx`, `tests/component/BlockRenderer.test.tsx`, `tests/e2e/open-every-fixture.spec.ts`).
- Both task commits present in git log: `249e285` (Task 1), `354e38d` (Task 2).
- must_have artifact grep checks pass: `src/App.tsx` contains `startsWith`; `src/content/render/BlockRenderer.tsx` contains `fn-ref-`.
- Verification: `npm run build` green; `npm run lint` green; `npm run test:unit -- --run` → 107 tests pass (99 prior + 7 new App.test.tsx + 1 new BlockRenderer.test.tsx); `npm run test:e2e` → 45 tests pass across Chromium/Firefox/WebKit (42 prior + 3 new footnote round-trip).

---
*Phase: 01-canonical-article-foundation*
*Completed: 2026-07-29*
