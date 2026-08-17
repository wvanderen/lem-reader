---
phase: 11-pdf-intake
plan: 06
subsystem: testing
tags: [pdf, calibration, unpdf, vitest, evidence-replay, thresholds]

requires:
  - phase: 11-pdf-intake (11-02/11-03/11-05)
    provides: pdfToBlocks + PDF_THRESHOLDS, the fourth-branch ingest orchestrator, pdf-intake e2e proofs
provides:
  - Importable calibration harness (manifest/evidence loaders, verifyCorpus, validateEvidence, deriveEvidence, writeEvidence, monotone computeAgreement)
  - Committed corpus manifest + human-corrected ground-truth labels + derived pdf-evidence.json (CI-replayable)
  - calibrate:pdf local derive workflow + always-on replay.spec CI gate (T-11-14/T-11-15)
  - Corpus-calibrated pdfToBlocks: furniture suppression, script-band merge, standalone/section-heading arms
affects: [11-pdf-intake verification, any future PDF threshold change]

tech-stack:
  added: []
  patterns:
    - "Furniture suppression: digit-normalized first/last bands repeating ≥3 pages + bare folios, isolated from body by >paragraph spacing, stripped before classification"
    - "Monotone full-lookahead label↔block alignment (clustered divergence must not derail the agreement metric)"
    - "Evidence replay pins shipped PDF_THRESHOLDS to the committed record — thresholds only change with a re-derive"

