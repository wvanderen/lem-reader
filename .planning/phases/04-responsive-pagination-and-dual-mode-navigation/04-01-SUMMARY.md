---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 01
subsystem: pagination
tags: [pagination, zod, intl-segmenter, range-getclientrects, grapheme-offsets, widow-rules, diagnostic-bus]

# Dependency graph
requires:
  - phase: 03-trustworthy-layout-measurement
    provides: MeasurementResult + BlockMeasurement + DiagnosticBus + AbortError + font gate
  - phase: 01-canonical-article-foundation
    provides: CanonicalArticle + Block union + InlineRun + graphemeClusters + BLOCK_SEPARATOR + normalizeText
  - phase: 02-accessible-scrolling-reader
    provides: normalizeElText (per-block DOM text rule reused for D-05 offset math)
provides:
  - Zod-versioned PageFragment + FragmentationResult contracts (schemaVersion 1)
  - LineBox type + readLineBoxes DOM read-phase + charOffsetToGrapheme UTF-16→grapheme bridge
  - classifyBlock exhaustive-switch (D4-02 atomic/splitting classification)
  - splitParagraphRuns inline-run slicer preserving marks on both halves (Pitfall 4)
  - HEADING_WIDOW_LINES + SPLIT_WIDOW_LINES + applyHeadingWidow + applyLineWidowOrphan (D4-03/D4-04)
  - paginateDocument pure orchestrator with the three PAGE-04 termination guards
affects: [04-03-paginated-vertical-slice, 04-04-dual-mode-navigation, 04-05-fallback-banner, 05-durable-highlights]

# Tech tracking
tech-stack:
  added: []  # Phase 4 installs zero packages (T-04-SC: no supply-chain surface)
  patterns:
    - "Zod-at-boundary for engine output (PageFragmentSchema + FragmentationResultSchema mirror MeasurementResultSchema discipline)"
    - "Exhaustive BlockKind switch with no default (Pattern F — TS flags missing cases at compile time)"
    - "Batched DOM read-phase: querySelectorAll + every Range.getClientRects() walk before any page construction (Pitfall 2)"
    - "D-05 substrate reuse: graphemeClusters + blockNormalizedText + charOffsetToGrapheme imported, never forked (Pitfall 3)"
    - "DOM-truth split points: Range.getClientRects line boxes mapped to grapheme offsets; Pretext NEVER imported in src/pagination/ (Pitfall 1 + calibration fingerprint)"
    - "Three-guard termination policy (PAGE-04): 0.75 atomic-oversize threshold, 300-page ceiling, zero-progress/unsplittable-block-overflow"

key-files:
  created:
    - src/pagination/types.ts
    - src/pagination/lineBoxes.ts
    - src/pagination/splitBlock.ts
    - src/pagination/widowRules.ts
    - src/pagination/fragment.ts
    - tests/unit/pagination/lineBoxMapping.test.ts
    - tests/unit/pagination/fragmentOrder.test.ts
    - tests/unit/pagination/widowRules.test.ts
    - tests/unit/pagination/termination.test.ts
  modified: []

key-decisions:
  - "SplitDecision simplified to {kind:'atomic'} | {kind:'split'} — Task 1 had over-specified splitAtGrapheme on the split variant, but classifyBlock is a pure block.kind→classification switch; the actual split offset is computed downstream by the orchestrator using line boxes + widow rules. Removed splitAtGrapheme so the type matches the natural code shape."
  - "MVP engine assumes 1:1 article.blocks ↔ querySelectorAll elements (holds for top-level paragraph/heading/figure/code/footnote/unsupported). Container kinds (blockquote + bulleted/numbered lists) render extra selector matches and currently trip block-element-mismatch fallback; Plan 03's recursive fragment renderer will land the container path."
  - "chooseSplit re-tries on a fresh page after flush when the current page is too full for a widow-legal split. This handles the common case where the previous block's after-slice nearly filled the page, leaving too little room for the next paragraph's 2-line widow minimum."
  - "Widow adjustment must verify the before-slice actually fits on the current page (not just satisfy the 2/2 line-count rule). Otherwise the engine would emit overflowing page-1 entries when the candidate is line 0 (no line fits) but the orphan bump pushes the split to SPLIT_WIDOW_LINES."
  - "Atomic oversize threshold is strictly-greater-than (> 0.75): a block at exactly 75% is allowed; 75.0001% triggers fallback. Edge case is unit-tested."
  - "applyHeadingWidow falls back to heading-only height check when the following block has fewer than HEADING_WIDOW_LINES (=2) lines — the rule can't anchor meaningfully without enough following lines, so we just verify the heading itself fits."

