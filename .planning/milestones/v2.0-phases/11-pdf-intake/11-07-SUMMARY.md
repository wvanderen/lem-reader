---
phase: 11-pdf-intake
plan: "07"
subsystem: intake
tags: [pdf, ingestion, isReaderable, unpdf, tdd, e2e]

# Dependency graph
requires:
  - phase: 11-pdf-intake
    provides: "11-01 synthetic PDF fixture corpus (synthetic-outline.pdf), 11-02/03 pdfToBlocks adapter + fourth ingest branch, 11-05 browser-level pdf-intake e2e harness, 11-06 calibration evidence + PDF_THRESHOLDS replay pin"
provides:
  - "Relaxed isReaderable admission algebra in pdfToBlocks — sparse structured documents (zero text-bearing pages, zero near-empty pages) admit through ingest() and the browser"
  - "Three-level regression coverage for the outline fixture (adapter isReaderable, full-pipeline ingest, browser upload) — the coverage gap that let the bug ship is closed"
  - "Middle-band admission guard test — the relaxation's boundary is pinned (minority near-empty + zero text-bearing ⇒ still refused)"
affects: [pdf-intake, verification, any future PDF threshold or admission work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admission algebra as disjunction: blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0) — the scanned majority gate already refuses scanned docs BEFORE assembly, so the text-bearing conjunct was a double-guard"
    - "RED proves the tests bite: new admission tests fail against the shipped formula while the middle-band guard + all pre-existing cells pass — the guard must hold under BOTH old and new formulas"

key-files:
  created: []
  modified:
    - server/pdfToBlocks.ts
    - tests/unit/server/pdf-to-blocks.spec.ts
    - tests/unit/server/ingest-pdf.spec.ts
    - tests/e2e/pdf-intake.spec.ts
    - tests/unit/server/pdf-calibration/derive.spec.ts

key-decisions:
  - "Relax Option A (nearEmptyPages === 0 disjunct arm) over lowering scannedItemFloor — the floor is corpus-calibrated (11-06 evidence snapshot) and also the multiColumn denominator; re-tuning would require the derive harness"
  - "Middle-band guard probe geometry: 2 pages × 4 widely-spaced short lines (≥15 non-ws chars, 64pt gap over 16pt modal delta) + 1 single-line near-empty page — 5 blocks, textBearingPages=0, nearEmptyPages=1 ⇒ refuses under both formulas"
  - "Filename 'outline-notes.pdf' is load-bearing in both the ingest and e2e tests — 'outline notes' fuzzy-matches neither heading, so both h2 headings surviving D11-09 consume is part of the proof"

patterns-established:
  - "Filename discipline in doubled-title-sensitive tests: pick filenames whose normalized form matches NO heading in either containment direction, so heading survival is itself evidence"

requirements-completed: ["ING-04"]

# Metrics
duration: 6 min
completed: 2026-08-17
status: complete
---

# Phase 11 Plan 07: Outline PDF isReaderable Gap Closure Summary

**One-expression isReaderable relaxation (textBearingPages >= 1 OR nearEmptyPages === 0) admits the sparse outline fixture at adapter, ingest, and browser levels while scanned/multi-column/middle-band refusals and the 11-06 calibration pin stay provably intact.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-17T20:35:25Z
- **Completed:** 2026-08-17T20:42:10Z
- **Tasks:** 3 (TDD: RED → GREEN → e2e)
- **Files modified:** 5

## Accomplishments

- Closed the Phase-11 UAT Test 2 gap (severity major): synthetic-outline.pdf now admits through the full pipeline with both outline-coerced h2 headings ("Outlined Document", "Second Section") surviving D11-09 consume — previously false-refused `extraction-unsupported` → "Couldn't reliably read this page."
- Locked the fix with the three levels of regression coverage whose absence let the bug ship: adapter-level `isReaderable` assertion, full-pipeline `ingest()` outline-fixture case, and browser-level upload e2e across chromium/firefox/webkit.
- Pinned the relaxation's boundary: a middle-band document (minority near-empty pages + zero text-bearing pages) assembles ≥3 blocks yet keeps `isReaderable` false — the guard test passed in RED (old formula) and stays green in GREEN (new formula).
- Threat register discharged: T-11-16 (garbage admission) — blocks floor + every-page-non-near-empty requirement + guard test; T-11-17 (silently loosened detection) — PDF_THRESHOLDS byte-untouched, replay.spec pin green, scanned/multi-column refusals re-proven at all three levels.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — adapter isReaderable + full-pipeline ingest regression tests** — `2989397` (test)
2. **Task 2: GREEN — relax the isReaderable conjunct (thresholds byte-untouched)** — `6f8c655` (fix)
3. **Task 3: e2e outline admission + full phase-11 regression sweep** — `e1026bb` (test)

**Plan metadata:** (recorded below after state updates)

## TDD Gate Compliance

