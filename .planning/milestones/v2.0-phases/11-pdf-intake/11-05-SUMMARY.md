---
phase: 11-pdf-intake
plan: 05
subsystem: testing
tags: [pdf, e2e, playwright, ingest, refusal, dedupe, annotation, location-restore]

# Dependency graph
requires:
  - phase: 11-pdf-intake (11-01)
    provides: committed synthetic PDF fixture corpus at tests/fixtures/pdf/ (five shapes)
  - phase: 11-pdf-intake (11-03)
    provides: the fourth Stage-1 branch + middleware body caps — the real /api/ingest pipeline the POST travels
  - phase: 11-pdf-intake (11-04)
    provides: the .pdf picker arm on input#ingest-file + ingestPdf client wrapper + mapReasonToCopy calm strings
  - phase: 05-annotations
    provides: the selection→toolbar→highlight capture helpers in tests/e2e/annotations/_fixtures.ts
  - phase: 02-settings-persistence
    provides: the STATE-01/STATE-03 save/restore machinery + persistence.spec.ts assertion shapes
provides:
  - tests/e2e/pdf-intake.spec.ts — the ING-04 browser-level proof: SC#1 upload→read happy path (pdf-<hash> id, D11-07 filename title, paginated surface, PDF badge), SC#2/SC#3/corrupt calm refusals with zero side effects, D7-07 dedupe, and the annotate + location-restore identity proofs — 21 cells green across chromium/firefox/webkit
affects: [11-pdf-intake (11-06 calibration gate — the last ING-04 leg)]

# Tech tracking
tech-stack:
  added: []  # test-only plan — no production code touched
  patterns:
    - "Refusal no-side-effect assertions compose TWO checks: total .library-list > li count stays at the bundled-fixture baseline AND zero rows carry a PDF source badge (the composite library always shows fixtures, so a literal 0-row total is impossible)"
    - "waitForOpenedArticle mirrors openArticle() minus the goto — upload navigation already landed on #/article/pdf-<id>; the surface/pagination/settle waits are identical"
    - "Location-restore identity proven through the scrolling-mode save/restore path (persistence.spec.ts tolerances verbatim) — the plan's sanctioned alternative; paginated page-index restore remains documented deferred option (b)"

key-files:
  created:
    - tests/e2e/pdf-intake.spec.ts
  modified: []

key-decisions:
  - "Refusal row-count assertion corrected to the shipped composite library: total rows === fixtures.length AND pdfBadgedRows === 0 (the plan's literal '.library-list > li count is 0' contradicts the fixtures+dexie union its own cited precedent asserts against — markdown-upload dedupe uses fixtures.length + 1)"
  - "Location restore asserted in scrolling mode (M-shortcut switchMode → scroll → debounce → reload → tolerance band), not paginated page turn: useScrollSave only fires on window scroll (no save on a paginated turn) and persistence.spec.ts L62-65 documents paginated page-index restore as deferred option (b) — the scrolling path IS the identical proven machinery"
  - "Helpers reused wholesale from annotations/_fixtures.ts (selectRangeInBlock, findFirstBlockWithText, switchMode, announcementRegion, wipeDatabase) — no forked selection/restore logic (Pitfall 2/6 discipline)"
  - "The happy path proves both title channels at once: no /Info title in the fixture → filename chain renders the h1 ('calm-report') while D11-09 consume correctly does NOT fire ('A Study of Calm Reading' ≠ 'calm-report'), leaving the body heading in place"

patterns-established:
  - "Binary-fixture e2e uploads: readFileSync the committed corpus at module scope, setInputFiles with {name, mimeType: 'application/pdf', buffer}"
  - "Identity proof shape for any new intake format: run the SAME annotate/persist/restore flows the existing articles run, reusing the shared e2e helpers — new-format articles must be indistinguishable at the reading surface"

requirements-completed: []  # ING-04 stays Pending until 11-06 ships the SC#4b calibration gate — the 04-02 PAGE-01 split precedent held by 11-01/02/03/04

# Metrics
duration: 8min
completed: 2026-08-16
status: complete
---

# Phase 11 Plan 05: PDF Intake E2E Suite Summary

**The full ING-04 browser proof in 21 green cells × chromium/firefox/webkit: PDF upload→normalized article that paginates/annotates/restores identically, three calm refusals with zero library side effects, and byte-identical dedupe — all through the real picker→middleware→orchestrator pipeline.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-16T23:19:05Z
- **Completed:** 2026-08-16T23:26:55Z
- **Tasks:** 2/2
- **Files modified:** 1 (1 created)

## Accomplishments

