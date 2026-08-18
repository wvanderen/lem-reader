---
phase: 12-epub-intake
plan: 08
subsystem: testing
tags: [epub, calibration, epub-calibration, evidence-replay, structural-gates, fast-xml-parser, playwright]

# Dependency graph
requires:
  - phase: 12-epub-intake (12-02)
    provides: server/epubToBooks.ts — EPUB_THRESHOLDS + the adapter the derive drives
  - phase: 12-epub-intake (12-04)
    provides: the orchestrator's fifth Stage-1 branch (ingest({epub}) book envelope)
  - phase: 11-pdf-intake (11-06)
    provides: the pdf-calibration layout mirrored file-for-file (manifest/evidence/derive/replay discipline)
provides:
  - tests/unit/server/epub-calibration/ — the D12-12 calibration instrument (harness + committed manifest + derived evidence + always-on replay)
  - Committed replay-pinned EPUB_THRESHOLDS evidence (T-12-20 pin; re-tuning requires re-derivation)
  - SC#4 structural proofs — no vendor renderer anywhere; fast-xml-parser absent from the client bundle
  - The phase's honest full-suite record (12-08-OUTPUT.md) the verify-work step consumes
  - corpus/epub/ local-only convention + docs/epub-calibration.md workflow contract
affects: [epub-intake, verify-work, future-parser-changes]

# Tech tracking
tech-stack:
  added: [] # no new dependencies — the harness is repo-native (zod + node:crypto + vitest)
  patterns:
    - "Calibration discipline mirror: manifest SHA-256 + committed evidence + env-gated local derive + always-on CI replay with loud-missing-record failure (the D11-04/05/06 mirror, EPUB edition)"
    - "Derivation-basis-in-manifest: every expectedChapters carries its TOC-inspection basis; gap records are first-class manifest fields"

key-files:
  created:
    - tests/unit/server/epub-calibration/harness.ts
    - tests/unit/server/epub-calibration/harness.test.ts
    - tests/unit/server/epub-calibration/derive.spec.ts
    - tests/unit/server/epub-calibration/replay.spec.ts
    - tests/unit/server/epub-calibration/manifest.json
    - tests/unit/server/epub-calibration/epub-evidence.json
    - corpus/epub/README.md
    - docs/epub-calibration.md
    - .planning/phases/12-epub-intake/12-08-OUTPUT.md
  modified:
    - server/epubToBooks.ts
    - package.json
    - .gitignore
    - tests/e2e/progress.spec.ts
    - .planning/phases/12-epub-intake/12-VALIDATION.md

key-decisions:
  - "DTD guard calibrated to the threat: refuse only DOCTYPEs whose internal subset declares <!ENTITY (the billion-laughs shape / entityBombOpf fixture); the EPUB 3.3 spec's own <!DOCTYPE html> nav template is tolerated"
  - "Anchor-gate ambiguous skips are honest D12-11 disclosures, not bugs: identical unsupported-block fallback descriptions (accessible_epub_3 front matter) and genuinely repeated opening text (minimal's Lorem Ipsum) both resolve 'ambiguous' at the offset-0 sample — expected counts encode post-stage admissions (5 and 1)"
  - "minimal-v2 dropped from the corpus with a manifest gap record: the 1.9KB packaging template legitimately fails the D12-10 floor (epub-empty); consequence recorded as the ncx_primary_toc gap (synthetic ncxOnlyBook suite covers the path)"
  - "calibrate:epub bakes 8GB heap headroom; the default-heap OOM on whole-novel chapters (anchor-gate allocation churn) + the unbounded per-chapter stage loop logged to deferred-items.md, not fixed here"

patterns-established:
  - "Pattern: expect.poll over observable end conditions replaces fixed sleeps in e2e load-race cells (the 09-07 class, firefox progress edition)"

requirements-completed: ["ING-05"]

# Metrics
duration: 110 min active (232 min wall incl. Task-2 corpus checkpoint wait)
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 08: EPUB Calibration + SC#4 Gates + Honest Phase Gate Summary

**D12-12 closed on 7 real books: committed SHA-256 manifest + derived evidence replay-pinned in CI (7/7 admitted at TOC-derived chapter counts, zero fallback fires, anchors round-trip), one corpus-proven Rule 1 DTD-guard fix, SC#4 structural greps green, full npm run test exit 0 recorded honestly (2162 passed).**

## Performance

- **Duration:** 110 min active (17:36–17:38Z + 19:40–21:28Z; 232 min wall — the span includes the Task-2 blocking-human corpus checkpoint)
- **Started:** 2026-08-18T17:36:18Z
- **Completed:** 2026-08-18T21:28:37Z
- **Tasks:** 3 (Task 2 = blocking human-verify corpus gate, resumed 2026-08-18)
- **Files modified:** 13

