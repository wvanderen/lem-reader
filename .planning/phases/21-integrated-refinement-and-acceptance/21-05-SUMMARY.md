---
phase: 21-integrated-refinement-and-acceptance
plan: 05
subsystem: testing
tags: [playwright, e2e, acceptance, portability, byte-equality, epub-images, eslint, lint-debt, acpt-07]

# Dependency graph
requires:
  - phase: 09-portability
    provides: the two-context machine A/B harness (_portability.ts), validateBundle/import pipeline, raw IndexedDB row-truth discipline
  - phase: 20-safe-local-image-fidelity
    provides: bundle v4 asset round-trip, D20-15 Blob asset rows, the documented webkit Blob→IDB skip ledger (deferred-items.md)
  - phase: 21-integrated-refinement-and-acceptance (21-01..21-04)
    provides: the corrected+audited state (truthful measure, anchored tag menu, review glyph, placeholder contrast) the journey runs over
provides:
  - "tests/e2e/portability/v21-core-flow-spine.spec.ts — the ACPT-07 instrument: ONE unbroken two-context v2.1 journey (seed+EPUB-with-images → organize → add .md → edit metadata → TOC → cross-block highlight → review → export → wipe/import → byte-equal restoration), 2 passed + 1 documented webkit skip per run"
  - "Asset-row byte equality inside the spine: every bundle-carried field + Blob bytes read browser-side on BOTH machines (the 20-05 SC#4 precedent extended end-to-end through real ingestion → export → import)"
  - "D21-15 closed: zipSlip's three Phase 9 lint errors fixed behavior-identically (two line-scoped justified no-control-regex disables + one redundant-escape removal) — npm run lint exits 0 repo-wide"
affects: [21-06 (ACPT-08 matrix + the honest full-suite gate run over a lint-green tree), 21-VERIFICATION.md (cites this spine as the ACPT-07 evidence)]

# Tech tracking
tech-stack:
  added: [] # zero packages — shipped e2e machinery + eslint directives only
  patterns:
    - "Integrated-spine acceptance (D21-13): one unbroken journey per engine proves no-loss where segmented proofs can silently drop hand-offs; every arm driven through the real UI, helpers imported from non-spec modules only"
    - "Cross-block highlight truth in e2e: a two-block span renders one mark per containing block sharing data-highlight-id (D5-16) — assert the COUNT (2), never a bare toBeVisible on the shared-id locator (strict mode)"
    - "View-switcher links carry live counts in their accessible names (\"Unread (9)\") — match by /^Label \\(\\d+\\)$/ regex, never exact strings"
    - "Lint-disable discipline (D21-15): line-scoped eslint-disable-next-line with an inline -- justification only where the \"violation\" IS the feature (control-char detection); the directive line must sit directly above the offending line (a wrapped justification breaks adjacency and reports the directive unused)"

key-files:
  created:
    - tests/e2e/portability/v21-core-flow-spine.spec.ts
  modified:
    - src/portability/zipSlip.ts
    - tests/e2e/annotations/eligibility-matrix.spec.ts

key-decisions:
  - "The whole journey is an image-save cell on webkit (D21-11): the EPUB-with-images ingestion's saveBook writes D20-15 Blob rows (the add never completes there) and is inseparable from the unbroken journey, so the ONE test carries a single test.skip citing the Phase 20 deferred-items ledger — matching the acceptance criterion's \"a webkit test.skip\"; every non-image arm stays webkit-proven by the existing engine-complete suites (ACPT-06 spine, reading-views, search-tag-filter, metadata-edit, toc-navigation)"
  - "renderedFigureBook (tests/unit/server/epub-fixtures.ts — a non-spec module) is the images-arm payload: the fittest shipped EPUB-with-one-admissible-PNG whose real Add-dialog upload writes Blob asset rows network-free (fixture-registry images never travel through export — RESEARCH A4)"
  - "The reader-facing wipe is recovery-routed (App.tsx), not user-invocable — so the 09-06 two-context clear-rows (prepareFreshPage on machine B) IS the journey's wipe step, exactly as the ACPT-06 template did"
  - "Asset-row equality = every bundle-carried field (articleId/assetId/contentType/byteLength) + byte-equal Blob bytes read browser-side via arrayBuffer on both machines; the D20-15 createdAt never travels (applyImport re-stamps it by design) so it is asserted present-but-fresh, never compared — the honest 20-05 SC#4 bar, not a silent row-field omission"
  - "Books joined the byte-equality set (7 row kinds total): the journey's library HAS a book, so excluding it would weaken \"without loss\" (D13-08 excluded books only because the ACPT-06 corpus had none)"
  - "The cross-block highlight is created in SCROLLING mode (the whole body mounts, both endpoint blocks in the DOM — the survive-relayout precedent); the paginated TOC turn happens before the toggle, so both mode surfaces are exercised"

