---
phase: 19-cross-block-highlights
plan: 01
subsystem: annotations
tags: [selection, range-api, grapheme-offsets, textposition-selector, capture, react, playwright, vitest]

# Dependency graph
requires:
  - phase: 05-annotations
    provides: captureSelection single-block path, D5-07 eligibility switch, D5-08 slice math, D5-13 overlap check, toolbar hint channel
  - phase: 04-pagination-mvp
    provides: data-block-index 1:1 mapping, data-block-grapheme-start slice attributes, measurement-body defense
provides:
  - Endpoint-composed span capture (captureSelection composes ONE global TextPositionSelector from the two endpoints alone — no intermediate-block DOM walk)
  - CaptureResult reason taxonomy {empty, ineligible, measurement-body, boundary-ineligible, empty-span} with multi-block retired across all three unions
  - Figure captionLocalStart alignment (Pitfall 1 fixed — caption endpoints store true article-global offsets)
  - The ONE new reader-facing string (boundary-ineligible toolbar hint) + one retired string (single-block hint)
  - tests/e2e/annotations/span-capture.spec.ts (scrolling + paginated-within-page + span-overlap cells)
affects: [19-02 excerpts, 19-03 rendering + first-slice id, 19-04 paginated twin, 19-05 eligibility matrix]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Endpoint-only span composition: global range derives from two per-endpoint resolutions (findBlockAncestor → index → eligibility → caption/slice window → point map); the single-block path is the degenerate same-code case"
    - "Window-then-offset alignment layering: figure captionLocalStart + D5-08 sliceStart compose additively (figures are pagination-atomic, so the windows never overlap in practice)"
    - "Compile-time-forced union atomicity: retiring a reason literal breaks every comparison site (TS2367), keeping the capture.ts → HighlightOverlay → SelectionToolbar chain in one commit"

key-files:
  created:
    - tests/e2e/annotations/span-capture.spec.ts
  modified:
    - src/annotations/capture.ts
    - src/reader/annotations/HighlightOverlay.tsx
    - src/reader/annotations/SelectionToolbar.tsx
    - src/routes/ArticleView.tsx
    - tests/unit/annotations/capture-offset-mapping.test.ts
    - tests/e2e/annotations/capture-rejects.spec.ts

key-decisions:
  - "D5-08 measurement-body defense extended to BOTH Range endpoints — the retired element-equality gate used to catch visible→hidden-body pairs incidentally; cross-page refusal preserved without it (ANNO-13 stays Future)"
  - "jsdom Range semantics verified empirically: setEnd-then-setStart construction order yields the identical normalized boundary points (the honest backwards-drag cell); a genuinely reversed construction collapses per DOM Standard"
  - "empty-span is REACHABLE, not just defensive: a non-collapsed whitespace-only selection over text normalizeRunText collapses composes start === end (unit cell f proves it)"
  - "ANNO-12 stays open until 19-05's eligibility matrix (04-02 PAGE-01 split precedent); ANNO-08 closes here"

patterns-established:
  - "Per-endpoint resolution helper (resolveSelectionEndpoint) returning reason-only refusals with NO position — the D19-05 no-narrowing contract is structural"
  - "Reason union changes must be compile-atomic across the three-union chain — let TS2367 enforce the key_link"

requirements-completed: [ANNO-08]

# Metrics
duration: 13 min
completed: 2026-08-30
status: complete
---

# Phase 19 Plan 01: Span Capture Summary