## Accomplishments

- **The calibration instrument** (Task 1): the 11-06 pdf-calibration mirror — harness core with all six exports + loud-missing-record loader, 28 in-memory bar tests (each D12-12 clause independently provable), env-gated derive driver, gitignored corpus dir, docs workflow contract, `calibrate:epub` script.
- **The real corpus behind a blocking gate** (Task 2): 8 human-supplied books → 7 admitted to the manifest with per-book derivation bases (expected counts derived by inspecting each book's real nav/NCX TOC: 5/5/38/6/1/13/6) + 2 honest gap records (single_entry_toc verbatim; the minimal-v2 packaging template + its ncx_primary_toc consequence).
- **Committed, replay-pinned evidence** (Task 3): `npm run calibrate:epub` over the real `ingest({epub})` path → epub-evidence.json (7/7 admitted, fallbackUsed false on every resolvable TOC, anchorRoundTrip true everywhere, EPUB_THRESHOLDS snapshot); the always-on replay validates the bar + pins thresholds deep-equal (T-12-20) inside plain `npm run test`.
- **One corpus-proven production fix**: the blanket DOCTYPE refusal rejected the EPUB 3.3 spec's own `<!DOCTYPE html>` nav template — accessible_epub_3 fell back to one-chapter-per-spine-doc (the Pitfall 1 warning sign). The guard now refuses exactly the threat (internal-subset `<!ENTITY` declarations); synthetic suites re-proven green.
- **SC#4 structural gates**: renderer package-name token zero matches across src/, server/, package.json (and functions/, dev-server/); `npm run build` → fast-xml-parser (and jsdom/unpdf/pdfjs) absent from every dist/assets file.
- **The honest phase gate**: three full-suite invocations recorded in 12-08-OUTPUT.md — run 1 exit 1 (firefox progress load race → fixed), run 2 exit 1 (4 webkit dev-server goto races under load, green in isolation + run 3), **run 3 exit 0: unit 1162/0/13 + e2e 1000/0/6 = 2162 passed / 0 failed / 19 skipped**. 12-VALIDATION.md filled (14-row per-task map green, Wave 0 checked, nyquist sign-off).

## Task Commits

Each task was committed atomically:

1. **Task 1: Calibration harness core + wiring + docs** — `4e2ecbf` (test)
2. **Task 2: Supply the local real-EPUB corpus** — blocking human-verify gate (no code; corpus placed locally, gitignored)
3. **Task 3: Derive + commit evidence + SC#4 gates + honest full-suite gate** — `131621f` (fix, Rule 1 pre-derivation), `8ba6b26` (test, evidence bundle), `e66cdde` (fix, Rule 3 race), `3f43082` (test, OUTPUT + VALIDATION)

**Plan metadata:** (below)

## Files Created/Modified

- `tests/unit/server/epub-calibration/harness.ts` — loadManifest/verifyCorpus/validateEvidence/deriveEvidence/writeEvidence + loadCommittedEvidence; manifest schema with basis/gaps; the D12-12 bar
- `tests/unit/server/epub-calibration/harness.test.ts` — 28 in-memory mechanics tests incl. the temp-rename loud-message branch
- `tests/unit/server/epub-calibration/derive.spec.ts` — env-gated local derive driver (EPUB_CALIBRATION_DERIVE=1)
- `tests/unit/server/epub-calibration/replay.spec.ts` — always-on CI replay: loud-missing branch, bar validation, thresholds pin
- `tests/unit/server/epub-calibration/manifest.json` — 7 books, SHA-256s, derivation bases, 2 gap records
- `tests/unit/server/epub-calibration/epub-evidence.json` — the derived record CI replays
- `corpus/epub/README.md` + `.gitignore` — the local-only corpus convention (D12-12)
- `docs/epub-calibration.md` — derive + replay workflow, promotion bar, CI-absence contract
- `server/epubToBooks.ts` — the DTD-guard calibration fix (Rule 1)
- `package.json` — calibrate:epub (8GB heap headroom)
- `tests/e2e/progress.spec.ts` — the firefox load-race poll fix (Rule 3)
- `.planning/phases/12-epub-intake/12-08-OUTPUT.md` — the honest full-suite permanent record
- `.planning/phases/12-epub-intake/12-VALIDATION.md` — filled per-task map, all green
- `.planning/phases/12-epub-intake/deferred-items.md` — 3 out-of-scope findings (allocation churn, unbounded stage loop, synthetic-description ambiguity)

## Decisions Made

- **DTD guard refuses entity-declaring subsets only** (Rule 1, corpus-proven): the threat (T-12-04) is the `<!ENTITY` internal subset — exactly the entityBombOpf fixture shape — so `declaresEntities()` matches that; bare/external-only DOCTYPEs are inert under processEntities:false. Synthetic pin `expect(EPUB_THRESHOLDS.minChapterBlocks).toBe(3)` and all 54 synthetic adapter/orchestrator tests stayed green; NO threshold values changed (the shipped EPUB_THRESHOLDS met the bar as-is after the DTD fix).
- **Anchor-gate skips are honest, expected counts encode them**: accessible_epub_3's front matter (two identical figure-fallback descriptions at offset 0) and minimal.epub's Lorem-repetitive Chapter 1 both resolve `ambiguous` at the offset-0 sample (no prefix exists at position 0) — ANNO-07 working as designed; D12-11 discloses the skips. The manifest bases document this per-book.
- **minimal-v2 excluded with a gap record** rather than pinned as a false refusal: a 1908-byte "Your title here" packaging template is not a real publication; lowering minChapterBlocks to admit it would loosen the synthetic-pinned floor.
- **The default-heap OOM is recorded, not silently patched**: whole-novel chapters (3290 blocks) push ingest's per-chapter stages through multi-GB transient allocation; calibrate:epub gets documented heap headroom and the substrate optimization is deferred with a precise diagnosis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Blanket DTD refusal false-refused the spec's own nav template**
- **Found during:** Task 3 (corpus derive — accessible_epub_3 fired fallbackUsed=true on a fully navigable book)
- **Issue:** `containsDtd` rejected ANY `<!DOCTYPE`, including the EPUB 3.3 spec's own `<!DOCTYPE html>` nav template → resolveNavToc failed → the one-chapter-per-spine-doc fallback fired (the Pitfall 1 warning sign the plan says calibration exists to catch)
- **Fix:** `declaresEntities()` — refuse only DOCTYPEs whose internal subset declares `<!ENTITY` (the billion-laughs threat); applied to parseEpubXml + tryParseEpubXml
- **Files modified:** server/epubToBooks.ts
- **Verification:** synthetic suites 54/54 green (entityBombOpf still refuses); real re-derive 6 adapter chapters / 0 skipped / fallback=false → 5 admitted after the honest anchor-gate skip
- **Committed in:** 131621f

**2. [Rule 3 - Blocking] firefox progress-hairline load race failed the honest gate**
- **Found during:** Task 3 (full-suite run 1: exit 1)
- **Issue:** the READ-05 bottom-scroll cell slept a fixed 300ms then read the transform — under full-suite load firefox's rAF-throttled scroll handler + debounced detect missed the window (scaleX 0.25 vs ≥0.9; green in isolation)
- **Fix:** `expect.poll` over the same observable end condition (5s budget) — assertion unchanged
- **Files modified:** tests/e2e/progress.spec.ts
- **Verification:** spec green on all engines; full-suite run 3 exit 0
- **Committed in:** e66cdde

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary — the first is the corpus doing its declared job (proving the novel logics against real publisher output); the second unblocked the plan's own honest-gate criterion. No scope creep.

## Issues Encountered

- Full-suite run 2 (post-race-fix) exited 1 with 4 webkit dev-server `page.goto` navigation timeouts under machine load (minutes after the 8GB derive); all 4 cells green in isolation and in run 3 — environment load race, recorded honestly in 12-08-OUTPUT.md, no code change made.
- The first derive attempt OOM'd at the default ~4GB heap (whole-novel anchor-gate churn); diagnosis + deferral recorded (deferred-items.md #1), script headroom added — see Decisions.

## User Setup Required

None beyond the local corpus (already supplied at `corpus/epub/`, gitignored per D12-12).

## Next Phase Readiness

- Phase 12 (EPUB Intake) complete: all 8 plans have summaries; ING-05 closes with replay-pinned calibration evidence; the honest full-suite record (12-08-OUTPUT.md) is ready for `/gsd-verify-work 12`.
- Deferred (deferred-items.md, non-blocking): anchor-gate allocation churn on whole-novel chapters; unbounded per-chapter stage loop outside withEpubTimeout; reader-manufactured anchor ambiguity from identical unsupported-block fallback descriptions.

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 11 created/modified files exist on disk; all 6 task/metadata commits (`4e2ecbf`, `131621f`, `8ba6b26`, `e66cdde`, `3f43082`, `065538f`) verified in git log; working tree clean at check time.
