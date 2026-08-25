---
phase: 14-navigation-and-library-contracts
plan: 04
subsystem: library
tags: [e2e, playwright, 3-engine, reading-state-views, focus-management, history-semantics, honest-gate]

# Dependency graph
requires:
  - phase: 14-navigation-and-library-contracts
    plan: 01
    provides: readingState.ts policy (articleReadingState/bookReadingState/countByState) + normalizeText/graphemeClusters substrate
  - phase: 14-navigation-and-library-contracts
    plan: 02
    provides: view routes + ViewSwitcher + per-view LibraryView + library title/h1-focus effects
  - phase: 14-navigation-and-library-contracts
    plan: 03
    provides: ArticleView/ReviewView title effects + most-specific-wins focus layering
provides:
  - tests/e2e/library/reading-views.spec.ts — the 3-engine views/counts/rows/empty agreement matrix + the 10-case NAV-04 focus/title/history matrix + seedBook/seedArticleRows helpers
  - tests/e2e/chrome/back-nav.spec.ts — strengthen-only view-route Back-semantics case (30 added / 0 modified lines)
  - the honest phase-gate record (npm run test exit 0, counts below) + the byte-stable anchor audit
  - two Rule 1 production fixes in LibraryView.tsx (detached Map.get crash + StrictMode-unsafe cold-load focus)
affects: [Phase 15 (NAV-03 restore inherits "which view" from the URL — now proven), Phase 21 (ACPT-08 SR-voice check builds on the proven focus substrate)]

# Tech tracking
tech-stack:
  added: []  # zero packages installed (T-14-SC accept — none needed)
  patterns:
    - "Structural e2e agreement: the spec IMPORTS the app's policy module and computes expected counts/membership in Node over the same seed rows — a lock, not a copy check (D14-20/23/24)"
    - "True cold-boot e2e shape: goto(about:blank) → goto(hash URL) — a full document load with no prior same-document hashchange (openView's goto+reload warms first and Chromium restores focus across reloads)"
    - "Finished seeds = graphemeOffset at the article's FULL total, never a floored threshold multiple (the 0.98 truncation trap)"

key-files:
  created:
    - tests/e2e/library/reading-views.spec.ts
  modified:
    - tests/e2e/chrome/back-nav.spec.ts
    - src/ingestion/library/LibraryView.tsx

key-decisions:
  - "NAV-04/LIB-07/LIB-08 close HERE (requirements marked complete): 14-01/02/03 shipped implementation with requirements-completed [] per the split precedent; this plan's 3-engine matrix is the documented proof scope"
  - "a11y.spec.ts extended ZERO — the .view-switcher nav lives on the library surface the fixture-list axe scan already covers (14-RESEARCH A6 held; grep-verified)"
  - "The cold-load case uses about:blank → deep URL as the true cold boot; the reload-based shape is a DIFFERENT case (D14-17 reload test, Task 1) because Chromium restores the pre-reload focus natively — not an app focus move"
  - "back-nav strengthen-only case switches to UNREAD (not Finished): back-nav's unseeded fixture corpus makes Finished empty (no article link to open); the two-switch Back-to-originating proof lives in reading-views' HISTORY case with the seeded corpus"

patterns-established:
  - "seedBook/seedArticleRows: Zod-built rows in Node + raw IndexedDB puts; chapter rows carry ingestionMeta.bookId AND the denormalized top-level bookId (the booksStore.saveBook write shape — the v5 index contract)"
  - "Readiness signal for count/empty assertions: the parenthetical All count (renders only at status ready) — present on empty views where .library-list > li never mounts"

requirements-completed: [NAV-04, LIB-07, LIB-08]

# Metrics
duration: 27 min
completed: 2026-08-25
status: complete
---

# Phase 14 Plan 04: Navigation & Library Contracts — 3-Engine Validation Summary

**A 75-cell 3-engine Playwright matrix proving view routes, count/row/empty agreement against the imported readingState policy, the 10-case focus/title/history contract, and the honest full-suite gate (2468 passed / 0 failed / exit 0) — with two jsdom-blind Rule 1 production fixes surfaced and closed**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-25T18:33:24Z
- **Completed:** 2026-08-25T19:00:44Z
- **Tasks:** 3
- **Files:** 3 production/test files + 1 validation ledger (2 created-equivalent commits, 2 fix commits, 1 strengthen-only commit)