**Endpoint-composed span capture: cross-block selections now store ONE article-global TextPositionSelector (multi-block gate retired, figure alt-offset fixed, boundary-ineligible + empty-span refusal taxonomy landed with one new toolbar string)**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-30T23:08:52Z
- **Completed:** 2026-08-30T23:21:51Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `captureSelection` composes the global range from the two endpoints alone (19-RESEARCH Pattern 1): per-endpoint `findBlockAncestor` → index parse → eligibility → D5-08 slice math → point mapping; no intermediate-block DOM walk; single-block is the degenerate same-code case
- Pitfall 1 fixed: figure caption endpoints align via `captionLocalStart` (alt graphemes + BLOCK_SEPARATOR when alt non-empty; 0 via the filter(Boolean) join when empty) — stored offsets now address the true normalized passage
- Reason taxonomy: `"multi-block"` retired in all three unions (capture.ts, HighlightOverlay, toolbar ternary); `"boundary-ineligible"` (D19-05 reject-whole) + `"empty-span"` (defensive, mirrors schema refine) added; every refusal is reason-only — NO position
- ONE new reader-facing string (`This selection includes content that can't be highlighted.`), ONE retired (`Select within a single block to highlight it.`); empty-span maps to the existing empty copy; buttons byte-stable (D19-09)
- D19-07 proven in real browsers: a cross-block span overlapping an existing highlight refuses with the existing overlap hint (zero math change to `rangesOverlap` — caller discipline only)
- Honest churn landed on the three sanctioned surfaces: unit D5-06 case → span-success with exact composed offsets; e2e two-block refusal cell moved to the new `span-capture.spec.ts` as success cells (scrolling + paginated-within-page)

## Task Commits

Each task was committed atomically:

1. **Task 1: Endpoint-composed span capture in capture.ts** - `f9f1580` (feat)
2. **Task 2: Sync the three reason unions + toolbar refusal copy** - `8b833fc` (docs)
3. **Task 3: Unit matrix flips + the moved e2e success cell** - `c8e88f8` (test)

## Files Created/Modified
- `src/annotations/capture.ts` - span capture core: per-endpoint resolver, caption alignment, both-endpoint measurement-body defense, new reason union
- `src/reader/annotations/HighlightOverlay.tsx` - `CreateFromSelectionResult.reason` synced (one commit with capture.ts per key_link)
- `src/reader/annotations/SelectionToolbar.tsx` - hint ternary rewired (boundary-ineligible branch, empty-span → empty copy, multi-block branch gone)
- `src/routes/ArticleView.tsx` - doc-comment vocabulary only
- `tests/unit/annotations/capture-offset-mapping.test.ts` - D5-06 flip + cells (a)-(f)
- `tests/e2e/annotations/capture-rejects.spec.ts` - keeps ONLY overlap + measurement-body tests; header documents the D19 move
- `tests/e2e/annotations/span-capture.spec.ts` - NEW: scrolling span, paginated within-page span, D19-07 span-overlap cells

## Decisions Made
- **Measurement-body check on both endpoints** — retiring the `startBlock !== endBlock` element-equality gate would have let visible→hidden-body pairs capture (both elements share the same data-block-index); the explicit D5-08 `.closest(".article-body-measurement")` check now runs on BOTH Range endpoints, preserving the cross-page refusal (test 3 byte-stable, green on 3 engines)
- **Defensive containment check added to the endpoint resolver** (`readingRoot.contains(blockEl)`) — makes findBlockAncestor's documented "contained within root" contract actually true; the doc comment previously overpromised
- **Backwards-Range cell uses reverse construction order** (setEnd on the later block first, setStart second) — empirical jsdom verification showed a genuinely reversed construction collapses per the DOM Standard; reverse-order construction yields the identical normalized boundary points, matching how browsers finalize backwards drags
- **`blockIndex` retained on the ok-variant carrying the START endpoint's index** — grep confirmed no consumer reads it (only `.ok`/`.position`); documented in the union's doc comment
- **ANNO-12 stays Pending** — the tested eligibility matrix is Plan 19-05 (04-02 PAGE-01 split precedent); this plan ships the refusal mechanism + taxonomy, the matrix proves coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Minimal unit-expectation flips moved into Task 1's commit**
- **Found during:** Task 1 (union change)
- **Issue:** Task 1's `<verify>` gate (`npx vitest run capture-offset-mapping.test.ts`) cannot pass after the union change while the D5-06 and unsupported-reason expectations still assert the retired literals — the flips were scheduled for Task 3
- **Fix:** The two directly-affected expectations (D5-06 case → span-success with exact composed offsets {start:2,end:17}; unsupported reason → boundary-ineligible with no-position assertion) landed in Task 1's commit with D19 citation comments; Task 3 added the new cells (a)-(f) as planned
- **Files modified:** tests/unit/annotations/capture-offset-mapping.test.ts
- **Verification:** Task 1 gate green (9/9); Task 3 gate green (17/17)
- **Committed in:** f9f1580 (Task 1 commit)

