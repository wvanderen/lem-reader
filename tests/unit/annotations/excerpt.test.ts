// tests/unit/annotations/excerpt.test.ts
// Plan 19-02 Task 1 — excerpt honesty cells for the pure first-fragment
// derivation (D19-10). Locks the three ellipsis cases of the 19-UI-SPEC
// §Typography honesty rule:
//   1. a complete single-fragment highlight NEVER gets an ellipsis;
//   2. a length-truncated excerpt gets exactly one U+2026;
//   3. a genuine continuation (BLOCK_SEPARATOR present in quote.exact)
//      gets the first fragment + exactly one U+2026 — including when the
//      fragment itself exceeds the cap (cap ellipsis and continuation
//      ellipsis are the SAME single character, never two).
// Mirrors the pure-module test style of overlap.test.ts.
import { describe, expect, it } from "vitest";
import { firstFragmentExcerpt } from "../../../src/annotations/excerpt";
import { BLOCK_SEPARATOR } from "../../../src/content/normalizeText";

/** The calm ellipsis — exactly one U+2026 (the only legal form). */
const ELLIPSIS = "\u2026";

function ellipsisCount(text: string): number {
  return text.split(ELLIPSIS).length - 1;
}

describe("firstFragmentExcerpt — D19-10 excerpt honesty", () => {
  it("returns identical text with NO ellipsis for a complete single fragment within the cap", () => {
    const exact = "A calm opening sentence.";
    const out = firstFragmentExcerpt(exact, 120);
    expect(out).toBe(exact);
    expect(out).not.toContain(ELLIPSIS);
  });

  it("treats the cap as inclusive: a fragment exactly at the cap stays identical and ellipsis-free", () => {
    const exact = "0123456789"; // 10 chars
    expect(firstFragmentExcerpt(exact, 10)).toBe("0123456789");
  });

  it("truncates and appends exactly one ellipsis for a single fragment over the cap", () => {
    const exact = "abcdefghij".repeat(5); // 50 chars
    const out = firstFragmentExcerpt(exact, 20);
    expect(out).toBe("abcdefghijabcdefghij" + ELLIPSIS);
    expect(ellipsisCount(out)).toBe(1);
  });

  it("derives the FIRST FRAGMENT + exactly one ellipsis for a multi-block span (continuation)", () => {
    const exact = ["opening fragment", "second block", "third block"].join(
      BLOCK_SEPARATOR,
    );
    const out = firstFragmentExcerpt(exact, 120);
    expect(out).toBe("opening fragment" + ELLIPSIS);
    // Later blocks never leak into the excerpt.
    expect(out).not.toContain("second block");
    expect(ellipsisCount(out)).toBe(1);
  });

  it("truncates the first fragment and appends exactly ONE ellipsis when the span continues AND the fragment exceeds the cap", () => {
    const longFragment = "x".repeat(50);
    const exact = longFragment + BLOCK_SEPARATOR + "continuation";
    const out = firstFragmentExcerpt(exact, 30);
    expect(out).toBe("x".repeat(30) + ELLIPSIS);
    expect(ellipsisCount(out)).toBe(1);
  });

  it("preserves an empty continuation fragment's ellipsis when the span starts at a block break", () => {
    // exact = "\nrest of the span" — the first fragment is empty, the
    // span genuinely continues: the honest excerpt is the lone ellipsis.
    const exact = BLOCK_SEPARATOR + "rest of the span";
    const out = firstFragmentExcerpt(exact, 120);
    expect(out).toBe(ELLIPSIS);
  });

  it("never invents content for an empty exact (schema-impossible via .min(1); returns empty, ellipsis-free)", () => {
    const out = firstFragmentExcerpt("", 120);
    expect(out).toBe("");
    expect(out).not.toContain(ELLIPSIS);
  });
});
