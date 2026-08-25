---
phase: 14-navigation-and-library-contracts
plan: 01
subsystem: library
tags: [reading-state, progress-policy, pure-modules, document-title, vitest]

# Dependency graph
requires:
  - phase: 08-markdown-pipeline-and-personal-library
    provides: FINISHED_THRESHOLD single-source export (ContinueReadingStrip), LibraryRow FINISHED_RATIO behavior, strip membership semantics
  - phase: 12-epub-intake
    provides: bookProgress.ts pure derivations (deriveBookProgress D12-03, resolveResumeChapterId D12-07)
provides:
  - readingState.ts — the ONE reading-state policy module (articleReadingState / bookReadingState / countByState)
  - pageMeta.ts — the per-destination document.title helper (TITLE_SUFFIX / truncateTitle / setDocumentTitle)
  - bookProgress.latestLocationByArticle export (the one owner of the latest-savedAt fold)
  - LibraryRow/BookRow/ContinueReadingStrip unified onto the policy (FINISHED_RATIO fork deleted)
affects: [14-02 (view switcher + counts + LibraryView title), 14-03 (destination titles + focus), 14-04 (agreement validation importing the policy into e2e)]

# Tech tracking
tech-stack:
  added: []  # zero packages installed (T-14-SC accept — none needed)
  patterns:
    - "ONE pure policy module owns a derivation family (D14-20) — consumers gate on state literals, never re-derive ratios"
    - "Title strings built by exactly one helper; separator string appears exactly once in the owning file"

key-files:
  created:
    - src/ingestion/library/readingState.ts
    - src/ingestion/library/pageMeta.ts
    - tests/unit/library/reading-state.test.ts
    - tests/unit/library/page-meta.test.ts
  modified:
    - src/ingestion/library/bookProgress.ts
    - src/ingestion/library/LibraryRow.tsx
    - src/ingestion/library/BookRow.tsx
    - src/ingestion/library/ContinueReadingStrip.tsx

key-decisions:
  - "LIB-07 NOT marked complete — 14-01 ships the policy foundation only; the view switcher ships in 14-02 and agreement proof lands in 14-04 (10-01 RECV-01 split precedent; requirements-completed is [])"
  - "articleReadingState keeps the ratio formula verbatim (Math.min(1, offset/total)) so the opened-zero-length edge stays byte-stable (finished on every surface today)"
  - "latestLocationByArticle exported (single keyword) per 14-RESEARCH OQ2 resolution — bookProgress.ts is the one fold owner; no fourth fork"
  - "readingState ↔ ContinueReadingStrip import cycle kept (the bookProgress ↔ strip precedent; constant import is side-effect free)"

patterns-established:
  - "Policy-module pattern: no React, no Dexie, caller-supplied lookups; components own reads, the module owns algebra (mirrors bookProgress.ts exactly)"
  - "TDD per module: RED commit (failing truth table) → GREEN commit (module) → consumer refactor commit gated by an unmodified e2e lock"

requirements-completed: []  # LIB-07 closes at 14-02/14-04 (split precedent — see Decisions)

# Metrics
duration: 6 min
completed: 2026-08-25
status: complete
---

# Phase 14 Plan 01: Navigation & Library Contracts — Policy Foundations Summary

**Pure reading-state policy module (readingState.ts) + document.title helper (pageMeta.ts) with all three consumers unified byte-identically — the FINISHED_RATIO fork deleted, threshold single-source preserved**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-25T17:59:22Z
- **Completed:** 2026-08-25T18:05:55Z
- **Tasks:** 3 (2 TDD: RED→GREEN each)
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `readingState.ts` is now the single derivation point for `unread | in-progress | finished` across articles AND books — 12-row truth table pins D14-18 (opened = in-progress), D14-19 (39/40-chapter book stays in-progress), D14-21 (missing-chapter-row book never finishes), D14-24 (counts fold with each book counting once)
- `pageMeta.ts` produces the UI-SPEC title convention exactly: `"Lem Reader"` suffix, em-dash separator (exactly one occurrence in the file, inside setDocumentTitle), 64-char content cap + ellipsis (5 unit rows)
- LibraryRow's standing `FINISHED_RATIO` fork (known D8-12 tech debt) is deleted; LibraryRow/BookRow/ContinueReadingStrip all derive from the policy with byte-identical rendered output — progress-recent.spec UNMODIFIED, 5/5 chromium green
- `bookProgress.latestLocationByArticle` newly exported — the one owner of the latest-savedAt fold (fourth-copy anti-pattern closed per 14-RESEARCH OQ2 resolution)

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1 RED: 12-row truth table** — `b136b16` (test)
2. **Task 1 GREEN: reading-state policy module** — `5589735` (feat)
3. **Task 2 RED: page-meta title suite** — `ff80c65` (test)
4. **Task 2 GREEN: pageMeta title helper** — `be06041` (feat)
5. **Task 3: consumer unification (FINISHED_RATIO fork deleted)** — `df73f4d` (refactor)

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `src/ingestion/library/readingState.ts` — NEW: `ReadingState` union, `articleReadingState(location, total)`, `bookReadingState(book, locations, textLengthOf)`, `countByState(standalone, books, locations, textLengthOf)`; FINISHED_THRESHOLD imported from the strip export (zero numeric forks — `rg "0\.98"` returns no matches)
- `src/ingestion/library/pageMeta.ts` — NEW: `TITLE_SUFFIX`, `truncateTitle` (64-cap + ellipsis), `setDocumentTitle` (single text-only write; T-14-01 mitigated)
- `src/ingestion/library/bookProgress.ts` — `latestLocationByArticle` newly exported (single-line, no behavior change)
- `src/ingestion/library/LibraryRow.tsx` — FINISHED_RATIO const + comment deleted; `isFinished = articleReadingState(location, total) === "finished"`; ratio math verbatim for the hairline
- `src/ingestion/library/BookRow.tsx` — `isFinished` routes through `bookReadingState`; deriveBookProgress/totalsById memos untouched
- `src/ingestion/library/ContinueReadingStrip.tsx` — article + book membership gates are `!== "in-progress"` checks on the policy; resume/ordinal/progress derivations kept; `export const FINISHED_THRESHOLD = 0.98;` byte-identical; surface/copy/DOM untouched
- `tests/unit/library/reading-state.test.ts` — NEW: 12-row LIB-07 policy truth table (schema-parse fixtures, lengthsOf identity lookup, boundary-named cases)
- `tests/unit/library/page-meta.test.ts` — NEW: 5-row title contract (suffix, separator, 64/65-char boundaries)

