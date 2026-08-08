---
phase: 06-prototype-acceptance
plan: 02
subsystem: testing
tags: [playwright, e2e, acceptance, acpt-01, core-reading-flow, cross-engine, corpus]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: the [data-block-index] 1:1 block↔element mapping (Plan 04-06), the M shortcut + commitTurn turn controls (D4-06/D4-07), the always-mounted hidden .article-body-measurement (Plan 04-08), the D4-10 mode-switch anchor
  - phase: 02-local-state-and-settings
    provides: the STATE-01 location-restore substrate (reload re-mounts the article without content loss)
  - phase: 05-durable-highlights-and-notes
    provides: the annotations/_fixtures.ts shared harness (openArticle/switchMode/selectRangeInBlock/findFirstBlockWithText/modeToggle/drawerTrigger/announcementRegion/wipeDatabase/FIXTURES) + the ANNO-01 capture path + the ANNO-04/D5-11 navigate-back path
provides:
  - "ACPT-01 consolidated end-to-end core-reading-flow acceptance spec (tests/e2e/acceptance/core-reading-flow.spec.ts) — 6 fixtures × 3 engines = 18 acceptance cells, full OPEN → READ THROUGH → SWITCH MODE → RESTORE → CREATE + NAVIGATE HIGHLIGHT loop"
affects: [06-prototype-acceptance, 06-06 (phase verification — full npm run test gate), 06-VERIFICATION.md (records the ACPT-01 result)]

# Tech tracking
tech-stack:
  added: []  # No new packages — reuses the locked @playwright/test 1.61.1
  patterns:
    - "Consolidated acceptance spec (D6-13) — ONE end-to-end contract per fixture × engine that reuses the existing harness wholesale (openArticle/switchMode/selectRangeInBlock/findFirstBlockWithText/modeToggle/drawerTrigger/announcementRegion/wipeDatabase + FIXTURES); does NOT duplicate per-feature isolation logic (Pitfall 6)"
    - "Sibling-not-extension (D6-13) — open-every-fixture.spec.ts stays the DOC-01 mount smoke; the consolidated flow spec is a sibling at tests/e2e/acceptance/core-reading-flow.spec.ts"
    - "One representative typography (RESEARCH Open Question 2) — 6 fixtures × 3 engines = 18 cells, NOT the full 54-cell CORPUS_MATRIX (typography-stress is PAGE-03's job)"
    - "Visible-block selector with :not(.article-body-measurement ...) filter — excludes the always-mounted aria-hidden measurement clone (Plan 04-08) which is user-select:none + not keyboard-reachable (mirrors visibleBlock in _fixtures.ts)"

key-files:
  created:
    - "tests/e2e/acceptance/core-reading-flow.spec.ts — ACPT-01 consolidated core-reading-flow spec; 6 FIXTURES × 3 engines = 18 cells, full open→read→switch→restore→create+navigate-highlight loop"
  modified: []

key-decisions:
  - "Sibling-not-extension honored: open-every-fixture.spec.ts is untouched. The consolidated flow spec is a separate file under the new tests/e2e/acceptance/ directory (D6-13)."
  - "ONE representative typography (D-07 default serif/18/64/comfortable) via the playwright.config default Desktop Chrome/Firefox/Safari viewport × the app's default tokens. NO CORPUS_MATRIX iteration — typography-stress is already PAGE-03's job (RESEARCH Open Question 2)."
  - "Page-advance is CONDITIONAL on pagesLength > 1: if the fixture fits on a single page at this viewport/typography, the reader sees the whole content on one page (which IS the complete read-through), so the advance step is skipped. The blocks-present assertion still runs unconditionally."
  - "RESTORE step asserts reader continuity (article + blocks present after reload), NOT pixel-exact scroll position. The pixel-exact restoration is owned by persistence.spec.ts (per Pitfall 6 — don't duplicate isolation logic)."
  - "CREATE + NAVIGATE reuses the verbatim capture-highlight.spec.ts + navigate-back.spec.ts paths (selectRangeInBlock → .selection-toolbar → Highlight button → mark.highlight[data-highlight-id] + announcementRegion /Highlight saved/i; then drawerTrigger → drawer entry → jump → focus lands on the mark via the rAF-deferred focus retry). The harness is mode-agnostic so it works whether reload landed in paginated or scrolling mode."
  - "ACPT-01 is fully closed by this plan — requirements-completed: [ACPT-01]. (Contrast with 06-01 which split ACPT-03 across 06-01 + 06-05; ACPT-01 is a single-plan deliverable per D6-13.)"

