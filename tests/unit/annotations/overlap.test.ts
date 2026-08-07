// tests/unit/annotations/overlap.test.ts
// D5-13 disjoint-range rejection. Pure 1-D interval-intersection test over
// D-05 grapheme ranges. Mirrors the range-math test style in tests/unit/pagination.
//
// The contract: touching ranges (end of one === start of the other) do NOT
// overlap; partial overlaps and full nesting DO overlap.
import { describe, expect, it } from "vitest";
import { rangesOverlap } from "../../../src/annotations/overlap";

describe("rangesOverlap — D5-13 disjoint-range check", () => {
  it("returns false for disjoint ranges that do not touch", () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 20, end: 30 })).toBe(false);
    expect(rangesOverlap({ start: 20, end: 30 }, { start: 0, end: 10 })).toBe(false);
  });

  it("returns false for touching ranges (end-exclusive: [10,20) vs [20,30) → false)", () => {
    expect(rangesOverlap({ start: 10, end: 20 }, { start: 20, end: 30 })).toBe(false);
    expect(rangesOverlap({ start: 20, end: 30 }, { start: 10, end: 20 })).toBe(false);
  });

  it("returns true for partial overlap ([10,20) vs [15,25))", () => {
    expect(rangesOverlap({ start: 10, end: 20 }, { start: 15, end: 25 })).toBe(true);
    expect(rangesOverlap({ start: 15, end: 25 }, { start: 10, end: 20 })).toBe(true);
  });

  it("returns true for full nesting (one range contains the other)", () => {
    expect(rangesOverlap({ start: 10, end: 40 }, { start: 20, end: 30 })).toBe(true);
    expect(rangesOverlap({ start: 20, end: 30 }, { start: 10, end: 40 })).toBe(true);
  });

  it("returns true for a single-shared-grapheme overlap ([10,20) vs [19,30))", () => {
    expect(rangesOverlap({ start: 10, end: 20 }, { start: 19, end: 30 })).toBe(true);
  });

  it("is symmetric and order-independent", () => {
    const a = { start: 5, end: 15 };
    const b = { start: 10, end: 20 };
    expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
  });

  it("returns false for two zero-length-adjacent ranges at the same point", () => {
    // [10,10) is degenerate (zero width); touching [10,20) at its start.
    // Per the end-exclusive formula, max(10,10)=10 < min(10,20)=10 is false.
    expect(rangesOverlap({ start: 10, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });

  it("rejects a candidate overlapping an existing highlight at the boundary grapheme", () => {
    // Simulates the D5-13 capture-rejection path: an existing highlight at
    // [100,115) and a new selection at [110,125) overlap → reject.
    const existing = { start: 100, end: 115 };
    const candidate = { start: 110, end: 125 };
    expect(rangesOverlap(existing, candidate)).toBe(true);
  });
});
