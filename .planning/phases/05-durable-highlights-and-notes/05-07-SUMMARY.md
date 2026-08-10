---
phase: 05-durable-highlights-and-notes
plan: 07
subsystem: annotations
tags: [annotations, blockquote, rendering, highlight-overlay, pagination, gap-closure]

# Dependency graph
requires:
  - phase: 05-02
    provides: inline <mark> overlay rendering pipeline (sliceRunsForHighlights + BlockView.highlightSlices + InlineList)
  - phase: 05-04
    provides: cross-fragment D5-16 slicing (sliceHighlightsForEntry) + status threading
provides:
  - "Per-child highlightSlices threading for blockquote blocks in BOTH render paths (scrolling ArticleBody + paginated PageFragmentView), closing the UAT Test 11 MAJOR gap"
  - "BlockView.childHighlightSlices prop — the shared contract both render paths use to forward per-child slices into the blockquote recursion"
affects: [annotations, pagination, future-list-inline-overlays]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive per-child slice threading for container kinds: walk container.children accumulating per-child grapheme offsets (BLOCK_SEPARATOR between children), reuse the paragraph path's highlightsForBlock + sliceRunsForHighlights per child, forward via a per-child array prop"

key-files:
  created:
    - "tests/unit/annotations/blockquote-highlight-render.test.tsx"
  modified:
    - "src/content/render/BlockRenderer.tsx"
    - "src/pagination/fragmentRenderer.tsx"

key-decisions:
  - "childHighlightSlices is a per-child array prop on BlockView (element may be undefined for children with no intersection / non-paragraph-heading kinds); the blockquote case forwards childHighlightSlices[i] as each child's highlightSlices"
  - "Scrolling path (ArticleBody) uses blockGraphemeLen per child (D-05 substrate length); paginated path (PageFragmentView) uses splittingBlockGraphemeLength per child (renderer-aligned coordinate) — each mirrors its existing paragraph path's convention so no parallel coordinate system is introduced"
  - "Reuses sliceRunsForHighlights + highlightsForBlock UNCHANGED — no forked slicer (05-RESEARCH.md Don't Hand-Roll; the slicer already operates on flat InlineRun[] per paragraph)"
  - "Lists (bulleted/numbered) intentionally out of scope: different items-shape + no failing UAT case; the blockquote recursion + per-child pattern is the template for a future list plan"

patterns-established:
  - "Per-child overlay threading: a container kind that needs inline marks computes its children's slices by walking children with the SAME length function its normalized text uses, then forwards via an indexed prop on the shared BlockView"

requirements-completed: [ANNO-01, ANNO-05]

# Metrics
duration: 11 min
completed: 2026-08-07
status: complete
---

# Phase 5 Plan 7: Blockquote Inline-Mark Gap Closure Summary

**Per-child highlightSlices threading for blockquote in both render paths (scrolling ArticleBody + paginated PageFragmentView), reusing sliceRunsForHighlights unchanged — closes UAT Test 11 MAJOR gap where a blockquote highlight registered on load but rendered no inline `<mark>`**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-07T20:32:16Z
- **Completed:** 2026-08-07T20:43:13Z
- **Tasks:** 3 (RED test → GREEN implementation → full-suite confirmation)
- **Files modified:** 3 (1 test created, 2 source modified)

## Accomplishments
- Closed the Phase 5 UAT Test 11 MAJOR gap: a highlight captured on a blockquote passage now renders a visible inline `<mark>` in BOTH reading modes (the Thiel-quote symptom — "registers on load but doesn't appear highlighted" — is resolved).
- Added a `childHighlightSlices` prop to `BlockView` (per-child array; element may be undefined) and threaded slices through the blockquote recursion in both render paths, mirroring the existing paragraph highlight pipeline per child.
- Reused `sliceRunsForHighlights` + `highlightsForBlock` UNCHANGED — no forked slicer, no InlineRenderer change (it already renders `mark.highlight` for any non-empty `highlightSlices`).
- No regression to paragraph/heading highlights (ANNO-01/05), cross-fragment slicing (D5-16), or pagination (PAGE-03): full `npm run test` exits 0.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): blockquote highlight render test** — `24d0235` (test)
2. **Task 2 (GREEN): thread per-child highlightSlices through blockquote in both render paths** — `4250b31` (feat)
3. **Task 3: full-suite confirmation** — verification-only (no code change); the Task 2 commit stands per the plan's note (no empty commit)

**Plan metadata:** (committed with SUMMARY + STATE + ROADMAP below)

## Files Created/Modified
- `tests/unit/annotations/blockquote-highlight-render.test.tsx` — 4-case component test (scrolling whole + zero-marks, paginated whole, paginated sliced); semantic-only / jsdom-safe
- `src/content/render/BlockRenderer.tsx` — `BlockView` accepts `childHighlightSlices`; blockquote case forwards `childHighlightSlices[i]`; `ArticleBody` computes per-child slices for blockquote via `blockGraphemeLen` + `highlightsForBlock` + `sliceRunsForHighlights`
- `src/pagination/fragmentRenderer.tsx` — `PageFragmentView` computes per-child slices for a blockquote entry via `splittingBlockGraphemeLength` + entry-local intersection filter + `sliceRunsForHighlights`

