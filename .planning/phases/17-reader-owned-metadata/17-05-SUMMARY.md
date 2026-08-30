---
phase: 17-reader-owned-metadata
plan: 05
subsystem: testing
tags: [playwright, e2e, metadata-overrides, migration, portability, cross-surface, honest-gate]

# Dependency graph
requires:
  - phase: 17-reader-owned-metadata (Plans 01-04)
    provides: ArticleSchema readerTitle/readerAuthor + the one effectiveMetadata derivation (17-01), the edit dialog + library effective-value swap (17-02), the reader/review/export surface swaps (17-03), bundle v3 + article-metadata-override conflicts + per-item choices (17-04)
provides:
  - tests/e2e/ingestion/dexie-migration.spec.ts — the v5-row override-hydration migration describe (no write-back + forward shape), closing META-04's migration clause
  - tests/e2e/portability/round-trip.spec.ts — the override round-trip cell (v3 bundle, byte-equal raw rows on machine B, no-override regression companion) + the two writer-emit assertion flips 2→3
  - tests/e2e/portability/import-preview.spec.ts — the metadata-conflict flow describe: conflict row + both names + one-side-only (D17-11), keep-local default, per-item Use imported (incl. override removal), merge-on-win (D17-10), remove-flow cascade (D17-13)
  - tests/e2e/library/metadata-edit.spec.ts — the META-02 cross-surface describe (reader document.title/h1/byline, review select + section h2, export filename + markdown with canonical ABSENT, strip)
  - The Phase 17 honest full-suite gate record: npm run test exit 0 in one invocation (first RED run honestly recorded, fixed forward, re-run green — the 09-07 precedent)
