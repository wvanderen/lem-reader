// tests/unit/annotations/duplicate-range-render.test.ts
// Issue #190 — the DEMONSTRATED mechanism behind the reported stuck/blank
// highlight, pinned as the symptom-side companion to the creation-guard
// regression cells (overlap-creation-guard.test.tsx +
// overlap-creation-refusal.spec.ts).
//
// The chain, end to end:
//   1. RAPID REPEATED CREATION once bypassed the D5-13 overlap check inside
//      the render-commit window and persisted an identical duplicate row.
//   2. The disjoint-range slicer (sliceRunsForHighlights) then walks the two
//      identical intersections: the second intersection collapses to a
//      zero-length cut and emits NO visible mark.
//   3. Reader-visible symptoms: the second highlight EXISTS (drawer entry,
//      persisted row) but PAINTS NOTHING — the "blank" highlight — and
//      marks over the passage answer to one id while the list shows two, so
//      deleting the visible one "does nothing" — the "stuck" highlight.
//
// The creation guard removes step 1, so this render shape is unreachable
// from new creation. These tests pin the mechanism itself so the symptom is
// recognizable (and honestly documented) if legacy duplicates surface.
//
// Per the parent spec, legacy duplicates are NOT silently repaired, merged,
// or deleted — they stay listed with explicit delete access (covered in the
// e2e preservation cells). Pure domain logic — jsdom-safe, no DOM.
import { describe, expect, it } from "vitest";
import type { InlineRun } from "../../../src/content/types";
import { sliceRunsForHighlights } from "../../../src/annotations/highlightRanges";

const runs: InlineRun[] = [{ text: "One two three four five.", marks: [] }];
const lang = "en";

function sliceText(slices: ReturnType<typeof sliceRunsForHighlights>): string {
  return slices.map((s) => s.runs.map((r) => r.text).join("")).join("");
}

describe("issue #190 — duplicate-range render mechanism (stuck/blank symptom)", () => {
  it("an identical duplicate emits NO visible mark — the blank highlight", () => {
    const entries = [
      { id: "hl-a", position: { start: 0, end: 3 }, hasNote: false },
      { id: "hl-b", position: { start: 0, end: 3 }, hasNote: false },
    ];
    const slices = sliceRunsForHighlights(runs, 0, entries, lang);
    // hl-a paints; hl-b's collapsed intersection produces no highlighted
    // slice with visible text.
    const visibleOwners = slices
      .filter((s) => s.highlightId !== null && s.runs.some((r) => r.text.length > 0))
      .map((s) => s.highlightId);
    expect(visibleOwners).toEqual(["hl-a"]);
    expect(sliceText(slices)).toBe("One two three four five.");
  });

  it("an overlapping pair collapses the later intersection — no doubled or lost text", () => {
    // A partial overlap [0,5) + [3,9): the walk stays monotonic, text is
    // covered exactly once, and the second owner loses the already-walked
    // span (rendered under the first id or as a gap).
    const entries = [
      { id: "hl-a", position: { start: 0, end: 5 }, hasNote: false },
      { id: "hl-b", position: { start: 3, end: 9 }, hasNote: false },
    ];
    const slices = sliceRunsForHighlights(runs, 0, entries, lang);
    expect(sliceText(slices)).toBe("One two three four five.");
    // No slice is claimed by two owners; no text renders twice.
    const claimed = slices.filter((s) => s.highlightId !== null);
    for (const s of claimed) {
      expect(s.runs.length).toBeGreaterThan(0);
    }
    const owners = new Set(claimed.map((s) => s.highlightId));
    expect(owners.has("hl-a")).toBe(true);
  });

  it("a disjoint pair keeps both marks (the healthy shape, for contrast)", () => {
    const entries = [
      { id: "hl-a", position: { start: 0, end: 3 }, hasNote: false },
      { id: "hl-b", position: { start: 4, end: 7 }, hasNote: false },
    ];
    const slices = sliceRunsForHighlights(runs, 0, entries, lang);
    const owners = slices
      .filter((s) => s.highlightId !== null && s.runs.some((r) => r.text.length > 0))
      .map((s) => s.highlightId);
    expect(owners).toEqual(["hl-a", "hl-b"]);
    expect(sliceText(slices)).toBe("One two three four five.");
  });
});
