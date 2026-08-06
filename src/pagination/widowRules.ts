// src/pagination/widowRules.ts
// Pure widow/orphan helpers (D4-03 + D4-04). Pure arithmetic over the
// LineBox[] produced by src/pagination/lineBoxes.ts — NO React, NO DOM
// reads, NO side effects. Mirrors src/settings/applyTheme.ts module
// discipline: header comment citing locked decisions, named exported
// constants, single-purpose pure functions.
//
// D4-03 (heading widow): a heading at the bottom of a page must keep at
// least the first HEADING_WIDOW_LINES (=2) lines of the following block
// on the same page; otherwise the heading moves to the next page (so a
// heading never sits orphaned at the page bottom with its first paragraph
// starting on the next page — the booklike calm D4-01 promises).
//
// D4-04 (line widow/orphan): when a splitting-kind block (paragraph +
// container kinds per D4-02) breaks across a page boundary, both sides
// keep at least SPLIT_WIDOW_LINES (=2) lines when the block has enough
// lines to support the rule. This prevents a single widow line at the
// bottom of one page or a single orphan line at the top of the next.
//
// These helpers are consultative: they return adjusted split indices /
// move-vs-keep decisions. The orchestrator (src/pagination/fragment.ts)
// decides whether to honor them given the global page budget.

import type { LineBox } from "./types";

/**
 * D4-03 heading widow: a heading keeps this many lines of the block that
 * follows it on the same page, else the heading moves to the next page.
 */
export const HEADING_WIDOW_LINES = 2;

/**
 * D4-04 line widow/orphan: minimum number of lines retained on each side
 * of an intra-block page break, when the block has at least 2x this many
 * lines to split.
 */
export const SPLIT_WIDOW_LINES = 2;

/**
 * D4-03 — decide whether a heading stays on the current page given the
 * page's remaining vertical budget.
 *
 * Computes the heading's vertical span (last.bottom - first.top) and the
 * following block's first HEADING_WIDOW_LINES line span. If the combined
 * height exceeds `pageRemainingPx`, the heading should move to the next
 * page; otherwise the heading stays.
 *
 * Degenerate cases:
 *   - `headingLineBoxes` is empty → no heading, returns { moveHeading: false }.
 *   - `followingBlockLineBoxes` is empty or shorter than HEADING_WIDOW_LINES
 *     → only the heading's own height is compared to the remaining budget.
 *
 * @returns { moveHeading: boolean } — true = move heading to the next page.
 */
export function applyHeadingWidow(
  headingLineBoxes: readonly LineBox[],
  followingBlockLineBoxes: readonly LineBox[],
  pageRemainingPx: number,
): { moveHeading: boolean } {
  if (headingLineBoxes.length === 0) return { moveHeading: false };
  const headingTop = headingLineBoxes[0]!.topPx;
  const headingBottom = headingLineBoxes[headingLineBoxes.length - 1]!.bottomPx;
  const headingHeight = headingBottom - headingTop;
  // D4-03 needs at least HEADING_WIDOW_LINES following lines to anchor the
  // heading. If the following block is shorter, the rule can't apply
  // meaningfully — fall back to a heading-only height check (the heading
  // moves iff it alone doesn't fit).
  if (followingBlockLineBoxes.length < HEADING_WIDOW_LINES) {
    return { moveHeading: headingHeight > pageRemainingPx };
  }
  const following = followingBlockLineBoxes.slice(0, HEADING_WIDOW_LINES);
  const followingTop = following[0]!.topPx;
  const followingBottom = following[following.length - 1]!.bottomPx;
  const followingHeight = followingBottom - followingTop;
  return { moveHeading: headingHeight + followingHeight > pageRemainingPx };
}

/**
 * D4-04 — adjust a candidate line-split index to keep at least
 * SPLIT_WIDOW_LINES lines on each side of the boundary.
 *
 * `candidateSplitIdx` is the line index where the split would naturally
 * fall (lines [0, candidateSplitIdx) stay on the current page; lines
 * [candidateSplitIdx, length) move to the next page).
 *
 * Returns an adjusted index in the range
 *   [SPLIT_WIDOW_LINES, length - SPLIT_WIDOW_LINES]
 * when the block has at least `2 * SPLIT_WIDOW_LINES` lines.
 *
 * If the block is too short to support the rule (fewer than
 * `2 * SPLIT_WIDOW_LINES` lines), the candidate is returned UNCHANGED so
 * the caller can detect the unsplittable case (e.g. by comparing the
 * returned index against the block length / 0 and falling back to a
 * whole-block move). This keeps the helper total + deterministic.
 */
export function applyLineWidowOrphan(
  blockLineBoxes: readonly LineBox[],
  candidateSplitIdx: number,
): number {
  const total = blockLineBoxes.length;
  // Block too short to split under the 2/2 rule — return candidate as-is;
  // caller treats the block as atomic for this pass.
  if (total < 2 * SPLIT_WIDOW_LINES) return candidateSplitIdx;
  // Orphan guard: keep at least SPLIT_WIDOW_LINES lines BEFORE the split.
  let adjusted = Math.max(candidateSplitIdx, SPLIT_WIDOW_LINES);
  // Widow guard: keep at least SPLIT_WIDOW_LINES lines AFTER the split.
  adjusted = Math.min(adjusted, total - SPLIT_WIDOW_LINES);
  return adjusted;
}
