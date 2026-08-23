---
phase: 13-polish-and-acceptance
plan: 05
subsystem: testing
tags: [acceptance, nvda, voiceover, screen-reader, fake-timers, vitest, pdf-timeout, instrument]

# Dependency graph
requires:
  - phase: 06-prototype-acceptance
    provides: docs/ACCEPTANCE-PROTOCOL.md v1.0 (the instrument, D6-05/06/07/08) + the 06-VERIFICATION ledger shape + the A4 NVDA coverage boundary this closes
  - phase: 11-pdf-intake
    provides: withPdfDocument timeout race (server/pdfToBlocks.ts L620-656, wired but unproven) + PDF_EXTRACTION_TIMEOUT_MS (server/limits.ts)
provides:
  - "13-VERIFICATION.md — the ACPT-05 acceptance instrument: user-runnable NVDA+Firefox runbook, empty findings record sheets, six-flow + five-charter checklist, D13-07 flip condition, VoiceOver+Safari v2.0 supplementary checklist (NOT an ACPT-05 gate)"
  - "tests/unit/server/pdfTimeout.spec.ts — the D13-11 fake-timers proof of the 30s extraction-timeout firing path (typed server-error rejection + always-destroy finally + control race), closing the 11-VERIFICATION § Acknowledged Gaps item with zero production changes"
affects: [ACPT-05 user run (requirement closes at proof), 13-06 phase OUTPUT + honest full-suite gate, 11-VERIFICATION acknowledged-gaps ledger]

# Tech tracking
tech-stack:
  added: []  # zero installs (T-13-SC)
  patterns:
    - "Timeout-race testing with fake timers: mock only the unpdf document loader, flush its microtask with advanceTimersByTimeAsync(0) so the race timer installs at fake-time 0, then advance past PDF_EXTRACTION_TIMEOUT_MS + 1"
    - "Immediate-handler outcome capture (p.then(onOk, onErr) attached before timer advancement) so race rejections are never unhandled between timer fire and assertion"
    - "Instrument-ships-now / requirement-closes-at-proof ledger: runbook + empty record sheets record their own flip condition in-file (D13-07, 04-02/06-04 precedent)"

key-files:
  created:
    - .planning/phases/13-polish-and-acceptance/13-VERIFICATION.md
    - tests/unit/server/pdfTimeout.spec.ts
  modified: []

key-decisions:
  - "ACPT-05 ships as instrument only — REQUIREMENTS.md checkbox stays unchecked; the ledger itself states the flip condition (user-run results land with zero blocker/major; fix-then-re-run per D13-06 for blocker/major; minors recorded + deferred)"
  - "PDF_EXTRACTION_TIMEOUT_MS imported from server/limits.ts (its definition site, L90 — pdfToBlocks itself imports it from ./limits); the plan's read_first pointer to src/ingestion/types.ts was a documentation misdirection, corrected by grep before writing the spec (the acceptance criterion — import the constant, never hard-code 30000 — is satisfied against the true source)"
  - "Gap-closure TDD shape: the spec passes against the already-wired race on first run by design — there is no GREEN implementation to write because the closure terms mandate ZERO production changes; the test's job is coverage, not behavior change"

patterns-established:
  - "Fake-timers race verification three-case shape: firing path (typed rejection + exact copy), always-destroy on the rejection path, and a control case proving the race wiring resolves promptly-settling operations"

requirements-completed: []  # ACPT-05 intentionally NOT flipped — requirement closes at proof (D13-07 prohibition #3)

# Metrics
duration: 3 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 05: ACPT-05 Instrument + D13-11 Timeout Proof Summary

**ACPT-05 acceptance instrument prepared (NVDA+Firefox runbook + empty findings sheets + VO v2.0 supplementary checklist, protocol byte-unchanged) and the Phase 11 acknowledged 30s PDF-timeout gap closed by a 3-case fake-timers spec with zero production changes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-19T02:19:56Z
- **Completed:** 2026-08-19T02:22:52Z
- **Tasks:** 2
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments
- `13-VERIFICATION.md` ships the user-runnable ACPT-05 instrument: environment prerequisites (NVDA current stable + Firefox on Windows), run instructions pointing at `docs/ACCEPTANCE-PROTOCOL.md` **as-documented** (six v1.0 scripted flows A–F + five exploratory charters 1–5, executed in order), the D6-07 severity rubric with the zero-blocker/major pass policy and the confusing-but-completable = minor boundary rule, an empty findings record sheet in the 06-VERIFICATION shape (finding id / flow-charter / severity / observed role+name outcome / expected outcome / status), and the per-flow pass/fail checklist for all eleven rows
- The D13-07 flip condition is recorded reader-verifiably in the ledger: ACPT-05 remains Pending and flips only when user-run results land in the file with zero blocker/major (fix-then-re-run per D13-06; minors deferred); `docs/ACCEPTANCE-PROTOCOL.md` stays byte-unchanged (verified: `git diff --stat` empty)
- The VoiceOver+Safari supplementary checklist covers the five NEW v2.0 surface groups (library browse/search/tag filter; ingest form incl. calm refusals; review panel jump/curate; export/import dialogs; book groupings + chapter navigation), explicitly marked NOT an ACPT-05 gate (D13-05), with its own empty findings sheet
- The Phase 11 acknowledged gap (D13-11) is closed: `pdfTimeout.spec.ts` proves the `withPdfDocument` 30s race firing path — typed `IngestionError` reason `server-error` with the exact em-dash copy, `loadingTask.destroy` on the timeout path, and the control race case — 3/3 green, zero production changes (git status clean under `server/` and `src/`)