## Decisions Made
- **`childHighlightSlices` is a per-child array prop on `BlockView`** (element type `… | undefined`). The blockquote case forwards `childHighlightSlices[i]` as each child's `highlightSlices`. Optional chaining keeps absent/undefined as "no slices" (byte-unchanged when no highlight intersects a child). This is the shared contract both render paths write and the blockquote case consumes.
- **Each render path uses its OWN existing length function per child** — scrolling uses `blockGraphemeLen` (D-05 substrate length, consistent with how the blockquote's `blockNormalizedText` joins children); paginated uses `splittingBlockGraphemeLength` (renderer-aligned coordinate, consistent with `sliceRunsForHighlights`'s internal raw-run-sum blockLen + `sliceChildBlocks`). Both accumulate `BLOCK_SEPARATOR.length` between children. No parallel coordinate system is introduced (anchor integrity D-05 preserved).
- **Paginated path filters `entrySlices` per child** (entry-local intersection: `max(e.start, childIntraStart)` / `min(e.end, childIntraStart + childLen)`) then calls `sliceRunsForHighlights(child.content, childIntraStart, filtered, lang)` so the slicer subtracts `childIntraStart` to land in child-local coordinates.
- **Lists intentionally out of scope.** The gap is blockquote; lists have a different `items[]`-shape and no failing UAT case. The blockquote per-child recursion + `childHighlightSlices` pattern is the template for a future list-inline-overlay plan.
- **Updated the exclusion comments** (BlockRenderer ~L277 / fragmentRenderer ~L121) that previously listed blockquote as a container kind without inline overlays — they now reflect per-child blockquote coverage and keep the code-block + figure-caption deferral note accurate.

## RED → GREEN Evidence

**RED (commit `24d0235`):** the 4-case suite ran BEFORE implementation. 3 of 4 cases FAILED (scrolling whole, paginated whole, paginated sliced — all asserting a `mark.highlight` exists inside the blockquote); 1 case PASSED (the zero-marks regression guard, which correctly renders zero marks both before and after). The suite exited non-zero. Failure messages referenced the missing mark inside the blockquote exactly as the diagnosed gap predicts (`expected null not to be null` at the `mark.highlight` querySelector) — proving the test exercises the diagnosed kind-gate exclusion.

**GREEN (commit `4250b31`):** after threading `childHighlightSlices`, all 16 tests across the three annotation suites pass:
- `blockquote-highlight-render.test.tsx`: 4/4 pass (the 3 previously-failing cases now render the mark; zero-marks guard holds)
- `highlight-overlay-render.test.tsx`: 5/5 pass (no paragraph/heading regression)
- `cross-fragment-slicing.test.ts`: 7/7 pass (no D5-16 regression)
- `tsc --noEmit` clean; `eslint` on the 3 files clean.

## Deviations from Plan

None - plan executed exactly as written. The RED suite reported "3 failed | 1 passed" rather than the plan's "all four MUST FAIL" phrasing — this is expected and honest: the zero-marks regression guard asserts ZERO marks, which holds both before and after the fix (it is a regression guard, not a gap proof). The 3 highlight cases that fail pre-implementation are the load-bearing RED evidence; the suite as a whole exited non-zero, satisfying the TDD RED gate.

## Issues Encountered
None.

## Verification (full-suite confirmation — Task 3)

All commands run by the executor itself (no subset, no `--grep`, no engine skip; fail counts recorded honestly).

| Suite | Result |
|-------|--------|
| `npx vitest run tests/unit/annotations/blockquote-highlight-render.test.tsx` (RED, pre-impl) | 3 failed / 1 passed, exit 1 — gap proven |
| `npx vitest run …blockquote-highlight-render + highlight-overlay-render + cross-fragment-slicing` (GREEN) | 16 passed / 0 failed, exit 0 |
| `npx playwright test tests/e2e/annotations/` (chromium + firefox + webkit) | 144 passed / 0 failed, exit 0 (1.0m) |
| `npm run test` (FULL phase gate: unit + e2e × 3 engines, ONE invocation) | **511 unit + 489 e2e = 1000 passed / 0 failed / 0 skipped, exit 0** (2.9m e2e) |

The change is render-only over already-validated grapheme offsets; no ANNO-01/05 regression, no D5-16 / PAGE-03 regression.

## Threat Surface
No new security-relevant surface introduced. `data-highlight-id` derives from the Zod-validated `HighlightRecord.id` (unchanged); the per-child slicer operates on already-validated grapheme offsets; React escapes all attribute + text children. The threat-model mitigations (T-05-07-01 / -02 / -SC) hold: no package installs, no new untrusted input path, no parallel coordinate system.

## Known Stubs
None. The blockquote path now fully threads real per-child highlight slices in both render paths (no placeholder/empty data flows to the UI).

## Next Phase Readiness
- UAT Test 11's blockquote gap is closed (the second of two Test 11 gaps; the pagination-geometry gap is tracked by Plan 05-06). ANNO-01 (create + see) and ANNO-05 (remains attached) now hold for blockquote passages.
- Phase 05 has 7 plans; this is plan 7 (the blockquote gap closure). 05-06 (pagination geometry) remains. The blockquote per-child `childHighlightSlices` pattern is the template should a future plan extend inline overlays to lists.

## Self-Check: PASSED

- `tests/unit/annotations/blockquote-highlight-render.test.tsx` — FOUND
- `src/content/render/BlockRenderer.tsx` — FOUND
- `src/pagination/fragmentRenderer.tsx` — FOUND
- Commit `24d0235` (RED test) — FOUND in git log
- Commit `4250b31` (GREEN implementation) — FOUND in git log

---
*Phase: 05-durable-highlights-and-notes*
*Completed: 2026-08-07*