affects: [phase-18-onward (ORNT), any future bundle-version bump or metadata work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Version-bump assertion-update sweep: when a writer version bumps, EVERY writer-emit assertion flips in the same commit (round-trip L169+L365, core-flow-spine L231) — a stale site anywhere surfaces only at the honest full-suite gate"
    - "Cross-surface consistency cell shape: one describe, one dialog edit, then surface-by-surface assertions through the real UI with the canonical strings asserted ABSENT (one name is a negative assertion, not just a positive one)"

key-files:
  created: []
  modified:
    - tests/e2e/ingestion/dexie-migration.spec.ts
    - tests/e2e/portability/round-trip.spec.ts
    - tests/e2e/portability/import-preview.spec.ts
    - tests/e2e/library/metadata-edit.spec.ts
    - tests/e2e/portability/core-flow-spine.spec.ts

key-decisions:
  - "The plan's Task 2 version-bump update named only round-trip L169; the books-cell L365 assertion is the same writer-emit class and was flipped in the same commit (both would fail against the v3 writer) — the 12-07 precedent applied exhaustively within the named file"
  - "The honest full-suite gate's first run was recorded RED (1323/3/10): core-flow-spine.spec.ts L231 carried a THIRD v2-emit assertion outside the plan's file list — fixed forward as Rule 1 with the precedent-citing comment, gate re-run green"
  - "TDD shape for a test-only verification plan: Task 2's honest RED pre-existed at HEAD (both round-trip v2-emit cells failing on the v3 writer, recorded before any edit); Tasks 1/3 add proof cells over already-green 17-01..04 implementations (the 17-01 Task 2 / 17-02 Task 3 test-strengthening precedent)"
  - "requirements-completed: [META-02, META-04] — META-04's remaining half (migration, round-trip, explicit conflicts, refresh-never-renames, cascade) closes here on top of 17-04's portability half; META-02's cross-surface behavioral proof closes here on top of 17-02's library half + 17-03's downstream half"

patterns-established:
  - "Honest-gate discipline replayed verbatim: one invocation, exact printed counts, first-RED-recorded-then-fixed, no subsets/greps/engine skips (T-17-11 mitigated)"

requirements-completed: [META-02, META-04]

# Metrics
duration: 33 min
completed: 2026-08-30
status: complete
---

# Phase 17 Plan 05: Browser-Proof META-02/META-04 + Honest Phase Gate Summary

**Migration-without-write-back, v3-bundle override round-trip with byte-equal rows, explicit metadata conflicts with both resolutions, refresh-never-renames, remove-cascade, and one-effective-name-everywhere — all proven in real browsers, closing Phase 17 behind an honest exit-0 full-suite gate (1344+1326 passed / 0 failed).**

## Performance

- **Duration:** 33 min
- **Started:** 2026-08-30T02:42:51Z
- **Completed:** 2026-08-30T03:16:07Z
- **Tasks:** 3
- **Files modified:** 5 (all test files; zero production files — the plan is test-only)

## Accomplishments
- **META-04 migration clause proven**: a pre-Phase-17 v5 row (no override keys) opens intact, renders canonical values through the Zod-validated read path, and its raw stored row gains NO readerTitle/readerAuthor key ever (hydration on read, never on disk — 17-01 Option A); the forward-shape cell proves the same path renders override keys' effective values with canonical bytes untouched
- **META-04 round-trip + conflicts proven end-to-end**: machine A renames via the real dialog → bundle.json carries schemaVersion 3 with the overrides riding the article record → machine B imports with raw-row byte equality and the one effective name in the library; the conflict describe drives the real ImportPreviewDialog through the article-metadata-override row (label, both-names disclosure, one-side-only per D17-11), keep-local default at the raw-row level, per-item Use imported (including override REMOVAL when the incoming row lacks the key), merge-on-win keeping the LOCAL title across a revision+1 overwrite (D17-10), and the remove-flow cascade deleting the override with the row (D17-13)
- **META-02 one-name-everywhere proven cross-surface**: after one library edit, reader document.title (`{effective} — Lem Reader`), article h1, byline, the Highlights select option + section h2, the per-article export filename + markdown citation/heading (canonical title AND author asserted ABSENT), and the Continue Reading strip all show the single effective name — driven entirely through the real UI
- **The honest phase gate**: `npm run test` exit 0 in ONE invocation on a fresh dev server — unit 1344 passed / 0 failed / 13 intentional skips (92 files + 2 skipped), e2e 1326 passed / 0 failed / 10 skipped (11.5m, includes the chromium-throttled perf project); 23 documented skips total, matching the Phase 15/16 close counts

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration proof — v5 rows hydrate overrides without a write-back** - `83d8f99` (test)
2. **Task 2: Round-trip + import-conflict e2e (v3 bundle, keep-local, take-incoming, merge-on-win, cascade)** - `cf0e5d8` (test)
3. **Task 3: Cross-surface consistency cells + honest full-suite phase gate** - `f953c73` (test: the META-02 describe) + `c84c7e1` (fix: the gate-surfaced third v2-emit flip)

**Plan metadata:** (final docs commit below)

## TDD Gate Compliance

- **Task 2 (`tdd="true"`) had a genuine RED at HEAD**: recorded before any edit — `npx playwright test round-trip.spec.ts --project=chromium` exited with 2 failures (both schemaVersion assertions expecting the pre-17-04 v2 writer). The Task 2 commit turns them green and adds the new cells. RED → GREEN order holds.
- **Task 1 (`tdd="true"`)** is the test-strengthening shape over the already-green 17-01 implementation (production shipped in a prior plan — no failing test is constructible without deleting production code); committed as `test(17-05):` per the 17-01 Task 2 / 17-02 Task 3 precedent.
- **Task 3** carries no tdd flag; its gate leg recorded a first RED run honestly (see Deviations) and the fix-forward commit precedes the green re-run.

## Files Created/Modified
- `tests/e2e/ingestion/dexie-migration.spec.ts` — +214 lines: the "v5 rows hydrate overrides without a write-back" describe (pre-Phase-17 cell + forward-shape cell); zero deletions
- `tests/e2e/portability/round-trip.spec.ts` — the override round-trip test (edit via real dialog on A → v3 bundle assertions → B raw-row byte equality + effective-name library row + no-override regression companion); the two writer-emit flips 2→3 with re-worded comments
- `tests/e2e/portability/import-preview.spec.ts` — +the "PORT-02 metadata overrides" describe (4 cells: conflict row + one-side-only + keep-local default; per-item take-incoming with override removal; merge-on-win revision+1; remove-flow cascade); zero deletions
- `tests/e2e/library/metadata-edit.spec.ts` — +141 lines: the META-02 cross-surface describe (strip, reader title/h1/byline, review select + h2, export filename + content with canonical absent); zero deletions — the 17-02 cells stay byte-unchanged
- `tests/e2e/portability/core-flow-spine.spec.ts` — the third v2-emit assertion flipped to 3 (Rule 1 gate surfacing)

## Decisions Made
- **L365 flipped alongside the plan's L169** — the books cell's `bundleA.schemaVersion` assertion is the identical writer-emit class; flipping only L169 would have left the spec red at Task 2's own verify gate. Both carry the Phase 17 re-worded comments.
- **core-flow-spine L231 fixed as Rule 1, not scoped out** — the failure was caused by Phase 17's own writer bump (17-04) landing without the e2e sweep; it is directly in this phase's blast radius, and the honest-gate contract (T-17-11) forbids shipping a red suite. Fixed forward with the precedent-citing comment; identical-cell-across-engines classification confirmed regression, not harness.
- **Cross-surface cell asserts canonical strings ABSENT** — a positive effective-name assertion alone cannot prove "one name"; the canonical title AND author are `not.toContain`-ed against the exported markdown, and `toHaveCount(0)`-ed against the strip/review surfaces.
- **Highlight seeding via the 12-07 chapter pattern** — parse the saved Dexie row through ArticleSchema in Node, derive the confident anchor with the shipped `confidentHighlightOn`, raw-put the row; no UI-driven selection flakiness in a consistency cell whose subject is metadata, not annotation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Third v2-emit writer assertion outside the plan's file list**
- **Found during:** Task 3 (the honest full-suite gate's first run)
- **Issue:** `core-flow-spine.spec.ts:231` still expected `schemaVersion` 2; 17-04's v3 writer made it fail identically on all three engines (first gate run: 1323 passed / 3 failed / 10 skipped)
- **Fix:** Flipped to `toBe(3)` with the 12-07 version-bump precedent comment naming the 17-05 round-trip flips; verified no other writer-emit sites remain (rg sweep — all other `toBe(2)` hits are v2-input hydration or unrelated schema versions)
- **Files modified:** tests/e2e/portability/core-flow-spine.spec.ts
- **Verification:** targeted spec 3/3 green × engines; full gate re-run exit 0
- **Committed in:** c84c7e1

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Directly in Phase 17's blast radius (the 17-04 writer bump). No scope creep — a one-line assertion flip plus comment.

## Issues Encountered
- **First gate invocation's exit-code echo was a zsh artifact** (`PIPESTATUS` is bash-only; the echoed 0 came from `tail`). The run itself was recorded RED from its printed counts (3 failed), the fix landed, and the re-run captured `EXIT_CODE=$?` directly off the redirected command: 0. No misreport reached the record.
- A stray one-character comment drift in the v3→v4 describe was introduced by the Task 1 edit and reverted before commit (strengthen-only verified: `git diff` shows zero deletions in dexie-migration.spec.ts and import-preview.spec.ts).

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 spec | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | 12/12 passed (4 tests × chromium/firefox/webkit), exit 0 |
| Task 1 grep | `rg -c 'readerTitle' dexie-migration.spec.ts` | 10 (≥2 required) |
| Task 2 RED (pre-edit, at HEAD 0d7dc6e) | `npx playwright test round-trip.spec.ts --project=chromium` | 2 failed (both schemaVersion expected 2 / received 3) — the honest RED |
| Task 2 specs | `npx playwright test round-trip.spec.ts import-preview.spec.ts` | 30/30 passed (10 tests × 3 engines), exit 0 |
| Task 2 greps | rg readerTitle/schemaVersion (round-trip); article-metadata-override / Keep mine / Use imported (import-preview) | 6 / 12; 3 / 2 / 3 — all present |
| Task 3 spec | `npx playwright test tests/e2e/library/metadata-edit.spec.ts` | 30/30 passed (10 tests × 3 engines), exit 0 |
| Strengthen-only | `git diff` deletion lines on dexie-migration + import-preview + metadata-edit | zero deletions (metadata-edit +141/-0) |
| **Honest phase gate (first run, recorded RED)** | `npm run test` | e2e 1323 passed / **3 failed** / 10 skipped — core-flow-spine L231 × 3 engines |
| **Honest phase gate (final)** | `npm run test` (one invocation, fresh :5173 server) | **exit 0** — unit 1344/0/13 (92 files + 2 skipped) + e2e 1326/0/10 (11.5m incl. throttled perf) |

## Threat Surface

No new surface beyond the plan's threat model. T-17-11 (gate honesty) mitigated exactly as planned: one-invocation full-suite gate, exact printed counts, first-RED-recorded-then-fixed, no subsets/greps/engine skips. T-17-SC held — zero packages installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 17 is COMPLETE: all four ROADMAP success criteria carry browser proofs — SC1 edit-without-identity-change (17-02 cells + row truth), SC2 one-name-everywhere (this plan's cross-surface describe), SC3 clear-to-canonical incl. absent author (17-02 cells, green in the gate), SC4 migrate/round-trip/conflicts/cascade (Tasks 1-2)
- META-01..04 all closed in REQUIREMENTS.md; ready for Phase 18 (reader TOC / orientation)
- Blockers: none. The pre-existing zipSlip.ts lint debt (Phase 09, tracked in deferred-items.md) remains out of scope and does not affect the test gate.

## Self-Check: PASSED

All 5 modified spec files exist on disk; all four task commits (83d8f99, cf0e5d8, f953c73, c84c7e1) verified in git log; working tree clean; every task acceptance criterion and the plan-level verification gates recorded above with honest results.

---
*Phase: 17-reader-owned-metadata*
*Completed: 2026-08-30*
