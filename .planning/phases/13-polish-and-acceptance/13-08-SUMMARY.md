---
phase: 13-polish-and-acceptance
plan: 08
subsystem: ui
tags: [react, file-input, upload-queue, e2e, playwright, gap-closure]

# Dependency graph
requires:
  - phase: 08-04
    provides: the hasFile mirror + fileInputRef upload form in IngestControl
  - phase: 09-05
    provides: the import-input reset discipline (value cleared on refusals AND terminal outcomes)
  - phase: 12-05
    provides: the epub-intake e2e harness conventions (uploadEpub shape, ingestStatus locator, fixtures)
provides:
  - resetFilePick single reset seam wired to every terminal outcome of handleFileSubmit
  - Remove file affordance on the intake upload form (type=button, disabled in flight)
  - tests/e2e/library/upload-queue.spec.ts — the G2 user-bar contract (3 tests × 3 engines)
affects: [13-VERIFICATION, ingest-control, library-upload-flows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Terminal-outcome picker reset — one helper (imperative input.value=\"\" + setHasFile(false)) called at every exit of the submit handler; guards stay byte-identical, resets append after the refusal copy"
    - "Behavioral hook class (ingest-remove-file) riding existing cross-surface quiet-button tokens — zero CSS additions"

key-files:
  created:
    - tests/e2e/library/upload-queue.spec.ts
  modified:
    - src/ingestion/IngestControl.tsx

key-decisions:
  - "resetFilePick is the single reset seam — one helper, every caller (Remove onClick + 8 terminal exits); no scattered clears"
  - "Remove file button reuses .article-export-highlights quiet-button tokens + ingest-remove-file hook class; type=button so a remove action can never submit the form; disabled while submitting"
  - "Single-article success path also resets (before hash navigation) for contract uniformity — harmless on the unmounting control"

patterns-established:
  - "Terminal-outcome reset discipline: same-file retry must never be a silent no-op on ANY intake exit (cap refusals, dedupe refusals, both success paths, catch)"
  - "e2e refusal-recycle proof: the second submit cycle is pinned non-vacuously by asserting the transient 'Reading file…' submitting copy between the first and second refusal copies"

requirements-completed: [ING-03]

# Metrics
duration: 6 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 08: Upload-queue reset + Remove file (G2) Summary

**Intake file picker resets at every terminal outcome and gains a Remove file control — the 09-05 import-input reset discipline applied to the upload queue, pinned by a 3-engine e2e contract**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-19T21:06:55Z
- **Completed:** 2026-08-19T21:12:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- G2 closed at the user bar: a queued pick is removable pre-submit (Remove file), a completed book upload leaves the picker empty + Add file disabled with NO page refresh (the exact user-reported path), and every refusal clears the pick so same-file retry re-fires the picker
- resetFilePick called at all 8 terminal outcomes of handleFileSubmit (3 over-cap early returns, book + article dedupe refusals, EPUB success, single-article success, catch) — cap/dedupe logic byte-unchanged, resets appended after the calm copy only
- New e2e contract tests/e2e/library/upload-queue.spec.ts: 3 tests × chromium/firefox/webkit, reusing validBookEpub3/corruptNotEpub fixtures (REUSE-DO-NOT-FORK), zero fixed sleeps

## Task Commits

Each task was committed atomically:

1. **Task 1: resetFilePick helper + Remove file affordance + terminal-outcome resets in IngestControl (G2)** - `237038a` (fix)
2. **Task 2: upload-queue e2e spec — remove affordance, post-success reset, refusal reset + same-file retry** - `12db798` (test)

## Files Created/Modified
- `src/ingestion/IngestControl.tsx` - resetFilePick seam, Remove file button (article-export-highlights + ingest-remove-file, disabled in flight), resets on all 8 terminal exits, form comment records the discipline
- `tests/e2e/library/upload-queue.spec.ts` - G2 e2e contract: remove-before-upload, EPUB-success reset without refresh, refusal reset + same-file re-pick

## Decisions Made
- resetFilePick clears `fileInputRef.current.value` imperatively (null-guarded, the SettingsPanel pattern) then drops the hasFile mirror — one seam, no scattered clears
- Remove file reuses the existing cross-surface quiet-button class; the second class (`ingest-remove-file`) is the behavioral/test hook only — zero CSS additions, honoring the 13-03 Review-highlights reuse precedent
- The e2e refusal test proves the SECOND submit cycle non-vacuously: the transient "Reading file…" submitting copy is asserted between the first and second unreadable copies (the first copy lingers in the live region, so a bare re-assertion would be vacuous)
- Strengthen-only test additions beyond the plan text: Remove-control unmount remount assertions (`toHaveCount(0)` / `toBeVisible()`) and the post-second-refusal terminal-state re-checks — no plan assertion weakened or removed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Verification

- Task 1: `npx tsc --noEmit` exit 0; `npx vitest run tests/unit/pdf-copy.test.ts tests/unit/epub-copy.test.ts` 6/6 green (mapReasonToCopy byte-stable); `rg -c 'resetFilePick'` = 11 (≥ 8); task commit touches only src/ingestion/IngestControl.tsx
- Task 2: `npx playwright test tests/e2e/library/upload-queue.spec.ts tests/e2e/library/markdown-upload.spec.ts tests/e2e/pdf-intake.spec.ts` — 45/45 passed (incl. 9 new cells)
- Plan-level: `npx playwright test tests/e2e/library/ tests/e2e/epub-intake.spec.ts` — 126/126 passed; `npx vitest run` — 1200 passed / 0 failed (13 skips = documented intentional set)
- Prohibitions: `rg waitForTimeout tests/e2e/library/upload-queue.spec.ts` → 0 matches; `git diff --name-only` over the plan's commits touches no `.css` file

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- G2 closed; sibling gap-closure plans (13-01..13-07) remain the phase's outstanding work per ROADMAP order
- No intake cap/dedupe/refusal behavior weakened — only exits gained resets (regression suites prove it)

## Self-Check: PASSED

- Created file `tests/e2e/library/upload-queue.spec.ts` FOUND on disk
- Modified file `src/ingestion/IngestControl.tsx` FOUND on disk
- Task commits `237038a`, `12db798` FOUND in git log
- All task acceptance criteria re-run and passing (counts, greps, suites above)

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