patterns-established:
  - "Journey-arm composition map: view links by counted-name regex, search via input#library-search, tag chips via .tag-filter .tag-chip aria-pressed toggle, edit dialog via .library-row-edit → dialog.edit-metadata, TOC via the \"Table of contents\" nav, review via #/highlights /^Go to highlight:/ row-button jump"
  - "Preview/import sentences computed from the bundle JSON itself (honest pluralization matching ImportPreviewDialog countWithLabel) instead of hardcoded counts"

requirements-completed: [ACPT-07]

# Metrics
duration: 31min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 05: v2.1 Core-Flow Spine Summary

**ACPT-07 proven as ONE unbroken two-context journey — seed + EPUB-with-images ingestion → views/search/tag organize → .md add → metadata override → TOC turn → cross-block highlight (two-slice mark) → Highlights jump-back → export-with-images → wipe/import → byte-equal restoration across seven row kinds including Blob asset rows on chromium/firefox (webkit riding the documented D21-11 skip) — plus D21-15: zipSlip's three lint errors closed behavior-identically, npm run lint green repo-wide**

## Performance

- **Duration:** 31 min
- **Started:** 2026-09-01T14:19:37Z
- **Completed:** 2026-09-01T14:51:06Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- The v2.1 core flow is proven WITHOUT LOSS as a single continuous journey (D21-13) on real machinery: raw IndexedDB rows byte-equal after export → wipe → import across articles, highlights, notes, locations, settings, books, AND asset rows (chromium/firefox); the traveled cross-block highlight re-resolves confident through the shipped resolver and renders BOTH its slices; the override title, deep position restore, page-count identity, and the reimported chapter figure's local blob: img all prove on machine B.
- The images arm is real end-to-end: an EPUB-with-images uploaded through the Add dialog writes genuine D20-15 Blob asset rows (fixture-registry images never travel — RESEARCH A4); the exported bundle's asset zip entry is byte-equal to the fixture PNG with matching sha256, and the reimported figure decodes (naturalWidth > 0) from a blob: src on machine B.
- Webkit boundary honesty (D21-11): the whole journey is an image-save cell on webkit (the Blob-writing ingestion is inseparable from it), carried as the sixth documented skip citing the Phase 20 deferred-items ledger — chromium + firefox prove every affected flow; the five existing skip sites and the ACPT-06 template spec verified byte-stable.
- D21-15 closed: two line-scoped, inline-justified `no-control-regex` disables (the control-character escapes ARE the guards' payload) + one redundant forward-slash escape removal in `src/portability/zipSlip.ts` — `npm run lint` exits 0 repo-wide for the first time since Phase 9, with both zip-slip regression nets byte-stable and green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the v2.1 core-flow spine spec (one unbroken journey, two contexts)** — `68f0245` (test)
2. **Task 2: D21-15 zipSlip lint closure — three errors, behavior-identical** — `729d86b` (fix; includes the Rule 3 eligibility-matrix collateral)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `tests/e2e/portability/v21-core-flow-spine.spec.ts` (NEW, 774 lines) — the ACPT-07 instrument: one journey test, test.setTimeout 120s, two browser contexts, zero fixed sleeps, imports from non-spec modules only (_portability, _fixtures, add-dialog, markdown-payload, unit/server/epub-fixtures, src schemas)
- `src/portability/zipSlip.ts` — the three D21-15 lint fixes (two justified line-scoped disables + the escape removal); no behavior change (21/21 unit + 6/6 e2e regression cells green)
- `tests/e2e/annotations/eligibility-matrix.spec.ts` — the Rule 3 collateral fix (no-unexpected-multiline: member access split across lines); behavior-identical, 63/63 cells green on 3 engines

## Decisions Made
- Journey sequencing: the location scroll-save is machine A's LAST write (after the review-arm jump, which itself scrolls) so the frozen pre-export rows can never race a later debounce — the offset poll confirms the save landed before the freeze.
- The metadata-edit arm edits the ingested .md article (bundled fixtures have no edit affordance — the fixture gate); the override travels in the article row and proves on machine B's row + article h1.
- The import preview/status sentences are computed from the downloaded bundle's own counts rather than hardcoded — the assertion tests the dialog's pluralization contract against ground truth (4 articles, 1 highlight, 0 notes, 2 reading positions).
- Books included in the byte-equality set (see key-decisions): the corpus has a book, so "without loss" covers it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repo-wide lint had one error outside zipSlip**
- **Found during:** Task 2 (the `npm run lint` acceptance gate)
- **Issue:** The D21-15 acceptance criterion requires `npm run lint` exit 0 repo-wide, but a pre-existing `no-unexpected-multiline` error in `tests/e2e/annotations/eligibility-matrix.spec.ts:424` (member access `[i]` split across lines from its object) survived alongside zipSlip's three.
- **Fix:** Extracted the list item to its own line inside the arrow function — a behavior-identical restructure with a D21-15 citation comment.
- **Files modified:** tests/e2e/annotations/eligibility-matrix.spec.ts
- **Verification:** `npm run lint` exits 0 repo-wide; `npx tsc --noEmit` clean; the spec re-ran 63/63 green across chromium/firefox/webkit (behavior-identical proven)
- **Committed in:** 729d86b (Task 2 commit)

**2. [Rule 1 - Bug] eslint-disable-next-line adjacency (self-inflicted, fixed before commit)**
- **Found during:** Task 2 (first lint re-run)
- **Issue:** Wrapping the disable justification across multiple comment lines pushed the directive away from the offending line — ESLint reported the directive unused and the error one line lower.
- **Fix:** Single-line directives with the justification as the inline `--` description, directly above each regex.
- **Files modified:** src/portability/zipSlip.ts
- **Verification:** `npx eslint src/portability/zipSlip.ts` exit 0, no output; exactly two justified disables
- **Committed in:** 729d86b

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both required for the task's own acceptance gates. No scope creep — every byte-stability prohibition verified held (ACPT-06 template, the 5 documented webkit skip sites, both zip-slip regression nets: empty diff vs the pre-plan commit).

## Issues Encountered
Two spine iterations were needed before the green run (both resolved within the task):
- The view-switcher links carry live counts in their accessible names ("Unread (9)") — exact-name clicks never resolved; fixed with /^Label \(\d+\)$/ regex matching.
- The cross-block highlight's shared data-highlight-id resolves to TWO marks (one per containing block — the D5-16 contract); a bare toBeVisible hit strict mode. The fix asserts the count (2), which is itself the stronger cross-block proof.

## Verification Evidence
- Spine (plan verify command, final re-run): **2 passed (chromium 8.6s, firefox 11.0s) + 1 skipped (webkit, documented)** — exit 0, skip reported as skipped not failed.
- Task 1 acceptance greps: exactly one `test(` at file scope; `test.setTimeout(120_000)`; two `browser.newContext()` calls; `selectRangeBetweenBlocks` imported from `../annotations/_fixtures`; webkit `test.skip` citing deferred-items (2 mentions); zero `waitForTimeout`; 774 lines ≥ 150 min_lines.
- Byte-stability: `git diff --stat <pre-plan>..HEAD` EMPTY for core-flow-spine.spec.ts, the 5 documented webkit skip sites (offline-reopen, round-trip, import-preview, epub-intake, happy-path), zip-slip.test.ts, zip-slip-regression.spec.ts.
- Task 2 gates: `npx eslint src/portability/zipSlip.ts` exit 0 silent; exactly two justified `eslint-disable-next-line no-control-regex`; `npm run lint` exit 0 repo-wide; zip-slip unit net 21/21; zip-slip e2e net 6/6 (3 engines); eligibility-matrix 63/63 (3 engines); `npx tsc --noEmit` clean.
- No untracked files left behind (test-results is gitignored output).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ACPT-07 closed with the integrated spine green on the full matrix (webkit image boundary recorded as reduced-gate honesty per D21-11); D21-15 closed with the lint gate green.
- Ready for 21-06 (ACPT-08 protocol v1.3 + edge-matrix extensions + the honest full-suite gate over a now lint-clean tree).
- The asset-row createdAt re-stamping divergence (applyImport never travels it) is documented in the spine's comments — if a future plan wants true full-row byte equality, that is an export-schema change (Rule 4 territory).

## Self-Check: PASSED

- Key files exist on disk: tests/e2e/portability/v21-core-flow-spine.spec.ts (774 lines), src/portability/zipSlip.ts + tests/e2e/annotations/eligibility-matrix.spec.ts modified.
- Commits exist in git log: 68f0245 (test), 729d86b (fix).
- Plan-level verification re-run post-commit: spine 2 passed + 1 documented webkit skip, exit 0; zip-slip unit 21/21; npm run lint exit 0.

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