## Task Commits

Each task was committed atomically:

1. **Task 1: 13-VERIFICATION.md — NVDA runbook + record sheet + VO supplementary checklist** — `2f5a139` (docs)
2. **Task 2: D13-11 — withPdfDocument 30s timeout fake-timers spec** — `e78ddd9` (test)

_TDD note: Task 2 is a coverage-gap closure whose closure terms forbid production changes — the spec passes against the already-wired race on first run (there is no GREEN implementation to write). RED/GREEN commits therefore do not apply; the plan frontmatter is `type: execute`, not `type: tdd`._

## Files Created/Modified
- `.planning/phases/13-polish-and-acceptance/13-VERIFICATION.md` — the ACPT-05 instrument: runbook, findings sheets, per-flow checklist, D13-07 flip condition, VO v2.0 supplementary checklist
- `tests/unit/server/pdfTimeout.spec.ts` — 3-case fake-timers spec over the mocked unpdf loader: firing path / always-destroy / control

## Decisions Made
- **ACPT-05 stays Pending** (requirements-completed is `[]`): the instrument-ships-now / requirement-closes-at-proof split (D13-07, the 04-02/06-04 precedent) — `requirements.mark-complete` deliberately NOT run for ACPT-05.
- **Import site for the timeout constant:** `server/limits.ts` is the definition site (L90); the plan's read_first pointing at `src/ingestion/types.ts` was corrected by grep before writing the spec (types.ts mentions the constant only in a comment). The no-magic-number criterion is satisfied against the true source.
- **Immediate-handler outcome capture in the spec:** both promise handlers attach before timer advancement so the race rejection is never unhandled between the fake-timer fire and the assertion — keeps the suite free of spurious unhandled-rejection noise.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification Results
- `test -f .planning/phases/13-polish-and-acceptance/13-VERIFICATION.md && grep -c "NVDA" …` → file exists, 6 NVDA references
- `git diff --stat docs/ACCEPTANCE-PROTOCOL.md | wc -l` → `0` (byte-unchanged; `git status` clean on the file)
- Findings tables present with severity columns (2); per-flow checklist rows 11/11 (6 flows + 5 charters); flip-condition note present; five v2.0 surface groups named; "NOT an ACPT-05 gate" present; "role" + "accessible name" present in the instructions; verbatim-SR-phrasing examples: 0 matches
- `npx vitest run tests/unit/server/pdfTimeout.spec.ts` → 3/3 passed, exit 0
- `npx vitest run tests/unit/server/` (regression) → 309 passed / 0 failed / 13 intentional skips
- `npx tsc --noEmit` → clean
- Zero production changes: `git status --short server/ src/` → empty
- Prohibition: REQUIREMENTS.md ACPT-05 checkbox remains `- [ ]` (untouched by this plan)

## User Setup Required
None — no external service configuration required. (The NVDA+Firefox run itself is a scheduled user activity on Windows hardware, not setup: the runbook lives in 13-VERIFICATION.md §1.)

## Next Phase Readiness
- The ACPT-05 instrument is ready for the user's NVDA+Firefox run (Windows hardware, own schedule — D13-07); results land in 13-VERIFICATION.md §1.3/§1.4, and the flip condition is recorded in-file
- The VoiceOver+Safari v2.0 supplementary checklist is ready for the user's macOS run when convenient (not an ACPT-05 gate)
- The 11-VERIFICATION § Acknowledged Gaps item is fulfilled by test alone; 13-06 (ACPT-06 spine + honest full-suite gate) can proceed with the timeout path now covered
- No blockers

## Self-Check: PASSED

Both key files exist on disk; both task commits (2f5a139, e78ddd9) present in git log.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