patterns-established:
  - "Pattern: acceptance specs live under tests/e2e/acceptance/ and reuse the annotations/_fixtures.ts harness wholesale (no selector re-derivation)"
  - "Pattern: the consolidated acceptance lens asserts the END-TO-END FLOW as ONE contract per fixture × engine, leaving per-feature isolation to the existing PAGE-01/ANNO-01/STATE-01 specs (Pitfall 6 honored)"

requirements-completed: [ACPT-01]

# Metrics
duration: 3 min
completed: 2026-08-08
status: complete
---

# Phase 6 Plan 02: ACPT-01 Core Reading Flow Summary

**Consolidated end-to-end core-reading-flow acceptance spec across the 6-fixture corpus × 3 engines (18 cells), proving the complete OPEN → READ → SWITCH → RESTORE → CREATE + NAVIGATE HIGHLIGHT loop without content loss — 18/18 green in chromium, firefox, and webkit.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-08T15:01:18Z
- **Completed:** 2026-08-08T15:04:00Z
- **Tasks:** 1
- **Files modified:** 1 (one new test-tier file; zero production code changed; zero existing specs modified)

## Accomplishments
- Delivered the ACPT-01 acceptance proof as a single consolidated spec that exercises the complete core reading + annotation flow on every corpus fixture in all 3 engines. 18/18 green (chromium 6/6, firefox 6/6, webkit 6/6) in 21.0s.
- Honored the D6-13 sibling-not-extension resolution: `open-every-fixture.spec.ts` stays the DOC-01 mount smoke (untouched); the consolidated flow spec is a sibling at `tests/e2e/acceptance/core-reading-flow.spec.ts`.
- Reused the existing `annotations/_fixtures.ts` harness wholesale (`openArticle`/`switchMode`/`selectRangeInBlock`/`findFirstBlockWithText`/`modeToggle`/`drawerTrigger`/`announcementRegion`/`wipeDatabase` + `FIXTURES`) — zero selector re-derivation, zero duplication of per-feature isolation logic (Pitfall 6).
- Followed RESEARCH Open Question 2: ONE representative typography (D-07 default) × 6 fixtures × 3 engines = 18 cells, NOT the full 54-cell CORPUS_MATRIX (typography-stress is PAGE-03's job).
- Re-verified the V5 (Zod-at-boundary) contract over the full corpus (threat_model T-06-03): every fixture mounts cleanly across all 3 engines — any malformed fixture would have surfaced as a flow failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: ACPT-01 consolidated core-reading-flow spec** — `86afd3c` (test)

## Files Created/Modified
- `tests/e2e/acceptance/core-reading-flow.spec.ts` — ACPT-01 consolidated acceptance spec (216 lines). Iterates the 6 `FIXTURES` from `fixtures-matrix.ts` × 3 engines. Per fixture, asserts the complete flow as ONE acceptance contract: (1) OPEN via `openArticle` (hash route + h1 sentinel + `__lemPagination` DEV hook + 600ms font settle); (2) READ THROUGH (article + every visible block present, no content loss; advance one page via the chevron and assert `currentPageIdx` advances, conditional on `pagesLength > 1`); (3) SWITCH MODE (M shortcut via `switchMode`; assert aria-label = "Reading mode: scrolling"; article + blocks survive the swap); (4) RESTORE (`page.reload()`; article re-mounts without content loss); (5) CREATE + NAVIGATE HIGHLIGHT (`findFirstBlockWithText` → `selectRangeInBlock` → `.selection-toolbar` → Highlight button → `mark.highlight[data-highlight-id]` + `announcementRegion` contains /Highlight saved/i; then `drawerTrigger` → drawer entry → jump → focus lands on the mark via the rAF-deferred retry). V7 pageerror guard at the end of each cell.

## Decisions Made
- **Sibling-not-extension (D6-13) honored.** `open-every-fixture.spec.ts` is untouched. The consolidated flow spec lives under the new `tests/e2e/acceptance/` directory — `open-every-fixture` stays the DOC-01 mount smoke (iterates `fixtures` from `src/fixtures`, asserts h1/source-link/article-body + no console errors); the consolidated spec iterates `FIXTURES` from `fixtures-matrix.ts` and asserts the complete flow as an acceptance contract.
- **ONE representative typography (RESEARCH Open Question 2).** 6 fixtures × 3 engines = 18 cells using the playwright.config default Desktop Chrome/Firefox/Safari viewport × the app's D-07 default serif/18/64/comfortable tokens. NO `CORPUS_MATRIX` iteration (the only mention of `CORPUS_MATRIX` is the doc comment "NO CORPUS_MATRIX iteration" at line 73) — typography-stress is already PAGE-03's job.
- **Page-advance is conditional on `pagesLength > 1`.** If a fixture fits on a single page at the default viewport/typography, the reader sees the whole content on one page (which IS the complete read-through), so the advance step is skipped via an `if (devAtOpen.pagesLength > 1)` guard. The `engine status === "ok"` + `pagesLength > 0` + blocks-present assertions still run unconditionally.
- **RESTORE asserts reader continuity, not pixel-exact scroll.** The reload step asserts article + visible blocks present after reload (the acceptance bar — no content loss, no blocked navigation). The pixel-exact scroll-position restoration is owned by `persistence.spec.ts` (STATE-01 isolation); duplicating that here would violate Pitfall 6.
- **CREATE + NAVIGATE reuses the verbatim capture-highlight + navigate-back paths.** `findFirstBlockWithText` + `selectRangeInBlock` + `.selection-toolbar` → Highlight → `mark.highlight[data-highlight-id]` + `announcementRegion` /Highlight saved/i (ANNO-01 verbatim); then `drawerTrigger` → drawer entry → `.drawer-entry` click → focus lands on the mark via the rAF-deferred `toPass({ timeout: 3000 })` retry (ANNO-04/D5-11 verbatim, mirroring `navigate-back.spec.ts`). The harness is mode-agnostic so it works whether reload landed in paginated or scrolling mode.
- **ACPT-01 is fully closed by this plan.** `requirements-completed: [ACPT-01]` — unlike 06-01 which split ACPT-03 across 06-01 + 06-05 (mirroring the 04-02 PAGE-01 split precedent), ACPT-01 is a single-plan deliverable per D6-13.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No new packages installed (reuses the locked `@playwright/test` 1.61.1).

## Next Phase Readiness
- **ACPT-01 is proven.** The complete core reading + annotation flow completes on every corpus fixture in all 3 engines without content loss or blocked navigation (18/18 green).
- The full `npm run test` suite green-at-wave-merge is verified by Plan 06-06; this plan's new spec is isolated (no production code changed, no existing spec modified) so no regression surface was introduced.
- No blockers. Plan 06-02 is independent of 06-01 (no shared files); both Wave 1 plans can land in either order.

## Self-Check: PASSED

- [x] `tests/e2e/acceptance/core-reading-flow.spec.ts` exists (FOUND)
- [x] Task 1 commit `86afd3c` exists in git log (FOUND)
- [x] `npx tsc --noEmit` exits 0 (PASS)
- [x] `npm run test:e2e -- --grep "core-reading-flow"` exits 0 across chromium/firefox/webkit (PASS — 18/18 in 21.0s)
- [x] Spec iterates the 6 FIXTURES via `for (const fixture of FIXTURES)` (FOUND at line 77)
- [x] Spec imports harness from `annotations/_fixtures` (FOUND at line 35)
- [x] Spec asserts the full flow (open/read/switch/restore/create+navigate) (FOUND — 18 multi-step assertions across the spec)
- [x] Spec uses ONE representative typography — no CORPUS_MATRIX iteration (PASS — only doc-comment mention at line 73)
- [x] `open-every-fixture.spec.ts` is NOT modified (PASS — `git diff --stat` empty)
- [x] ACPT-01 marked complete in REQUIREMENTS.md (via `requirements mark-complete`)

---
*Phase: 06-prototype-acceptance*
*Completed: 2026-08-08*