## Decisions Made

- **LIB-07 split (10-01 RECV-01 precedent):** frontmatter lists LIB-07, but the reader cannot yet switch views — the switcher ships in 14-02 and the count/membership agreement proof lands in 14-04. Marking it complete now would be a false claim; `requirements-completed: []`.
- **Opened-zero-length edge preserved byte-for-byte:** `Math.min(1, positive/0) = 1 ≥ threshold → finished` is current behavior on every surface; the formula stays verbatim and the test documents the edge rather than "fixing" it (zero UI change is a plan constraint).
- **Book membership gate ordering:** the strip evaluates `bookReadingState` first, then keeps a defensive `resumeChapterId === null` guard (TS narrowing; in-progress implies a resume chapter). Pure derivations — identical entry set.
- **Header docs updated alongside the swap:** the strip's substrate bullet now names the policy gate (comments only; surface/copy/DOM untouched per the phase boundary).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid ISO dates in the 39/40 truth-table fixture**
- **Found during:** Task 1 (GREEN run — 11/12 passed)
- **Issue:** The 39/40-chapter test generated `savedAt` values `2026-01-32`…`2026-01-39` (day index > 31); `LocationRecordSchema.parse` correctly rejected them.
- **Fix:** Uniform valid `savedAt` (`2026-01-01T00:00:00.000Z`) — the row pins the RATIO edge, not recency (each chapter has exactly one location, so the fold has nothing to order).
- **Files modified:** tests/unit/library/reading-state.test.ts
- **Verification:** 12/12 rows green; book-progress suite still 16/16
- **Committed in:** 5589735 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug, in this plan's own new test)
**Impact on plan:** None — fixture validity only; no production code or behavior touched by the fix.

## TDD Gate Compliance

| Task | RED | GREEN | Notes |
|------|-----|-------|-------|
| Task 1 (readingState) | ✓ `b136b16` | ✓ `5589735` | RED failed on missing module (expected for a new module); GREEN 12/12 |
| Task 2 (pageMeta) | ✓ `ff80c65` | ✓ `be06041` | RED failed on missing module; GREEN 5/5 |

Both gate sequences present in `git log`. Task 3 was a behavior-identical refactor (`df73f4d`) gated by the unmodified progress-recent.spec — no TDD cycle required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `npx vitest run tests/unit/library/reading-state.test.ts tests/unit/library/page-meta.test.ts` → exit 0 (17/17)
- `npx vitest run tests/unit/library/` → exit 0 (56/56 incl. untouched book-filter/book-progress/book-row suites)
- `npx playwright test tests/e2e/library/progress-recent.spec.ts --project=chromium` → exit 0 (5/5), spec zero-diff
- `rg -n "FINISHED_RATIO" src/` → zero matches
- `rg -n "0\.98" src/ingestion/library/readingState.ts` → zero matches (no threshold fork)
- `npx tsc --noEmit` → exit 0; targeted `npx eslint` on all 8 files → exit 0
- No store changes, no new dependencies, no UI surface changes (success criteria met)

## Known Stubs

None — both new modules are complete implementations. `pageMeta.setDocumentTitle` has no callers yet by design: Plans 14-02/14-03 wire it into destinations (the helper itself is finished, tested, and pinned; this is the planned foundation split, not a stub).

## Next Phase Readiness

- `readingState.ts` API is ready for 14-02's view switcher: `articleReadingState(locationsByArticle.get(id), totalsById.get(id) ?? 0)`, books via `bookReadingState(book, allLocations, totalsById.get)`, counts via `countByState` (call shapes already validated against 14-02's plan text)
- `pageMeta.setDocumentTitle` is ready for 14-02 (`"Saved articles"`) and 14-03 (article/chapter/error/review forms); `truncateTitle` is exported for the combined chapter + book title assembly
- `latestLocationByArticle` is now importable for the LibraryView fold (no fourth copy)
- No blockers. Ready for 14-02.

## Self-Check: PASSED

All 4 created files exist on disk; all 5 task commit hashes verified in git log; all task acceptance criteria and plan-level verification commands re-run green (see Verification Evidence).
