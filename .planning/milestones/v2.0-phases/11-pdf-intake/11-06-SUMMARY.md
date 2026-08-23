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
  - Committed 6-PDF corpus manifest (incl. the genuine 3-column IDOM 50 editorial) + human-corrected ground-truth labels + derived pdf-evidence.json (CI-replayable)
  - calibrate:pdf local derive workflow + always-on replay.spec CI gate (T-11-14/T-11-15)
  - Corpus-calibrated pdfToBlocks: furniture suppression, script-band merge (incl. stacked-operator under-limits), standalone/section-heading arms
  - ING-04 closed: PDF upload extracts/normalizes with honest typed refusals, thresholds proven at the D11-06 bar on real PDFs
affects: [11-pdf-intake verification, any future PDF threshold change]

tech-stack:
  added: []
  patterns:
    - "Furniture suppression: digit-normalized first/last bands repeating ≥3 pages + bare folios, isolated from body by >paragraph spacing, stripped before classification"
    - "Monotone full-lookahead label↔block alignment (clustered divergence must not derail the agreement metric)"
    - "Evidence replay pins shipped PDF_THRESHOLDS to the committed record — thresholds only change with a re-derive"
    - "AND-qualified wide merge window: a band gets the 1.0×lineDelta window only when it is BOTH ≤12 chars AND script-sized — body-sized short lines and math-heavy body lines keep the 0.75 window"

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
  - "RULE 4 RESOLVED (user, all-recommended): YouAreTheOne (geometrically single-column, would violate locked D11-03) replaced by the user-supplied genuine 3-column IDOM 50 editorial.pdf — it refuses pdf-multi-column as its class demands; never tuned around"
  - "RULE 4 RESOLVED (user): TRACE's two 'A Science of Reality…' labels described running heads (furniture), not content — deleted; resume's Selected Projects / Education & Certification relabeled heading + paragraph matching the sibling-section pattern (0.6154 → 0.9231)"
  - "scriptFragmentGapRatio = 1 (window for AND-qualified pure decoration bands): TRACE's orphaned ∑ under-limits '𝑘=0' (7.97pt, 11.88pt below their equation band) merge into it — TRACE 0.8932 → 0.92; a first attempt widening the window for size-only bands was REVERTED (fused math-heavy body lines + flipped a synthetic extreme)"
  - "headingFontRatio 1.15 → 1.095 (TRACE headings 12pt over 10.9pt body — ratio 1.101); no pinned synthetic value changed"

patterns-established:
  - "Honest-gate discipline: replay.spec fails loudly while the bar is unmet (exit-1 recorded in 11-06-OUTPUT.md §2), never silently skipped; the GREEN re-run is recorded in §5"
  - "Rule-4 checkpoint projections must state which side of max(labels, blocks) the denominator sits on — TRACE's ≈0.913 projection assumed label-side; the actual block-side denominator left agreement unchanged after the deletions"

requirements-completed: ["ING-04"]

duration: 47 min
completed: 2026-08-17
status: complete
---

# Phase 11 Plan 6: PDF Intake Calibration Summary

**SC#4b calibration closed at the bar: 6/6 real PDFs classified correctly (IDOM 3-column refused, scanned refused, 4 admitted at 0.92–0.94 agreement) with corpus-calibrated thresholds, committed CI-replayable evidence, and the honest full-suite gate green (exit 0)**

## Performance

- **Duration:** ~58 min (first continuation) + ~47 min (this close-out continuation)
- **Started:** 2026-08-17T16:31:11Z
- **Completed:** 2026-08-17T18:58:00Z
- **Tasks:** 3 (Task 1 TDD in prior session; Task 2 corpus checkpoint; Task 3 derive/tune/gate across two continuations)
- **Files modified:** 12

## Accomplishments
- All three Rule-4 user decisions applied and evidence-proven: IDOM 50 editorial.pdf refuses `pdf-multi-column` (genuine 3-column), TRACE hits **0.92** after the running-head label deletions + under-limit calibration, the resume hits **0.9231** after the section relabel — every corpus file at the D11-06 bar (6/6 correct classifications, all admitted ≥ 0.90)
- New `scriptFragmentGapRatio` calibration with AND-qualification safety: pure decoration fragments (∑ under-limits) merge within a full line delta while body-sized short lines and math-heavy body lines keep the 0.75 window — synthetic extremes 35/35 green
- Honest full-suite gate GREEN in ONE invocation: `npm run test` exit 0 — unit 969/0/10, e2e 946/0/6 across chromium/firefox/webkit + throttled perf; the prior 5 e2e flakes all passed; both the RED and GREEN records live in 11-06-OUTPUT.md
- ING-04 closed: PDF upload with extraction/normalization and honest typed refusals (scanned/multi-column), thresholds proven against real PDFs before promotion

## Task Commits

1. **Task 1 (prior session):** `870711f` (test/RED) + `4043679` (feat/GREEN) — harness core + wiring + docs
2. **Task 2 (prior sessions):** corpus supplied at checkpoints; manifest + draft labels authored
3. **Task 3 (across continuations):**
   - `2ac6940` (fix) — corrected label vocabulary + monotone agreement alignment
   - `903bec3` (feat) — corpus-calibrated pdfToBlocks (furniture, script bands, section arms)
   - `887e3b1` (feat) — manifest + corrected labels + evidence + derive/replay specs
   - `b5fe525` (feat) — Rule-4 decisions applied + scriptFragmentGapRatio: every file at the D11-06 bar
   - `b7d5e8a` / `c4bc380` / `c26ec48` (docs) — honest gate record + checkpoint state

