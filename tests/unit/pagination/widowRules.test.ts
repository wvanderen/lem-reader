// tests/unit/pagination/widowRules.test.ts
// Pure-domain tests for the D4-03 (heading widow) + D4-04 (line widow/orphan)
// helpers. No React, no DOM — the helpers are pure arithmetic over LineBox[].
//
// Behavior contracts under test (Plan 04-01 Task 2 <behavior>):
//   - applyHeadingWidow moves the heading when the heading + its first
//     HEADING_WIDOW_LINES (=2) following lines do NOT fit in the remaining
//     page budget.
//   - applyLineWidowOrphan keeps at least SPLIT_WIDOW_LINES (=2) lines on
//     each side of an intra-block split when the block has enough lines.
//
// Each LineBox stub simulates one CSS line box at a known top/bottom (the
// pagination engine never reads real layout here — jsdom is not authoritative
// for layout. Real line-box geometry comes from Range.getClientRects() in
// Plan 05's Playwright corpus matrix.).
import { describe, expect, it } from "vitest";
import {
  applyHeadingWidow,
  applyLineWidowOrphan,
  HEADING_WIDOW_LINES,
  SPLIT_WIDOW_LINES,
} from "../../../src/pagination/widowRules";
import type { LineBox } from "../../../src/pagination/types";

/** Build N synthetic line boxes, each 20px tall, starting at top=0. */
function synthLineBoxes(n: number, lineHeight = 20): LineBox[] {
  const out: LineBox[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      charOffset: i * 10, // arbitrary — widowRules only consumes top/bottom
      topPx: i * lineHeight,
      bottomPx: i * lineHeight + lineHeight,
    });
  }
  return out;
}

describe("widowRules — exported constants (D4-03 / D4-04)", () => {
  it("HEADING_WIDOW_LINES === 2 (D4-03)", () => {
    expect(HEADING_WIDOW_LINES).toBe(2);
  });

  it("SPLIT_WIDOW_LINES === 2 (D4-04)", () => {
    expect(SPLIT_WIDOW_LINES).toBe(2);
  });
});

describe("applyHeadingWidow — D4-03 heading widow rule", () => {
  it("keeps the heading when heading + first 2 following lines fit", () => {
    // Heading 1 line (20px) + first 2 of 5 following lines (40px) = 60px.
    // Page remaining = 100px → fits → keep heading.
    const heading = synthLineBoxes(1);
    const following = synthLineBoxes(5);
    const result = applyHeadingWidow(heading, following, 100);
    expect(result.moveHeading).toBe(false);
  });

  it("moves the heading when heading + first 2 following lines do NOT fit", () => {
    // Heading 1 line (20px) + first 2 of 5 following lines (40px) = 60px.
    // Page remaining = 50px → 60 > 50 → move heading.
    const heading = synthLineBoxes(1);
    const following = synthLineBoxes(5);
    const result = applyHeadingWidow(heading, following, 50);
    expect(result.moveHeading).toBe(true);
  });

  it("moves the heading when the heading ALONE exceeds the remaining budget", () => {
    // Heading 4 lines (80px), page remaining 50px → move (even with no
    // following-block constraint, the heading itself overflows).
    const heading = synthLineBoxes(4);
    const following = synthLineBoxes(5);
    const result = applyHeadingWidow(heading, following, 50);
    expect(result.moveHeading).toBe(true);
  });

  it("returns { moveHeading: false } when the heading has no line boxes", () => {
    const result = applyHeadingWidow([], synthLineBoxes(3), 100);
    expect(result.moveHeading).toBe(false);
  });

  it("falls back to heading-only height check when following block has <2 lines", () => {
    // Heading 1 line (20px), following has 1 line (20px), budget 30px.
    // Can't take "first 2" of a 1-line block; just check heading fits.
    const heading = synthLineBoxes(1);
    const following = synthLineBoxes(1);
    // 20 <= 30 → keep.
    expect(applyHeadingWidow(heading, following, 30).moveHeading).toBe(false);
    // 20 > 10 → move.
    expect(applyHeadingWidow(heading, following, 10).moveHeading).toBe(true);
  });

  it("honors HEADING_WIDOW_LINES exactly: heading + 2 following lines vs heading + 1 following line", () => {
    // Heading 1 line (20px), following 4 lines (4*20=80px), budget 60px.
    // 20 + 2*20 = 60 → fits exactly → keep.
    const heading = synthLineBoxes(1);
    const following = synthLineBoxes(4);
    expect(applyHeadingWidow(heading, following, 60).moveHeading).toBe(false);
    // Budget 59 → 60 > 59 → move.
    expect(applyHeadingWidow(heading, following, 59).moveHeading).toBe(true);
  });
});

describe("applyLineWidowOrphan — D4-04 line widow/orphan rule", () => {
  it("returns the candidate unchanged when block is too short to split", () => {
    // Block has 3 lines, SPLIT_WIDOW_LINES=2 → 2*2=4 > 3 → too short.
    // Helper returns the candidate as-is; caller detects via "can't split".
    const lines = synthLineBoxes(3);
    expect(applyLineWidowOrphan(lines, 1)).toBe(1);
    expect(applyLineWidowOrphan(lines, 2)).toBe(2);
  });

  it("bumps an orphan candidate up to SPLIT_WIDOW_LINES (keep >=2 before)", () => {
    // Block 6 lines, candidate split at line 1 → only 1 line before the
    // boundary (orphan). Rule bumps to 2.
    const lines = synthLineBoxes(6);
    expect(applyLineWidowOrphan(lines, 1)).toBe(SPLIT_WIDOW_LINES);
  });

  it("bumps a widow candidate down to length - SPLIT_WIDOW_LINES (keep >=2 after)", () => {
    // Block 6 lines, candidate split at line 5 → only 1 line after the
    // boundary (widow). Rule bumps down to 6-2=4.
    const lines = synthLineBoxes(6);
    expect(applyLineWidowOrphan(lines, 5)).toBe(lines.length - SPLIT_WIDOW_LINES);
  });

  it("preserves a valid candidate that already satisfies the 2/2 rule", () => {
    // Block 8 lines, candidate at line 4 → 4 before, 4 after. Valid.
    const lines = synthLineBoxes(8);
    expect(applyLineWidowOrphan(lines, 4)).toBe(4);
  });

  it("clamps to [SPLIT_WIDOW_LINES, length - SPLIT_WIDOW_LINES] on both sides", () => {
    // Block 6 lines: valid range is [2, 4].
    const lines = synthLineBoxes(6);
    expect(applyLineWidowOrphan(lines, 0)).toBe(2); // orphan bump up
    expect(applyLineWidowOrphan(lines, 6)).toBe(4); // widow bump down
    expect(applyLineWidowOrphan(lines, 3)).toBe(3); // mid — unchanged
  });

  it("handles exactly 2*SPLIT_WIDOW_LINES lines (4-line block) — single valid split point", () => {
    // Block 4 lines (= 2*2): only valid split is at 2 (2 before, 2 after).
    const lines = synthLineBoxes(4);
    expect(applyLineWidowOrphan(lines, 1)).toBe(2); // orphan → 2
    expect(applyLineWidowOrphan(lines, 3)).toBe(2); // widow → 2
    expect(applyLineWidowOrphan(lines, 2)).toBe(2); // already valid
  });

  it("preserves a sub-SPLIT_WIDOW_LINES candidate when block is unsplittable", () => {
    // Block 2 lines: 2*2=4 > 2 → unsplittable. Candidate 1 returned as-is.
    const lines = synthLineBoxes(2);
    expect(applyLineWidowOrphan(lines, 1)).toBe(1);
  });
});
