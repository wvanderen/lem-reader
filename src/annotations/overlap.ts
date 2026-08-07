// src/annotations/overlap.ts
// Disjoint-range check for D5-13 (no overlap / nesting between highlights).
//
// Pure domain logic — no DOM, no React, no side effects. The check is a
// 1-D interval-intersection test over D-05 grapheme ranges. Touching ranges
// (end of one === start of the other) are NOT considered overlapping: a
// highlight ending at offset 20 and one starting at 20 are clean disjoint
// neighbors, not a conflict.
//
// Mirrors the range-intersection math in fragmentRenderer.tsx resolveBlockSlice
// (the closest in-repo analog) but factored into a single named helper so the
// D5-13 policy is testable in isolation.
import type { TextPositionSelector } from "../content/normalizeText";

/**
 * Returns true when `a` and `b` overlap (share at least one grapheme offset).
 * End-exclusive: [10,20) vs [20,30) → false (touching, not overlapping);
 * [10,20) vs [15,25) → true.
 *
 * Per D5-13 the caller rejects any new selection that overlaps an existing
 * highlight's range using this helper — disjoint ranges only.
 */
export function rangesOverlap(
  a: TextPositionSelector,
  b: TextPositionSelector,
): boolean {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}