## Honest Phase-Gate Record (T-14-08)

`npm run test` — ONE invocation, no subsetting, no grep-filter, no engine-skip:

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Unit + component (vitest) | 1289 | 0 | 13 (the documented intentional set) |
| E2E (chromium + firefox + webkit + chromium-throttled) | 1179 | 0 | 10 (the documented intentional set) |
| **Total** | **2468** | **0** | **23** |

**Exit code 0.** The new matrix ran green on ALL THREE engines inside the gate: reading-views (19) + back-nav (6) = 25 cells × chromium/firefox/webkit = 75 green cells.

## Accomplishments

- **Task 1 — agreement matrix (LIB-07/LIB-08):** `reading-views.spec.ts` seeds a corpus (3 standalone articles + 4 books incl. the D14-19 3-of-4 and D14-21 missing-chapter-row honesty books, on top of the six bundled fixtures) and asserts, per view URL: all four switcher count names exactly, `.library-list > li` row counts (a book = ONE li), the per-view empty-state heading exactly-when-zero, and aria-current on exactly one link — expected values computed in Node from the IMPORTED `readingState` module with `normalizeText` + `graphemeClusters` totals (structural lock). Route cases: unknown `#/bogus-view` → All (D14-16); reload on `#/finished` stays Finished (D14-17). The honesty rows are held-out seeded checks: both books visible under `#/in-progress`, absent from `#/finished`.
- **Task 2 — NAV-04 matrix:** 10 cases pin cold-load no-focus (true cold boot), in-app article h1 focus + Back warm library refocus, view-switch replaceState URL + aria-current + h1 focus + title constancy, Back-to-ORIGINATING-view (two switches, never intermediate), deep-link mark focus (jump-bidirectional seeding reused via `_portability` helpers), restore-beats-h1 (resume banner), overlay title stability, error h1 focus + truthful title, EPUB chapter title (`Chapter — Book — Lem Reader`), and the review destination's title + warm h1 focus. Plus ONE strengthen-only back-nav case (e): switcher view → article → Back returns at the switched-to view URL — 30 added / 0 modified lines.
- **Task 3 — honest gate + a11y + audit:** full `npm run test` exit 0 with counts recorded above; a11y coverage CONFIRMED already present (the fixture-list axe scan covers the library surface where `.view-switcher` lives — spec byte-unchanged, 14-RESEARCH A6 held); anchor audit green (below).

## Task Commits

1. **Task 1 (Rule 1 fix):** `6785568` — fix: bind totalsById lookups in LibraryView policy call sites
2. **Task 1:** `59ef8ac` — test: add reading-views agreement matrix (views/counts/rows/empty)
3. **Task 2 (Rule 1 fix):** `6810ead` — fix: make the LibraryView view-switch focus effect StrictMode-safe
4. **Task 2:** `4ba1ff4` — test: add NAV-04 focus/title/history matrix + view-route Back case
5. **Task 3:** no code change (a11y.spec needed no extension; the gate record + audit live here)

**Plan metadata:** see final docs commit below.

## Byte-Stable Anchor Audit (vs phase start `e3a7f3e^..HEAD`)

