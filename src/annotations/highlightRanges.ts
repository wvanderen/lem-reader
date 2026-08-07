// src/annotations/highlightRanges.ts
// Block↔highlight intersection + run-slice computation for the <mark> overlay.
//
// Given a paragraph's InlineRun[] (the renderer's run array), the block's
// article-global start offset, and the set of highlights that may intersect
// this block, produce an ordered list of run-slices: each slice is either a
// plain (un-highlighted) run group or a highlighted run group carrying its
// highlight id + note flag. The renderer (Plan 05-02) wraps each highlighted
// slice in <mark>.
//
// REUSE splitParagraphRuns — NEVER reimplement run slicing (Pitfall 4 /
// 05-RESEARCH.md "Don't Hand-Roll"): splitParagraphRuns already preserves
// inline marks across splits (a link run split mid-text becomes two link runs
// with the same href). This module orchestrates the slicing at highlight
// boundaries; it does not touch run internals.
//
// Cross-fragment intersection math (D5-16) mirrors fragmentRenderer.tsx
// resolveBlockSlice: intersect each highlight range with the block's
// article-global range and emit a slice for each intersection.
//
// Pure domain logic — no DOM, no React, no side effects. jsdom-safe.
import type { InlineRun } from "../content/types";
import type { TextPositionSelector } from "../content/normalizeText";
import { graphemeClusters } from "../content/normalizeText";
import { splitParagraphRuns } from "../pagination/splitBlock";

/** A highlight intersecting a block, expressed for the slicer. */
export interface HighlightSliceEntry {
  id: string;
  position: TextPositionSelector;
  hasNote: boolean;
  /**
   * D5-02 tri-state (Plan 05-04). Drives the inline modifier:
   * confident → filled mark.highlight; ambiguous/orphan → dashed-outline
   * mark.highlight.unresolved (Pitfall 7 — never silent re-attach). Defaults
   * to "confident" so existing call sites that omit the field regress
   * nothing.
   */
  status?: "confident" | "ambiguous" | "orphan";
}

/** A run slice produced by sliceRunsForHighlights. */
export interface HighlightSlice {
  /** The InlineRun[] to render for this slice. */
  runs: InlineRun[];
  /** The owning highlight id, or null for an un-highlighted gap slice. */
  highlightId: string | null;
  /** Whether the owning highlight has an attached note (false for gaps). */
  hasNote: boolean;
  /**
   * The owning highlight's D5-02 status. Drives the inline modifier:
   * confident → filled mark.highlight; ambiguous/orphan → dashed-outline
   * mark.highlight.unresolved. "confident" for gap slices (no modifier).
   */
  status: "confident" | "ambiguous" | "orphan";
}

/**
 * Slice a paragraph's InlineRun[] at every highlight boundary intersecting
 * this block's article-global range.
 *
 * The block's range is `[blockGlobalStart, blockGlobalStart + blockLen)` where
 * `blockLen` is the per-run grapheme sum (matching splitParagraphRuns's
 * accounting). Each highlight's article-global [start, end) is intersected
 * with the block range; the intra-block intersection is then used as the slice
 * boundary.
 *
 * Returns an ordered array of slices covering the full run array with no gaps
 * and no overlaps. Consecutive same-owner slices are NOT merged (the renderer
 * wraps each highlighted slice independently — D5-16 cross-fragment rendering
 * relies on per-slice <mark> elements).
 *
 * @param runs             The paragraph's InlineRun[] (the renderer's run array).
 * @param blockGlobalStart The block's article-global D-05 grapheme start offset.
 * @param highlights       Highlights that may intersect this block.
 * @param lang             BCP-47 locale for Intl.Segmenter grapheme walking.
 */
export function sliceRunsForHighlights(
  runs: readonly InlineRun[],
  blockGlobalStart: number,
  highlights: readonly HighlightSliceEntry[],
  lang: string,
): HighlightSlice[] {
  const blockLen = runs.reduce(
    (sum, r) => sum + graphemeClusters(r.text, lang).length,
    0,
  );

  // Compute intra-block intersections (D5-16 intersection math).
  const intersections: {
    start: number;
    end: number;
    id: string;
    hasNote: boolean;
    status: "confident" | "ambiguous" | "orphan";
  }[] = [];
  for (const h of highlights) {
    const interStart = Math.max(0, h.position.start - blockGlobalStart);
    const interEnd = Math.min(blockLen, h.position.end - blockGlobalStart);
    if (interStart < interEnd) {
      intersections.push({
        start: interStart,
        end: interEnd,
        id: h.id,
        hasNote: h.hasNote,
        status: h.status ?? "confident",
      });
    }
  }

  // No intersections → a single un-highlighted slice over the full run array.
  if (intersections.length === 0) {
    return [
      { runs: [...runs], highlightId: null, hasNote: false, status: "confident" },
    ];
  }

  // Sort by start offset so the walk is monotonic. (Stable enough for
  // disjoint highlights — D5-13 forbids overlapping highlights, so no two
  // intersections share a start within a single block.)
  intersections.sort((a, b) => a.start - b.start);

  const slices: HighlightSlice[] = [];
  let cursor = 0; // intra-block offset consumed so far
  let currentRuns: InlineRun[] = [...runs];

  for (const inter of intersections) {
    // Gap before this intersection: [cursor, inter.start) → un-highlighted.
    if (inter.start > cursor) {
      const gapLen = inter.start - cursor;
      const split = splitParagraphRuns(currentRuns, gapLen, lang);
      if (split.before.length > 0) {
        slices.push({
          runs: split.before,
          highlightId: null,
          hasNote: false,
          status: "confident",
        });
      }
      currentRuns = split.after;
      cursor = inter.start;
    }
    // The intersection itself: [inter.start, inter.end) → highlighted slice.
    const interLen = inter.end - inter.start;
    const split = splitParagraphRuns(currentRuns, interLen, lang);
    if (split.before.length > 0) {
      slices.push({
        runs: split.before,
        highlightId: inter.id,
        hasNote: inter.hasNote,
        status: inter.status,
      });
    }
    currentRuns = split.after;
    cursor = inter.end;
  }

  // Trailing un-highlighted slice for the remainder of the run array.
  if (currentRuns.length > 0) {
    slices.push({
      runs: currentRuns,
      highlightId: null,
      hasNote: false,
      status: "confident",
    });
  }

  return slices;
}