key-files:
  created:
    - tests/unit/server/pdf-calibration/derive.spec.ts
    - tests/unit/server/pdf-calibration/replay.spec.ts
    - tests/unit/server/pdf-calibration/pdf-evidence.json
    - tests/unit/server/pdf-calibration/manifest.json
    - tests/unit/server/pdf-calibration/ground-truth/*.pdf.json (4 label files)
  modified:
    - tests/unit/server/pdf-calibration/harness.ts
    - tests/unit/server/pdf-calibration/harness.test.ts
    - tests/unit/server/pdf-calibration/ground-truth/README.md
    - server/pdfToBlocks.ts
    - .planning/phases/11-pdf-intake/11-06-OUTPUT.md

key-decisions:
  - "Ground-truth vocabulary widened to the human corrector's kinds (footnote/table header/table content + level 1); body-text kinds match paragraphs by equivalence class — Phase 11 footnotes ARE body text (Pattern 1)"
  - "computeAgreement realigned monotonically with full lookahead — the ±1 greedy walk scored a 95%-correct extraction 0.02 after clustered divergence derailed it; denominator honesty preserved"
  - "Furniture suppression requires isolation from body — TRACE's bibliography opens pages with reference entries sharing the running head's digit-normalized key; proximity to body line-spacing protects content"
  - "YouAreTheOne book-2-col.pdf is geometrically single-column (396pt pages, full-measure single items) — refusing it pdf-multi-column would violate locked D11-03; surfaced as Rule 4, never tuned around"
  - "headingFontRatio 1.15 → 1.095 (TRACE headings 12pt over 10.9pt body — ratio 1.101); no pinned synthetic value changed"

patterns-established:
  - "Honest-gate discipline: replay.spec fails loudly while the bar is unmet (exit-1 recorded in 11-06-OUTPUT.md), never silently skipped"

requirements-completed: []

duration: 58 min
completed: 2026-08-17
status: checkpoint-pending
---

# Phase 11 Plan 6: PDF Intake Calibration Summary

**SC#4b calibration instrument shipped and run: 6-PDF corpus manifest + human-corrected labels + committed evidence with furniture/script-band/section-heading threshold calibration — 3/6 files at the D11-06 bar, 3 blocked on surfaced Rule 4 human decisions**

## Performance

- **Duration:** ~58 min (this continuation session: label review checkpoint → Task 3)
- **Started:** 2026-08-17T16:31:11Z
- **Completed:** 2026-08-17T17:29:00Z (checkpoint-pending)
- **Tasks:** Task 3 executed (Tasks 1-2 in prior sessions: `870711f` RED + `4043679` GREEN + corpus checkpoint)
- **Files modified:** 11

## Accomplishments
- Closed the wage-labour miss completely: furniture suppression (35 page-number blocks + 16 section-end "figure" gaps + running-head quote ambiguity) took it from `refused:round-trip-anchor-failed` to **admitted at 0.9356 agreement**
- Lunar Meditation 0.94 ✓ and the scanned classification ✓ hold — 3/6 corpus files fully at the bar
- Instrument hardened during real-corpus derive: monotone alignment, spaceless/footnote-marker matcher tiers, fragment-theft guard (each fix proven by a specific corpus failure mode)
- The honest full-suite gate run and recorded with a RED exit code (the replay bar gate failing loudly by design) — `11-06-OUTPUT.md` is the permanent record including the anti-pattern attestation

## Task Commits

1. **Task 1 (prior session):** `870711f` (test/RED) + `4043679` (feat/GREEN) — harness core + wiring + docs
2. **Task 2 (prior session):** corpus supplied at checkpoint; manifest + draft labels authored on disk
3. **Task 3 (this session):**
   - `2ac6940` (fix) — corrected label vocabulary + monotone agreement alignment
   - `903bec3` (feat) — corpus-calibrated pdfToBlocks (furniture, script bands, section arms)
   - `887e3b1` (feat) — manifest + corrected labels + evidence + derive/replay specs

**Plan metadata:** `<this commit>` (docs)

## Files Created/Modified
- `tests/unit/server/pdf-calibration/harness.ts` — vocabulary widening, equivalence-class matching, monotone computeAgreement, matcher tiers
- `server/pdfToBlocks.ts` — stripPageFurniture, script-band merge (bottom-edge gaps), standalone/pageTop rules, bold-section + numbered-section heading arms, blank-page honesty, 5 new thresholds + headingFontRatio retune
- `tests/unit/server/pdf-calibration/{manifest,pdf-evidence}.json` — the committed corpus + derived record
- `tests/unit/server/pdf-calibration/{derive,replay}.spec.ts` — local derive (env-gated) + always-on CI replay with thresholds pin
- `.planning/phases/11-pdf-intake/11-06-OUTPUT.md` — honest gate record

## Decisions Made
See key-decisions above; all threshold changes are corpus-evidenced and synthetic-extreme-green (55/55 pdf suites; full unit 968 passed with only the replay bar gate failing by design).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Harness rejected the human-corrected labels**
- **Found during:** Task 3 (label re-read)
- **Issue:** Corrected labels use footnote/table header/table content kinds + level 1; `GroundTruthLabelSchema` accepted only heading|paragraph, level 2-6 — loadGroundTruth threw on the truth
- **Fix:** Widened the vocabulary + equivalence-class matching (heading labels need heading blocks; every body-text kind matches paragraphs — Phase 11 footnotes/tables ARE body text); README updated; 2 new harness tests
- **Commit:** `2ac6940`

**2. [Rule 1 - Bug] Agreement metric derailed on clustered divergence**
- **Found during:** Task 3 derive (wage-labour measured 0.02 for a 95%-correct extraction)
- **Issue:** The ±1-drift greedy walk permanently loses sync after 2+ consecutive extra blocks (equation fragments, TOC splits)
- **Fix:** Monotone full-lookahead alignment (denominator honesty unchanged — the committed ±1 test still passes at 2/3); + matcher tiers ([digit] stripping, spaceless fallback, ≥8-char reverse-containment guard against fragment theft)
- **Commit:** `2ac6940`

**3. [Rule 1 - Bug] Furniture false positive stripped bibliography content**
- **Found during:** Task 3 TRACE forensics
- **Issue:** Reference entries opening pages share the running head's digit-normalized key ("A Science of Reality: … Traces#") and were stripped
- **Fix:** Isolation requirement — a furniture candidate must sit >paragraph-spacing from the body; also fixed an inverted last-band distance check that had disabled all bottom-folio stripping
- **Commit:** `903bec3`

**4. [Rule 1 - Bug] Fragment-merge geometry bugs**
- **Found during:** Task 3 TRACE iteration
- **Issue:** splice off-by-one corrupted the sizes array; merged bands kept a stale top-y so fragment chains stalled before reaching their base
- **Fix:** Retargeted index updates + bottom-edge gap math
- **Commit:** `903bec3`

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocker, 1 instrument bug)
**Impact on plan:** All necessary for the calibration to measure honestly. No scope creep — every rule is corpus-evidenced with synthetic extremes green.

## Issues Encountered
- **Rule 4 (STOP) — three human decisions surfaced (see checkpoint):** (1) YouAreTheOne's manifest class contradicts the PDF's geometry (single-column, 396pt pages, full-measure items; anchor refusal from duplicated front/back matter, not columns) — forcing the multi-column refusal would violate locked D11-03; (2) TRACE's two "A Science of Reality…" labels describe running heads, not content (the string exists only as title + page heads) — deleting them projects ≈0.913 ≥ 0.90; (3) the resume labels are internally inconsistent (Summary/Core Strengths/Experience heading-split vs geometrically identical Selected Projects/Education & Certification paragraph-merged) — relabeling projects ≈1.0. Tuning past these would corrupt detection (D11-02's warning), so the bar is surfaced, not gamed.

## User Setup Required
None — the local corpus workflow is documented in `docs/pdf-calibration.md` (PDFs stay local + gitignored per D11-04).

## Next Phase Readiness
- **BLOCKED on the Rule 4 checkpoint** before SC#4/ING-04 can close: after the user's decisions (replace/reclassify YouAreTheOne; delete TRACE's 2 running-head labels; relabel the resume's 2 sections), the continuation re-runs `npm run calibrate:pdf`, commits the refreshed evidence, and re-runs the honest full-suite gate (expected exit 0).
- The instrument, specs, replay gate, and calibrated adapter are all committed and CI-active now.

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-17 (checkpoint-pending)*