patterns-established:
  - "Pattern: src/pagination/* is the project-owned pagination engine — pure domain logic, NO React, NO persistence (STACK.md forbids persisting derived page boundaries)"
  - "Pattern: every per-kind switch over block.kind is exhaustive with NO default branch (splitBlock classifyBlock mirrors measurement/engine chooseStrategy + content/normalizeText blockText + content/render BlockView)"
  - "Pattern: line-box→grapheme conversion goes through charOffsetToGrapheme (the single bridge between DOM Range UTF-16 offsets and the D-05 grapheme substrate) — never re-implement"
  - "Pattern: dom-fallback diagnostic is the engine's only reader-visible failure signal; pages=[] + reason=... describes which guard tripped (Phase 4 PAGE-09 surfaces this)"

requirements-completed: [PAGE-03, PAGE-04]

# Metrics
duration: 13min  # Task 2 only (Task 1 was committed in a prior session)
completed: 2026-08-06
status: complete
---

# Phase 04 Plan 01: Pagination Engine Summary

**Pure project-owned pagination engine under `src/pagination/` — Zod-versioned PageFragment/FragmentationResult contracts, DOM Range.getClientRects line-box read-phase mapped to D-05 grapheme offsets, per-kind fragmentation (atomic vs splitting), D4-03/D4-04 widow rules, and a three-guard termination policy (0.75 oversize / 300-page ceiling / zero-progress) producing exactly-once canonical-order source ranges.**

## Performance

- **Duration (Task 2):** 13 min
- **Task 1 duration:** prior session (commit `260a6a6`)
- **Started (Task 2):** 2026-08-06T14:18:55Z
- **Completed:** 2026-08-06T14:31:56Z
- **Tasks:** 2/2 complete
- **Files created:** 9 (5 source + 4 test)
- **Files modified:** 1 (src/pagination/types.ts SplitDecision simplification)

## Accomplishments

- **Pagination contracts (Task 1, prior commit `260a6a6`):** `PageFragmentSchema` + `FragmentationResultSchema` (schemaVersion literal 1) + `LineBox` + `SplitDecision` types — Zod-at-boundary source of truth mirroring `src/measurement/types.ts` discipline.
- **DOM line-box read-phase (Task 1, prior commit):** `readLineBoxes(el, fullText, signal)` walks `Range.getClientRects()` over a block's text node and records one `LineBox` per CSS line box; `charOffsetToGrapheme` maps UTF-16 code-unit offsets to D-05 grapheme ordinals via `graphemeClusters`. Reuses `normalizeElText` (Pitfall 3 — no forked normalization).
- **Per-kind fragmentation policy (Task 2):** `classifyBlock(block)` exhaustive switch over `block.kind` (no default) classifies 9 BlockKinds into atomic (figure/heading/code-block/footnote-reference/unsupported) vs splitting (paragraph/blockquote/bulleted-list/numbered-list) per D4-02.
- **Inline-run splitting primitive (Task 2):** `splitParagraphRuns(runs, splitAtGrapheme, lang)` walks runs via `graphemeClusters(run.text, lang)`, slices the boundary run at the intra-run grapheme offset, BOTH halves inherit the run's marks verbatim (Pitfall 4 — a link run split mid-text becomes two link runs with the same href).
- **Widow rules (Task 2):** `HEADING_WIDOW_LINES = 2` + `SPLIT_WIDOW_LINES = 2`; `applyHeadingWidow` decides keep-vs-move for a heading at the page bottom; `applyLineWidowOrphan` adjusts a candidate split index to keep ≥2 lines on each side when the block has enough lines.
- **Pure orchestrator (Task 2):** `paginateDocument({article, measurement, articleEl, pageContentBoxHeightPx, diagnostics, signal})` walks `article.blocks` in canonical order, reads line boxes in one batched pass (Pitfall 2), applies widow rules, enforces the three PAGE-04 termination guards, emits `dom-fallback` via DiagnosticBus on fallback, returns a `FragmentationResult`. NEVER imports `@chenglou/pretext` (Pitfall 1 — DOM-truth split points per the calibration fingerprint).
- **Test coverage:** 39 unit specs across 4 files (13 lineBoxMapping + 15 widowRules + 4 fragmentOrder + 7 termination) prove the engine's contracts in jsdom with mocked `Range.getClientRects`. Real cross-engine layout truth lands in Plan 05's Playwright corpus matrix.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pagination contracts + DOM line-box read-phase** — `260a6a6` (feat) — committed in a prior session by another executor; verified intact and untouched by Task 2 (only the `SplitDecision` type comment + shape was simplified — see Deviations).
2. **Task 2: Fragmentation engine — per-kind split + widow rules + paginate orchestrator** — `20237e2` (feat)

