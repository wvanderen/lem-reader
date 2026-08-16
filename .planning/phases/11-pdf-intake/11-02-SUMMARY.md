---
phase: 11-pdf-intake
plan: 02
subsystem: ingestion
tags: [pdf, unpdf, pdfjs, block-assembly, column-detection, outline, headings, typed-refusals]

# Dependency graph
requires:
  - phase: 07-url-ingestion
    provides: IngestionError typed-refusal pattern + the adapter five-field contract (extractAndNormalize)
  - phase: 08-markdown-library
    provides: markdownToBlocks sibling-adapter precedent + server-only import discipline
  - phase: 11-pdf-intake (11-01)
    provides: unpdf@1.8.1 pin, PDF caps in server/limits.ts, synthetic fixture corpus
provides:
  - pdfToBlocks adapter (bytes → five-field result) with one-proxy lifecycle, caps-first, timeout race
  - Page-weighted scanned + multi-column detection refusing BEFORE assembly (D11-01/D11-03) — never silently reordered
  - Outline-first heading coercion (clamp(depth+2,2,6)) with font-size fallback (D11-08)
  - Paragraph assembly with hyphenation joins + x-gap space rule (Pattern 6)
  - Honest unsupported blocks for non-text regions (near-empty pages + figure-sized gaps)
  - PDF_THRESHOLDS exported with all D11-02 starting values — the 11-06 calibration surface
  - classifyDocument / mapPdfjsError / assertPageCap / isSanePdfTitle / saneInfoTitle / outlineHeadingTargets exports
affects: [11-pdf-intake (11-03 orchestrator fourth branch, 11-05 client/e2e, 11-06 calibration harness)]

# Tech tracking
tech-stack:
  added: []  # unpdf landed in 11-01; this plan adds no dependencies
  patterns:
    - "Band-coverage gutter analysis votes per CONTIGUOUS X-RUN within a y-band — whole-band spans would merge shared-baseline column pairs into pseudo-headers"
    - "Dest arrays read via the VERIFIED flat XYZ shape [ref,{name:'XYZ'},left,top,zoom]; the .args sketch kept only as defensive fallback"
    - "Top-of-page /XYZ dests (y at/above the page's topmost block) coerce the topmost block when no block matches the y-tolerance"
    - "Whitelist-only realItems filter drops pdfjs's zero-width empty-string items and synthetic whitespace items"

key-files:
  created:
    - server/pdfToBlocks.ts
    - tests/unit/server/pdf-to-blocks.spec.ts
  modified:
    - tests/fixtures/pdf/generate-synthetic-pdfs.ts

key-decisions:
  - "x-runs (not whole y-bands) are the voting unit of Pattern 3 — required because two-column rows share baselines; the fixture's gutter is otherwise undetectable"
  - "colTextShare attributes only narrow-run text mass by x-center — full-width lines are spanning elements, not column text, so single-column pages can never false-refuse"
  - "Top-of-page dest fallback: /XYZ 0 pageHeight 0 destinations sit ~52pt above the first baseline (52pt top margin), outside the 1.5-line tolerance — dest y ≥ page's max block top coerces the topmost block"
  - "Generator made importable (exports serializePdf/buildContentStream; main() guarded by direct-run check) so tiny probe PDFs reuse the corpus serializer — self-check PASS, fixtures byte-identical"
  - "pdfjs pre-merges close same-line runs (its own space synthesis — RESEARCH A4 confirmed by measurement); the adapter's x-gap rule owns only the separate-item joins"

patterns-established:
  - "TDD two-task adapter build: Task 1 RED/GREEN on lifecycle+detection+refusals with a plan-permitted typed stub; Task 2 RED/GREEN completes assembly in the same spec file"
  - "Stub-injectable pdfjs surfaces (OutlineCapablePdf) prove two-shaped dest handling without extra fixtures"