- **RED** (`2989397`): exit 1 with ONLY the two new outline-admission tests failing — `pdf-to-blocks.spec.ts > synthetic-outline.pdf resolves…` at `expect(result.isReaderable).toBe(true)` (isReaderable was false); `ingest-pdf.spec.ts > admits synthetic-outline.pdf…` at `expect(response.ok).toBe(true)` (refusal `extraction-unsupported`). The middle-band guard and all 55 pre-existing cells passed — proving the tests bite and the harness is not broken.
- **GREEN** (`6f8c655`): the three-suite verify (adapter + ingest + calibration replay) 60/60 green; `npx tsc --noEmit` exit 0.
- **REFACTOR:** not needed — one expression + comment; no cleanup warranted.

## Verification Evidence (honest counts, executor-run)

- `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts tests/unit/server/ingest-pdf.spec.ts` — RED phase: 2 failed / 55 passed (expected signal); after GREEN: 59 passed / 0 failed.
- `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts tests/unit/server/ingest-pdf.spec.ts tests/unit/server/pdf-calibration/replay.spec.ts` — 60 passed / 0 failed / exit 0 (replay PDF_THRESHOLDS pin green).
- `npx tsc --noEmit` — exit 0.
- `npx playwright test pdf-intake` — 24 passed / 0 failed / exit 0 (chromium + firefox + webkit: new outline admission + SC#1 happy path + scanned/two-column/corrupt refusals + dedupe + annotate/restore).

## Files Created/Modified

- `server/pdfToBlocks.ts` — the relaxed `isReaderable` expression + explanatory admission-algebra comment (the only production change; 1353 lines ≥ 1335 artifact floor)
- `tests/unit/server/pdf-to-blocks.spec.ts` — outline-fixture `isReaderable`/h2 assertions + multi-page middle-band admission guard (543 lines ≥ 500)
- `tests/unit/server/ingest-pdf.spec.ts` — outline-fixture full-pipeline admission describe (406 lines ≥ 390)
- `tests/e2e/pdf-intake.spec.ts` — OUTLINE_PDF const + outline-admission upload test (470 lines ≥ 445)
- `tests/unit/server/pdf-calibration/derive.spec.ts` — Rule 3 fix: dropped unused `readFileSync` import (pre-existing TS6133)

## Decisions Made

- **Option A (disjunct arm) over Option B (lower scannedItemFloor)** per the plan + UAT missing-list: the floor is corpus-calibrated and doubles as the multiColumn denominator; the 11-06 replay pin would force a re-derive. The comment block encodes the review argument.
- **Middle-band probe built via `serializePdf` directly** with an array of `buildContentStream` pages (tinyPdf is single-page only; no forked serializer) — 4-line pages at y=740/724/708/644 give modal line delta 16 with the 64pt gap splitting blocks, so 5 blocks assemble while both refusal counters stay refusal-shaped.
- **Both headings expected visible on the first page fragment** in the e2e (the fixture's 5-block body fits one fragment at default typography) — confirmed empirically on all three engines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dropped unused `readFileSync` import in pdf-calibration/derive.spec.ts**
- **Found during:** Task 2 (GREEN — `npx tsc --noEmit` acceptance gate)
- **Issue:** `tests/unit/server/pdf-calibration/derive.spec.ts:13` imported `readFileSync` but never used it (TS6133). Pre-existing since 11-06 commit `887e3b1`; not caused by this plan's changes, but it made the plan's mandatory `tsc --noEmit` gate exit non-zero.
- **Fix:** Reduced the import to `import { existsSync } from "node:fs"` — the only symbol the file uses; zero runtime-behavior change.
- **Files modified:** tests/unit/server/pdf-calibration/derive.spec.ts
- **Verification:** `npx tsc --noEmit` exits 0; the calibration replay suite (which shares the harness) stays green.
- **Committed in:** `6f8c655` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal and surgical — a one-word import fix required to satisfy the plan's own type-check gate. No scope creep; the production change remains exactly one expression + comment.

## Issues Encountered

None beyond the deviation above. The RED phase failed for exactly the predicted reasons at the predicted assertions, and GREEN landed on the first implementation attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 11's UAT gap (Test 2) is closed at all three levels; the remaining phase-11 surface (scanned/two-column/corrupt refusals, dedupe, annotate/restore, calibration replay) re-proven green after the fix.
- 11-UAT.md Test 2 can be re-run by the user for the manual confirmation (upload tests/fixtures/pdf/synthetic-outline.pdf → structured h2 headings); the e2e now automates the identical flow.
- No blockers. The `.planning/debug/synthetic-outline-pdf-refusal.md` diagnosis file remains untracked by design (per gap-context instruction).

## Self-Check: PASSED

All 5 key-files exist on disk; all 3 task commits (2989397, 6f8c655, e1026bb) verified in git history. Plan-level verification commands re-run green: adapter+ingest+replay suites 60/60, tsc --noEmit exit 0, playwright pdf-intake 24/24 across chromium/firefox/webkit.

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-17*