**Plan metadata commit:** pending — this SUMMARY + STATE/ROADMAP updates commit will follow.

## Files Created/Modified

- `src/pagination/types.ts` (Task 1 created; Task 2 simplified `SplitDecision`) — Zod-versioned PageFragment + FragmentationResult + LineBox + SplitDecision contracts.
- `src/pagination/lineBoxes.ts` (Task 1) — DOM read-phase (`readLineBoxes`) + UTF-16→grapheme bridge (`charOffsetToGrapheme`) + `blockNormalizedText` wrapper.
- `src/pagination/splitBlock.ts` (Task 2) — per-kind fragmentation policy (`classifyBlock`) + inline-run slicer (`splitParagraphRuns`).
- `src/pagination/widowRules.ts` (Task 2) — D4-03 heading widow + D4-04 line widow/orphan pure helpers.
- `src/pagination/fragment.ts` (Task 2) — pure `paginateDocument` orchestrator with three termination guards.
- `tests/unit/pagination/lineBoxMapping.test.ts` (Task 1) — 13 specs covering readLineBoxes + charOffsetToGrapheme.
- `tests/unit/pagination/widowRules.test.ts` (Task 2) — 15 specs covering applyHeadingWidow + applyLineWidowOrphan.
- `tests/unit/pagination/fragmentOrder.test.ts` (Task 2) — 4 specs covering PAGE-03 exactly-once + canonical order + AbortSignal.
- `tests/unit/pagination/termination.test.ts` (Task 2) — 7 specs covering the three PAGE-04 termination guards.

## Decisions Made

(See `key-decisions` in frontmatter above for the canonical list.)

- **SplitDecision shape:** Task 1 had over-specified `splitAtGrapheme` on the `split` variant. Task 2 simplified it to a pure classification type — the orchestrator computes the offset separately using line boxes + widow rules. Documented as a deviation (Rule 2 — auto-fixed missing critical functionality: the original shape would have forced `classifyBlock` to compute the offset prematurely).
- **MVP container-block scope:** The engine assumes 1:1 `article.blocks` ↔ `querySelectorAll` elements. Container kinds (blockquote + bulleted/numbered lists) currently trip a `block-element-mismatch` fallback rather than emit wrong ranges. Plan 03's recursive fragment renderer will land the container path with full Plan 05 e2e coverage.
- **Atomic-oversize threshold semantics:** strictly-greater-than (`> 0.75`). A block at exactly 75% is allowed; 75.0001% triggers fallback. Tested at the boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] SplitDecision type simplified**
- **Found during:** Task 2 implementation (splitBlock.ts)
- **Issue:** Task 1's `types.ts` declared `SplitDecision = {kind:"atomic"} | {kind:"split"; splitAtGrapheme: number}`. But `classifyBlock` is a pure exhaustive switch over `block.kind` — it has no inputs (line boxes, page geometry) to compute `splitAtGrapheme`. The original shape forced either premature offset computation inside the classifier (coupling it to DOM/page-state, violating purity) or a placeholder value (`splitAtGrapheme: 0`) that lied about the actual split point.
- **Fix:** Simplified `SplitDecision` to `{kind:"atomic"} | {kind:"split"}`. The classification is pure block.kind → atomic-vs-split; the orchestrator computes the actual offset downstream via `chooseSplit` + `charOffsetToGrapheme`. Updated the type's header comment to document the rationale.
- **Files modified:** `src/pagination/types.ts`
- **Verification:** `npx tsc --noEmit` exits 0; all 39 pagination tests pass.
- **Committed in:** `20237e2` (part of Task 2 commit)

**2. [Rule 1 — Bug] chooseSplit produced overflowing before-slices when current page was nearly full**
- **Found during:** Task 2 test authoring (fragmentOrder.test.ts "4 short paragraphs" case)
- **Issue:** When the current page was exactly full (`currentPageHeightPx >= pageHeight`) and the next splitting block didn't fit, `chooseSplit` would still find a candidate line, apply the widow bump, and return a split plan whose before-slice didn't actually fit on the current page. The orchestrator then pushed the before-slice onto `currentPageBlocks` and incremented `currentPageHeightPx` past `pageHeight`, producing an overflowing page-1 entry.
- **Fix:** Added an early-return guard `if (currentPageHeightPx >= pageHeight) return null` at the top of `chooseSplit`, plus a post-widow-bump verification `if (currentPageHeightPx + beforeHeightPx > pageHeight) return null`. The orchestrator then flushes the current page and either places the block whole (if it fits on a fresh page) or re-tries the split with fresh-page geometry.
- **Files modified:** `src/pagination/fragment.ts`
- **Verification:** fragmentOrder.test.ts "4 short paragraphs across 2 pages" passes (2 pages × 2 entries each, no overflow).
- **Committed in:** `20237e2`