requirements-completed: []  # ING-04 closes at the end-to-end plans (11-05 e2e + 11-06 calibration) — 04-02 PAGE-01 split precedent

# Metrics
duration: 18min
completed: 2026-08-16
status: complete
---

# Phase 11 Plan 02: PDF Intake Adapter Summary

**The unpdf Stage-1 adapter: one-proxy lifecycle with caps-first/timeout-race resource invariants, page-weighted scanned + multi-column refusal BEFORE assembly, outline-first headings with font-size fallback, dehyphenating paragraph assembly, and honest unsupported blocks — 35 unit tests over real pdfjs extraction.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-16T22:39:30Z
- **Completed:** 2026-08-16T22:57:29Z
- **Tasks:** 2/2 (both TDD: RED → GREEN per task)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Typed refusals proven over real pdfjs**: corrupt → `pdf-unreadable` (name-matched `InvalidPDFException`), scanned → `pdf-scanned` (zero-text page majority), two-column → `pdf-multi-column` (band-coverage gutter detection, page-weighted per D11-03); single-column + outline fixtures resolve. `mapPdfjsError` covers `PasswordException` → `pdf-encrypted` via fakes (no encryptable fixture exists — T-11-06 never-decrypt posture).
- **Resource invariants (T-11-01 mitigation)**: `withPdfDocument` reuses ONE proxy across getMeta + extractTextItems + getOutline, passes `maxImageSize: MAX_IMAGE_PIXELS`, checks `assertPageCap(numPages)` BEFORE any extract call (Pitfall 9), races the 30s timeout (folding pdf-timeout into `server-error` with a descriptive message per Pattern 7), and ALWAYS destroys via `loadingTask.destroy()`.
- **Assembly quality**: y-descending reading order (Pitfall 1), paragraph grouping on vertical gap × 1.35 modal line delta + fontSize/fontFamily regime change, hyphen-before-lowercase dehyphenation ("conclu-/sion…" → "conclusion"), x-gap space insertion, ONE unsupported block per figure-sized intra-page gap and per near-empty page inside admitted docs (originalKind `non-text-region`).
- **Heading recovery (D11-08)**: outline destinations (string-named AND explicit-array, Pitfall 10) coerce targets to `clamp(depth+2, 2, 6)`; top-level bookmarks → level 2 (bodies start at h2). Font-size fallback (char-weighted modal body × 1.15, ≤ 10 words) covers outline-less PDFs. Title sanity (D11-07 helper half): `isSanePdfTitle` garbage table + `saneInfoTitle` Info-dict wiring; adapter stays filename-agnostic.
- **Verification**: `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` → 35/35; full unit suite → 911 passed / 0 failed / 7 intentional skips; `npx tsc --noEmit` → exit 0; eslint clean; zero unpdf imports under `src/` (Pitfall 12); zero dompurify references in the adapter.

## Task Commits

Each task followed TDD (RED test commit → GREEN implementation commit):

1. **Task 1: Proxy lifecycle + detection + typed refusals** — `cf32f0d` (test, RED) + `09d2dac` (feat, GREEN)
2. **Task 2: Block assembly + headings + title sanity + adapter contract** — `241c5bd` (test, RED — includes the generator importability refactor) + `d932c7b` (feat, GREEN)

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `server/pdfToBlocks.ts` (955 lines) — the complete adapter: PDF_THRESHOLDS, withPdfDocument, classifyDocument (+ band/x-run gutter analysis), mapPdfjsError, assertPageCap, outlineHeadingTargets, assemblePage, isSanePdfTitle/saneInfoTitle, PdfToBlocksResult, pdfToBlocks
- `tests/unit/server/pdf-to-blocks.spec.ts` (481 lines) — 35 tests: fixture refusals, error-map table, page-cap boundary, detection algebra over hand-built arrays, five-field contract, schema-parse, headings, hyphenation, gap ordering, x-gap probes (tiny PDFs), outline coercion + stub, title-sanity table
- `tests/fixtures/pdf/generate-synthetic-pdfs.ts` — exports TextLine/FixtureSpec/buildContentStream/serializePdf; `main()` guarded behind a direct-run check (importing reuses the serializer without rewriting fixtures); self-check PASS, emitted fixture bytes identical