**2. [Rule 3 - Blocking] SelectionToolbar ternary + HighlightOverlay union joined Task 1's commit**
- **Found during:** Task 1 (typecheck)
- **Issue:** TS2367 breaks the build the moment `"multi-block"` leaves the union (the comparison site has no overlap) — the plan's own key_link mandates "both unions change in ONE commit"; the ternary is compile-atomic with the union
- **Fix:** Task 1 landed capture.ts + HighlightOverlay union + SelectionToolbar ternary; Task 2 completed the remaining doc-vocabulary updates (HighlightOverlay/SelectionToolbar/ArticleView comments) and ran the grep gates + byte-stability checks — every Task 2 acceptance criterion passes
- **Files modified:** src/reader/annotations/HighlightOverlay.tsx, src/reader/annotations/SelectionToolbar.tsx
- **Verification:** tsc clean after each task; Task 2 grep gates pass (quoted literal gone from src/, retired copy gone, new string present, rangesOverlap call untouched, buttons byte-stable)
- **Committed in:** f9f1580 (union + ternary), 8b833fc (doc vocabulary)

**3. [Rule 2 - Missing Critical] D19-07 span-overlap e2e cell added to span-capture.spec.ts**
- **Found during:** Task 3 (spec authoring)
- **Issue:** The plan's must_haves truth "A new span (single- or cross-block) overlapping any existing highlight's global range is refused with the existing overlap hint (D19-07)" had no proving cell in Task 3's enumerated action
- **Fix:** Added a third cell (scrolling mode: single-block highlight first, then span from inside it into the next block → overlap hint, no buttons, H no-op, count stays 1)
- **Files modified:** tests/e2e/annotations/span-capture.spec.ts
- **Verification:** Green on chromium/firefox/webkit
- **Committed in:** c8e88f8 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking sequencing/compile-atomicity, 1 missing critical proof)
**Impact on plan:** All fixes preserve the plan's per-task green-gate discipline and its own key_link/one-commit mandates. No scope creep — every change is on a sanctioned surface.

## Issues Encountered
- A ~3-hour-old Vite dev server was serving :5173 (predating this plan's source changes). Killed it before the e2e run per the Phase 18 webkit-starvation lesson; Playwright started a fresh server and all 15 target cells + the full 186-cell annotations directory passed first try.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Span capture core is complete: 19-02 (first-fragment excerpts) can build on spans that now exist; 19-03 (list/caption/code rendering + first-slice-only id) consumes the same global ranges; 19-05 closes ANNO-12's matrix
- Known follow-ups owned by later plans: duplicate DOM `id="hl-<id>"` across a span's marks (Pitfall 2 — fix is 19-03; deliberately NOT asserted in this plan's specs), caption/code mark rendering (19-03), eligibility matrix (19-05)
- No blockers

---
*Phase: 19-cross-block-highlights*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 8 key-files exist on disk; all 3 task commits (f9f1580, 8b833fc, c8e88f8) found in git log. Plan-level verification re-confirmed: unit 17/17 green, target e2e 15/15 green on chromium/firefox/webkit, grep gates pass (no `"multi-block"` literal in src/, no retired copy in src/), `git diff f9f1580~1..c8e88f8 --stat` shows zero changes under src/content/schema.ts, src/persistence/, src/content/normalizeText.ts.