**Plan metadata:** `<this commit>` (docs)

## Files Created/Modified
- `tests/unit/server/pdf-calibration/harness.ts` — vocabulary widening, equivalence-class matching, monotone computeAgreement, matcher tiers
- `server/pdfToBlocks.ts` — stripPageFurniture, script-band merge (bottom-edge gaps, AND-qualified wide window for pure decoration fragments), standalone/pageTop rules, bold-section + numbered-section heading arms, blank-page honesty, 6 new thresholds + headingFontRatio retune
- `tests/unit/server/pdf-calibration/{manifest,pdf-evidence}.json` — the committed corpus (IDOM swap) + derived record at the bar
- `tests/unit/server/pdf-calibration/ground-truth/*.json` — human-corrected labels (TRACE running-heads deleted; resume sections split)
- `tests/unit/server/pdf-calibration/{derive,replay}.spec.ts` — local derive (env-gated) + always-on CI replay with thresholds pin
- `.planning/phases/11-pdf-intake/11-06-OUTPUT.md` — honest gate record (RED §2 + GREEN §5)

## Decisions Made
See key-decisions above; every threshold change is corpus-evidenced with synthetic extremes green (35/35 adapter suite; full unit 969 passed / 0 failed with the replay bar gate now green).

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
- **Fix:** Isolation requirement — a furniture candidate band must sit >paragraph-spacing from the body; also fixed an inverted last-band distance check that had disabled all bottom-folio stripping
- **Commit:** `903bec3`

**4. [Rule 1 - Bug] Fragment-merge geometry bugs**
- **Found during:** Task 3 TRACE iteration
- **Issue:** splice off-by-one corrupted the sizes array; merged bands kept a stale top-y so fragment chains stalled before reaching their base
- **Fix:** Retargeted index updates + bottom-edge gap math
- **Commit:** `903bec3`

**5. [Rule 1 - Bug] Orphaned ∑ under-limits left TRACE below the bar after the user's decisions**
- **Found during:** Task 3 close-out (TRACE stuck at 0.8932 — the checkpoint's ≈0.913 projection assumed a label-side denominator; the block side was larger and the deleted labels were unmatched)
- **Issue:** The "𝑘=0" under-limit bands (7.97pt script) sit 11.88pt below their equation band — 1.7pt outside the 0.75×lineDelta merge window — orphaning them as standalone paragraph blocks (92/103 = 0.8932)
- **Fix:** New `scriptFragmentGapRatio: 1` — the 1.0×lineDelta window applies ONLY to bands that are BOTH ≤ scriptFragmentChars AND size-qualified (pure decoration); a first attempt widening the window for size-only bands fused math-heavy body lines (TRACE 0.8091) and flipped a synthetic extreme — reverted, then re-landed with the AND-qualification
- **Files modified:** server/pdfToBlocks.ts
- **Verification:** synthetic adapter suite 35/35 green; TRACE 92/100 = 0.92; full derive validates 6/6 at the bar; honest gate exit 0
- **Committed in:** `b5fe525`

---

**Total deviations:** 5 auto-fixed (3 bugs, 1 blocker, 1 instrument/threshold bug)
**Impact on plan:** All necessary for honest calibration measurement and the promotion bar. No scope creep — every rule is corpus-evidenced with synthetic extremes green, and the one over-aggressive tuning attempt was reverted rather than shipped.

## Issues Encountered
- **Rule 4 checkpoint (RESOLVED):** three decisions surfaced in the prior continuation (YouAreTheOne class vs geometry; TRACE running-head labels; resume label inconsistency). The user chose all-recommended: swap the corpus file, delete the two TRACE entries, relabel the resume sections. Applied in `b5fe525`.
- **Checkpoint projection correction:** the TRACE ≈0.913 projection was wrong about the denominator side; after the deletions the agreement was unchanged (0.8932) and the honest remaining gap was extraction-side (orphaned under-limit fragments) — fixed by calibration (deviation 5), not by further label edits.
- **Known execution note honored:** raw `getDocumentProxy`+`destroy` outside `withPdfDocument` poisons the shared pdfjs worker under jsdom — all derive/metadata runs went through the safe paths (a temporary diagnostic initially passed a base64 string where `withPdfDocument` wants `Uint8Array` — own bug, fixed in the diagnostic before any conclusion was drawn).

## User Setup Required
None — the local corpus workflow is documented in `docs/pdf-calibration.md` (PDFs stay local + gitignored per D11-04). The replaced `YouAreTheOne book-2-col.pdf` may remain on disk untracked; the manifest is the source of truth.

## Next Phase Readiness
- **SC#4 closed; ING-04 complete; Phase 11's six plans all have summaries.** Ready for phase verification (`/gsd-verify-work 11`) and Phase 12 planning (ING-05 EPUB-as-Book).
- Any future PDF threshold change must re-run `npm run calibrate:pdf` against the local corpus and commit the refreshed evidence (the replay spec pins the snapshot).

## Self-Check: PASSED

All 14 key files exist on disk; all 9 task/docs commits present in git log (870711f, 4043679, 2ac6940, 903bec3, 887e3b1, b5fe525, b7d5e8a, c4bc380, c26ec48). Final gate: `npm run test` exit 0 (unit 969/0/10 + e2e 946/0/6) recorded in 11-06-OUTPUT.md §5.

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-17*