## Decisions Made

- **X-runs as the Pattern-3 voting unit.** Two-column rows share baselines (both the synthetic fixture and real grid-aligned journals), so a whole y-band's horizontal span always covers both columns — every band would be "wide" and excluded, making shared-baseline columns undetectable. The faithful implementation splits each band into contiguous x-runs at gaps > 1em; runs wider than `wideBandRatio` of the text extent are spanning elements (headers/pull quotes) and never vote.
- **colTextShare over narrow-run mass, attributed by x-center.** Full-width lines are spanning elements by construction, so counting them as column text let a wide title's right edge manufacture a second "region" holding body text. Narrow-run-only mass makes single-column pages structurally unable to false-refuse.
- **Top-of-page dest fallback in outline coercion.** The generator's (and most producers') `/XYZ 0 pageHeight 0` destinations point at the page edge — 52pt above the first baseline, outside the 1.5-line tolerance. When no block matches within tolerance AND the dest y is at/above the page's topmost block top, the topmost block is the target.
- **Real dest-array shape over the research sketch.** Verified shape is `[RefProxy, {name:"XYZ"}, left, top, zoom]` — coordinates are flat array elements; the sketch's `.args` form is kept only as a defensive fallback.
- **Generator importability over a forked test PDF writer.** The spec's tiny probe PDFs are built by the same `serializePdf` that produced the committed corpus; the direct-run guard keeps `node tests/fixtures/pdf/generate-synthetic-pdfs.ts` behavior identical.
- **Fallback headings are level 2 uniformly** — no signal maps font size to depth; bodies start at h2 (one-h1 rule), and outline entries carry the only real depth information.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - test calibration] x-gap probe coordinates corrected to measured pdfjs metrics**
- **Found during:** Task 2 (GREEN run)
- **Issue:** The probe PDF's tight pair (x=91) produced "Hello world" — real 12pt "Hello" measures 27.336pt (not the ~29.3 estimate), and pdfjs pre-merges close same-line runs with its own synthesized space, so the no-space case needs x=88 (gap 0.664pt) where pdfjs merges gap-free.
- **Fix:** Tight pair moved to x=88 with comments recording the measured metrics and the pdfjs pre-merge behavior (RESEARCH A4 "x-gap insertion is a fallback" confirmed by measurement).
- **Files modified:** tests/unit/server/pdf-to-blocks.spec.ts
- **Verification:** 35/35 green.
- **Committed in:** d932c7b (Task 2 GREEN)

**2. [Rule 1 - test bug] Outline stub expectation miscounted parent entries**
- **Found during:** Task 2 (GREEN run)
- **Issue:** Expected 3 outline targets, got 4 — "Parent" carries a valid array dest AND nested items; parents with destinations are legitimate section headings and must coerce too.
- **Fix:** Expectation corrected to 4 with an explicit Parent level-2 assertion.
- **Files modified:** tests/unit/server/pdf-to-blocks.spec.ts
- **Verification:** 35/35 green.
- **Committed in:** d932c7b (Task 2 GREEN)