**3. [Rule 1 — Bug] chooseSplit didn't re-try on a fresh page after flush**
- **Found during:** Task 2 test authoring (termination.test.ts "page-count ceiling" case)
- **Issue:** When a splitting block couldn't produce a valid split on the current (partially-filled) page, the orchestrator moved it whole to the next page even when (a) the block fit whole on a fresh page, or (b) the block could split on a fresh page. This caused the 300-page ceiling test to fail (the engine packed only 1 block per page instead of 2-per-paragraph via splits, never hitting 300 pages) AND caused degenerate overflow chains where each subsequent page contained 1 whole paragraph exceeding the page height.
- **Fix:** Restructured Case C: when `chooseSplit` returns null on a non-empty current page, flush + re-evaluate. If the block fits whole on a fresh page (`heightPx <= pageHeight`), place whole; otherwise re-call `chooseSplit(lineBoxes, 0, pageHeight)` and only fall back if that also returns null. This handles the common case where the previous block's after-slice left too little room for the next paragraph's 2-line widow minimum.
- **Files modified:** `src/pagination/fragment.ts`
- **Verification:** termination.test.ts "pathological fixture producing >300 pages" now hits the page ceiling correctly (200 paragraphs × 2 pages each > 300 → fallback with reason `page-ceiling`).
- **Committed in:** `20237e2`

**4. [Rule 2 — Missing critical functionality] applyHeadingWidow edge case for short following blocks**
- **Found during:** Task 2 test authoring (widowRules.test.ts)
- **Issue:** When the following block had fewer than `HEADING_WIDOW_LINES` (=2) lines, `applyHeadingWidow` sliced `followingBlockLineBoxes.slice(0, 2)` (returning whatever was available) and added those heights to the heading's, producing a stricter check than the rule intends. The D4-03 rule needs ≥2 lines to anchor the heading; with fewer, the rule can't apply meaningfully.
- **Fix:** Added an explicit `if (followingBlockLineBoxes.length < HEADING_WIDOW_LINES) return { moveHeading: headingHeight > pageRemainingPx }` branch that falls back to a heading-only height check. Predictable, total, and matches the rule's intent.
- **Files modified:** `src/pagination/widowRules.ts`
- **Verification:** widowRules.test.ts "falls back to heading-only height check when following block has <2 lines" passes.
- **Committed in:** `20237e2`

---

**Total deviations:** 4 auto-fixed (1× Rule 2 missing functionality, 3× Rule 1 bugs)
**Impact on plan:** All auto-fixes necessary for correctness — the engine would produce overflowing pages, infinite-loop on adversarial input, or misclassify widow decisions without them. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above. Task 1 (prior commit) was intact and untouched by Task 2 except for the documented `SplitDecision` simplification.

## User Setup Required

None — no external service configuration required. Phase 4 installs zero packages (T-04-SC: no supply-chain surface).

## Next Phase Readiness

- **Ready for Plan 04-02:** The readingMode Zod value-shape evolution + Wave 0 e2e test infrastructure can proceed independently.
- **Ready for Plan 04-03:** The paginated vertical slice can consume `paginateDocument` + `PageFragment`/`FragmentationResult` types directly. The fragment renderer (`src/pagination/fragmentRenderer.tsx`) will need to interpret intra-block ranges by calling `splitParagraphRuns` to slice paragraph blocks (Plan 03's load-bearing D4-01 path).
- **Known MVP scope limit:** Container kinds (blockquote + bulleted/numbered lists) currently trip `block-element-mismatch` fallback. Plan 03's recursive fragment renderer + Plan 05's Playwright corpus matrix will exercise the container path.
- **Calibration fingerprint honored:** `@chenglou/pretext` is NOT imported anywhere in `src/pagination/` (verified via grep). Split points come exclusively from DOM `Range.getClientRects()` per the calibration finding that paragraphs are Pretext-ineligible (heightDriftP95 4.9–39.6px, breaksMatchRatio 0 across all 2592 sampled cells).

## Self-Check: PASSED

- All 9 files listed in `key-files.created` exist on disk (verified via `[ -f ... ]`).
- Both task commits (`260a6a6` Task 1, `20237e2` Task 2) exist in `git log --oneline --all`.
- `npm run test:unit -- --run tests/unit/pagination/` exits 0 (39 specs across 4 files).
- `npm run lint` exits 0 (no exhaustive-switch defaults, no Pretext import, no react/no-danger surface in this pure module).
- `npx tsc --noEmit` exits 0 (BlockKind import resolves; no parallel union declared).
- `npm run build` exits 0 (148 modules transformed).

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Plan: 01*
*Completed: 2026-08-06*