| Anchor | Diff | Verdict |
|--------|------|---------|
| `tests/e2e/ingestion/happy-path.spec.ts` | — (empty) | ZERO changes ✓ |
| `tests/e2e/library/progress-recent.spec.ts` | — (empty) | ZERO changes ✓ |
| `tests/e2e/chrome/back-nav.spec.ts` | 30 added / 0 deleted | strengthen-only ✓ |
| Library h1 markup (LibraryView.tsx) | `ref={h1Ref} tabIndex={-1}` + comment only; text/level byte-stable | tabIndex+ref only ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Detached `totalsById.get` crashed the library render with any located book**
- **Found during:** Task 1 (first corpus run — the switcher counts never rendered)
- **Issue:** 14-02 passed `totalsById.get` as a bare reference into `bookReadingState`/`countByState`; `Map.prototype.get` requires its receiver, so the render threw `TypeError: incompatible receiver undefined` whenever a book row existed. **5 epub-intake cells were already failing on the main tree** (pre-existing, discovered by running the spec — not caused by this plan's tests).
- **Fix:** Arrow wrappers at both call sites (`(id) => totalsById.get(id)`).
- **Files modified:** src/ingestion/library/LibraryView.tsx
- **Verification:** reading-views 9/9 chromium; epub-intake 12/12 chromium (the 5 red cells cured); full gate exit 0.
- **Commit:** `6785568`

**2. [Rule 1 - Bug] The view-switch focus effect's boolean first-run flag was not StrictMode-safe**
- **Found during:** Task 2 (cold-load case — the h1 WAS focused on a true cold boot)
- **Issue:** Under React StrictMode (the dev-server app), the double-invoked `[view]` effect's second pass saw `viewEffectFirstRun` already flipped and focused the h1 on every cold load — a real D14-03 violation visible only in real browsers (jsdom component tests never wrap in StrictMode).
- **Fix:** Compare the previous view instead: `null` = the mount run, view-unchanged = the StrictMode twin — neither announces; only a genuine view switch fires the D14-15 focus.
- **Files modified:** src/ingestion/library/LibraryView.tsx
- **Verification:** cold-load case green; view-switch/warm/refocus cases still green; 28 component tests + 66 library/epub/review e2e cells green; full gate exit 0.
- **Commit:** `6810ead`

---

**Total deviations:** 2 auto-fixed (2 production bugs — both jsdom-blind, both surfaced exactly by the browser matrix this plan exists to run).
**Impact on plan:** Positive — the plan's stated purpose ("browser truth — jsdom is not authoritative") caught two real defects that unit/component suites could not see; both fixed inline with no scope change.

## A11y Coverage Check (Task 3)

`a11y.spec.ts` byte-unchanged: the first axe scan ("fixture list", L55-63) targets `BASE/` — the library surface where `.view-switcher` mounts (14-02 placed it as the first child of the list section) — and the 12-06 book-library scans cover the with-book variant. The new nav landmark is inside a scanned surface on all three engines (all a11y cells green in the gate). 14-RESEARCH A6's expectation of no change held.

## Manual Boundary (D14-09 — documented, not silently skipped)

SR announcement quality (the screen reader actually reading the focused h1 on route/view swap) is the documented manual/deferred instrument — the ACPT protocol (docs/ACCEPTANCE-PROTOCOL.md, ACPT-08, Phase 21). This phase proves the automatable substrate: focus identity landed on the h1 (`toBeFocused` across all three engines). No automated claim is made about SR voice.

## Issues Encountered

None open. The two production bugs found were fixed within the plan (see Deviations); the 5 pre-existing epub-intake failures they cured are CLOSED (verified 12/12 in the gate), not deferred.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/back-nav.spec.ts --project=chromium` → exit 0 (25/25)
- `npx playwright test tests/e2e/library/ tests/e2e/epub-intake.spec.ts tests/e2e/review-panel/route-entry.spec.ts --project=chromium` → exit 0 (66/66)
- `npx vitest run tests/component/App.test.tsx tests/component/ArticleView.test.tsx` → exit 0 (28/28)
- `npm run test` → **exit 0 in ONE invocation** — 2468 passed / 0 failed / 23 skipped (counts above; no subset, no grep-filter, no engine-skip)
- Anchor audit numstats + h1 markup diff — table above (grep/`git diff --numstat` against phase start)
- `npx tsc --noEmit` → exit 0; targeted eslint on LibraryView.tsx → exit 0
- Acceptance greps: reading-views imports from `../../../src/ingestion/library/readingState` + `src/content/normalizeText` ✓; beforeEach clears the books store ✓; zero `0.98` literals and the only `Math.floor` seed is the in-progress 0.5 ✓

## Known Stubs

None — every case this plan ships is a real assertion against real surfaces.

## Next Phase Readiness

- Phase 14 is COMPLETE (4/4 plans; NAV-04/LIB-07/LIB-08 closed): ready for `/gsd-verify-work 14` and the phase review/ship flow
- Phase 15 (NAV-03) inherits proven URL-restored views (D14-17) and the h1-focus substrate for row-level restore work
- No blockers.

## Self-Check: PASSED

All created/modified files exist on disk; all 4 task commit hashes (6785568, 59ef8ac, 6810ead, 4ba1ff4) verified in git log; plan-level verification commands re-run green (see Verification Evidence).