**3. [Rule 3 - blocking] Generator made importable for tiny probe PDFs**
- **Found during:** Task 2 (test authoring)
- **Issue:** The x-gap and isReaderable-false behaviors need programmatic tiny PDFs; the 11-01 generator was script-only (top-level `main()` side effect), so the spec could not reuse the serializer without rewriting fixtures on every test import.
- **Fix:** Exported `TextLine`/`FixtureSpec`/`buildContentStream`/`serializePdf`; guarded `main()` behind the standard ESM direct-run check (`import.meta.url === pathToFileURL(process.argv[1]).href`).
- **Files modified:** tests/fixtures/pdf/generate-synthetic-pdfs.ts
- **Verification:** `node tests/fixtures/pdf/generate-synthetic-pdfs.ts` exits 0, self-check PASS, `git status` shows fixture bytes unchanged; full suite green on import.
- **Committed in:** 241c5bd (Task 2 RED)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 test corrections, 1 Rule 3 blocker)
**Impact on plan:** All three were correctness requirements of the planned work (measured platform behavior, honest expectation, test infrastructure). No scope creep; no 11-01 artifact semantics changed.

## TDD Gate Compliance

Both tasks carried `tdd="true"` and produced the full gate sequence in git log:

| Task | RED (test) | GREEN (feat) | Status |
|------|-----------|--------------|--------|
| 1 | cf32f0d | 09d2dac | Pass |
| 2 | 241c5bd | d932c7b | Pass |

RED runs failed for the right reasons (module-missing import error; stub-assembly assertion failures; `outlineHeadingTargets is not a function`), verified before each GREEN commit. No REFACTOR commit — the GREEN implementations were left clean (comments and structure landed with the feature commits).

## Issues Encountered

None beyond the auto-fixed deviations. Two platform realities surfaced by measurement and absorbed into design (documented under Decisions): shared-baseline column rows requiring x-run voting, and pdfjs's close-run pre-merging behavior.

## Authentication Gates

None.

## Known Stubs

None. Every shipped surface is real and exercised: the adapter refuses/admits the committed fixtures through real pdfjs extraction, all seven required exports are consumed by the suite, and PDF_THRESHOLDS is assertion-locked for the 11-06 harness import.

## Threat Flags

None beyond the plan's own threat model — no new security surface was introduced. The four registered mitigations (T-11-01 caps/timeout/destroy, T-11-03 refuse-before-assembly, T-11-06 never-decrypt, T-11-08 y-descending order) are implemented and unit-proven in this plan's commits.

## User Setup Required

None.

## Next Phase Readiness

- **Ready for 11-03** (pipeline fourth branch): `pdfToBlocks(bytes)` returns the exact `MarkdownToBlocksResult` shape, so `server/ingest.ts` destructures the fourth branch with the same code; refusals serialize through the existing IngestionError catch; `saneInfoTitle` + the D8-17-style filename fallback chain assemble provenance.
- **Ready for 11-06** (calibration): `PDF_THRESHOLDS` carries every detection/assembly number (detection set from D11-02; assembly set: paragraphGapRatio 1.35, itemGapRatio 0.2, figureGapLines 5, headingFontRatio 1.15, headingMaxWords 10, outlineYToleranceLines 1.5, plus bandYToleranceRatio 0.3 / marginBandRatio 0.05 / xBinEm 0.5 used by the banding itself).
- **Notes for later plans:** (a) D11-09 title-consume (suppress a page-1 heading that fuzzy-matches a sane Info title — Pitfall 11 doubled title) is NOT in this plan's behaviors and remains unimplemented; the natural home is 11-03's provenance assembly or a calibration-driven follow-up. (b) `synthetic-outline.pdf` pages fall below `scannedItemFloor` (5–6 real items/page), so that fixture admits with zero text-bearing pages — harmless today (its blocks still assemble), but worth remembering when 11-06 tunes floors. (c) An encrypted-PDF fixture cannot be produced by the current generator; `pdf-encrypted` is locked by the `mapPdfjsError` fake-name tests, and the e2e refusal proof (11-05) should either extend the generator or rely on the unit lock.

## Self-Check: PASSED

4/4 verified — both created files exist on disk; the modified generator self-check passes; all 4 task commits (cf32f0d, 09d2dac, 241c5bd, d932c7b) present in git log; plan verification commands re-run green (35/35 spec, tsc exit 0, no dompurify, unpdf absent from src/).