- **SC#1 open/read (Task 1)** — `calm-report.pdf` uploads through the real picker flow (`setInputFiles` + Add file), the POST travels the Vite dev middleware into the fourth Stage-1 branch, and navigation lands on `#/article/pdf-<shortHash>`. The provenance h1 shows `calm-report` (D11-07 filename channel — the fixture carries no `/Info /Title`), the body's first heading "A Study of Calm Reading" survives extraction (D11-09 consume correctly does not fire against the filename title), fixture paragraph text is visible, and `[data-block-index]` blocks mount on the standard paginated surface. The library row carries the quiet "PDF" badge.
- **Honest refusals (Task 1)** — scanned (`looks like scanned images`), multi-column (`multiple text columns`), and corrupt (`couldn't be opened`) fixtures each surface their byte-pinned calm copy in the `.status` live region while the URL stays `/#/`, the total row count stays at the bundled baseline, and zero PDF-badged rows appear (T-11-03/T-11-04/T-11-13 mitigations browser-proven).
- **D7-07 dedupe (Task 1)** — re-uploading identical bytes refuses with "Already in your library." and the row count stays at baseline + 1 (content-hash id collision; the has() check runs before save).
- **Annotate identity (Task 2)** — a highlight created via the real selection→toolbar→Highlight flow on the PDF article re-renders from Dexie after a full reload with the same `data-highlight-id` (persist-reload assertion shape).
- **Location-restore identity (Task 2)** — after the M-shortcut switch to scrolling mode, a 500px scroll survives the 1200ms debounce and reload restores the position within the persistence.spec.ts tolerance band (never top-of-article).
- **Verification** — `npx playwright test pdf-intake` → 21 passed / 0 failed across chromium/firefox/webkit, exit 0 (run three times: per-task + final plan-level gate); `npx tsc --noEmit` → exit 0; no direct API POSTs in the spec (picker flow only).

## Task Commits

Each task was committed atomically:

1. **Task 1: Upload→read happy path + refusal + dedupe flows** — `b840834` (test)
2. **Task 2: Annotate + location-restore identity** — `f976785` (test)

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `tests/e2e/pdf-intake.spec.ts` (420 lines) — the complete ING-04 e2e suite: shared upload helpers (`uploadPdf`, `uploadAndOpen`, `waitForOpenedArticle`), the five Task-1 flows, and the two Task-2 identity proofs; fixture bytes loaded via `node:fs` from the committed 11-01 corpus

## Decisions Made

- **Composite-library refusal assertions.** The plan's literal "`.library-list > li` count is 0" cannot hold: the library UNIONs the 6 bundled fixtures with Dexie rows (src/ingestion/LibrarySource.ts), which the plan's own cited precedent relies on (markdown-upload's dedupe test asserts `fixtures.length + 1`). Implemented as total-rows-stays-at-baseline AND zero-PDF-badged-rows — the honest encoding of T-11-13's "nothing entered" intent.
- **Scrolling-mode location restore.** The plan offered paginated page-turn OR scrolling scroll as the position-change mechanism. Chose scrolling: `useScrollSave` saves only on window scroll (a paginated turn fires no save), and persistence.spec.ts explicitly documents paginated page-index restore as deferred option (b). The scrolling path is the identical proven machinery — exactly what "restores identically to other articles" demands.
- **`waitForOpenedArticle` local helper** rather than extending `openArticle`: the annotations helper navigates by fixture id, but upload navigation already landed on the article URL; the waits (visible block → `__lemPagination` → 600ms settle) are mirrored verbatim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan/reality mismatch] Refusal row-count assertion corrected to the composite library**
- **Found during:** Task 1 (spec authoring, before first run)
- **Issue:** The plan's refusal actions specify "`.library-list > li` count is 0", but the shipped library composites the 6 bundled fixtures with Dexie rows — a zero total is structurally impossible post-wipe (baseline is `fixtures.length`).
- **Fix:** Every refusal asserts BOTH `toHaveCount(BASELINE_ROWS)` on the total AND `toHaveCount(0)` on rows filtered to a "PDF" source badge — a strictly stronger no-side-effect check than the literal reading.
- **Files modified:** tests/e2e/pdf-intake.spec.ts
- **Verification:** All refusal tests green on all three engines; dedupe test separately proves the counter CAN move (baseline + 1 after a successful save).
- **Committed in:** b840834 (Task 1)

---

**Total deviations:** 1 auto-fixed (1 plan/reality mismatch)
**Impact on plan:** Assertion-shape correction only — the T-11-13 intent (refusal + absence of side effects) is enforced more precisely than the plan's literal text. No scope creep; no production code touched.

## Issues Encountered

None beyond the auto-fixed deviation. The first full-suite run was green on all three engines with no flakes.

## Authentication Gates

None.

## Known Stubs

None. Every flow drives the real picker → client cap → base64 → middleware → orchestrator → adapter → Dexie → ArticleView pipeline; no API bypasses, no seeded shortcuts.

## Threat Flags

None beyond the plan's own threat model. All three registered mitigations are browser-proven in this suite: T-11-03 (multi-column refuses with copy + zero rows + no navigation), T-11-04 (exact calm substrings, no jargon at the live surface), T-11-13 (every refusal asserts copy AND no-side-effect state).

## User Setup Required

None.

## Next Phase Readiness

- **Ready for 11-06** (calibration harness — SC#4b): the browser leg of ING-04 is complete; only the calibration corpus/evidence gate remains before the requirement can close.
- The SSRF/runtime guardrails held: every POST ran through the Vite Node dev middleware on :5173 (the 07-06 RUNTIME_GUARDRAIL), exercised by Playwright's own webServer boot.
- Note for 11-06: this suite depends only on the committed synthetic corpus; the real-PDF calibration corpus stays local + gitignored per D11-04.

## Self-Check: PASSED

- tests/e2e/pdf-intake.spec.ts — FOUND (420 lines ≥ 200 min_lines)
- Commits b840834, f976785 — FOUND in git log
- Plan verification re-run green: `npx playwright test pdf-intake` → 21 passed / 0 failed (chromium/firefox/webkit), exit 0
- Acceptance greps: `waitForURL(/#\/article\/pdf-/)` ×2; all four calm-copy substrings asserted; zero direct API calls (only prose comments mention /api/ingest)

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-16*
