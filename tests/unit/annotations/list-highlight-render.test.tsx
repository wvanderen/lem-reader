// tests/unit/annotations/list-highlight-render.test.tsx
// Phase 19 Plan 19-03 — scrolling-mode mark coverage for the readable kinds a
// span can cross: list items (incl. NESTED lists — D19-13/D19-15), figure
// captions (D19-01 render-side symmetric offset — Pitfall 1), and code-block
// interiors (verbatim-source segmentation). Plus the first-slice-only DOM id
// discipline (Pitfall 2 — exactly ONE id="hl-<id>" per highlight per mounted
// document; data-highlight-id on every slice).
//
// Semantic-only (React Testing Library, jsdom — NO layout assertions; jsdom
// is NOT authoritative for layout). The slicer-level cells call
// sliceRunsForHighlights / sliceCodeForHighlights directly (pure logic); the
// render cells mount ArticleBody with explicit highlights (the mount
// conventions of blockquote-highlight-render.test.tsx).
//
// All fixtures use ASCII text where character offset === grapheme offset so
// the D-05 join arithmetic stays hand-checkable (items joined by
// BLOCK_SEPARATOR; each item's content blocks joined by BLOCK_SEPARATOR —
// normalizeText.ts L48-52).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import { sliceRunsForHighlights } from "../../../src/annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../../src/annotations/highlightRanges";
import type { Block, CanonicalArticle, InlineRun } from "../../../src/content/types";

// ── Article fixture helpers (blockquote-highlight-render.test.tsx shape) ────

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const article = (blocks: Block[]): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
});

/** Build an ArticleBodyHighlight at the given D-05 article-global position. */
function makeEntry(
  id: string,
  start: number,
  end: number,
  hasNote = false,
): ArticleBodyHighlight {
  return {
    id,
    position: { start, end },
    hasNote,
    status: "confident",
  };
}

/** Build a slicer-entry at the given D-05 article-global position. */
function slicerEntry(
  id: string,
  start: number,
  end: number,
): HighlightSliceEntry {
  return { id, position: { start, end }, hasNote: false, status: "confident" };
}

// ── Task 1: HighlightSlice.isFirst + first-slice-only DOM id (Pitfall 2) ────

describe("HighlightSlice.isFirst — slicer-level (19-03 Task 1)", () => {
  // Two 15/14-grapheme paragraphs; block 1 starts at article-global 16
  // (15 + BLOCK_SEPARATOR).
  const runsA: InlineRun[] = [{ text: "Alpha text here", marks: [] }];
  const runsB: InlineRun[] = [{ text: "Beta text here", marks: [] }];

  it("a highlight spanning two blocks yields isFirst=true on the FIRST block's slice only", () => {
    // Span [5, 20): block 0 intersection [5, 15), block 1 intersection
    // [16, 20) → intra-block [0, 4). The highlight's global start (5) lies
    // in block 0 → first-block slice carries the flag; the continuation
    // slice does not.
    const slicesA = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-x", 5, 20)], "en");
    const slicesB = sliceRunsForHighlights(runsB, 16, [slicerEntry("hl-x", 5, 20)], "en");

    const markedA = slicesA.filter((s) => s.highlightId === "hl-x");
    const markedB = slicesB.filter((s) => s.highlightId === "hl-x");
    expect(markedA).toHaveLength(1);
    expect(markedB).toHaveLength(1);
    expect(markedA[0]!.isFirst).toBe(true);
    expect(markedB[0]!.isFirst).not.toBeTruthy();
  });

  it("a highlight starting mid-block marks only that block's slice, with isFirst=true", () => {
    // [10, 25) starts inside block 0 → block 0 is the first (and here only)
    // touched block; block 1's slice [16, 25) → intra [0, 9) carries no flag.
    const slicesA = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-y", 10, 25)], "en");
    const slicesB = sliceRunsForHighlights(runsB, 16, [slicerEntry("hl-y", 10, 25)], "en");

    const markedA = slicesA.filter((s) => s.highlightId === "hl-y");
    const markedB = slicesB.filter((s) => s.highlightId === "hl-y");
    expect(markedA[0]!.isFirst).toBe(true);
    expect(markedB[0]!.isFirst).not.toBeTruthy();
  });

  it("gap slices never carry isFirst (the flag belongs to intersection slices only)", () => {
    const slices = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-g", 2, 8)], "en");
    // [gap 0..2) + [mark 2..8) + [gap 8..15)
    expect(slices).toHaveLength(3);
    expect(slices[0]!.highlightId).toBeNull();
    expect(slices[0]!.isFirst).toBeUndefined();
    expect(slices[1]!.highlightId).toBe("hl-g");
    expect(slices[1]!.isFirst).toBe(true);
    expect(slices[2]!.highlightId).toBeNull();
    expect(slices[2]!.isFirst).toBeUndefined();
  });
});

describe("first-slice-only DOM id — rendered output (19-03 Task 1, Pitfall 2)", () => {
  it("a multi-slice span renders N marks sharing data-highlight-id but exactly ONE id attribute", () => {
    // Same two-paragraph article; span [5, 20) crosses the BLOCK_SEPARATOR.
    const art = article([paragraph("Alpha text here"), paragraph("Beta text here")]);
    const hl = makeEntry("hl-span", 5, 20);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(2);
    for (const m of marks) {
      expect(m.getAttribute("data-highlight-id")).toBe("hl-span");
      expect(m.getAttribute("tabindex")).toBe("0");
      expect(m.getAttribute("aria-haspopup")).toBe("dialog");
    }
    // THE Pitfall 2 contract: exactly one element carries the DOM id, and it
    // is the span-start slice (inside the FIRST block — the jump target).
    const idCarriers = container.querySelectorAll('[id="hl-hl-span"]');
    expect(idCarriers.length).toBe(1);
    expect(marks[0]!.id).toBe("hl-hl-span");
    expect(marks[1]!.id).toBe("");
    // The id carrier lives in document order before the continuation mark.
    expect(marks[0]!.compareDocumentPosition(marks[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The id carrier is inside the first block; the continuation is in the
    // second.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[0]!.contains(idCarriers[0]!)).toBe(true);
    expect(paragraphs[1]!.contains(marks[1]!)).toBe(true);
  });

  it("a single-block highlight keeps its id (the degenerate case regresses nothing)", () => {
    const art = article([paragraph("Alpha text here"), paragraph("Beta text here")]);
    const hl = makeEntry("hl-single", 2, 9);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);
    expect(container.querySelectorAll('[id="hl-hl-single"]').length).toBe(1);
  });
});
