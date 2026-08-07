// tests/unit/annotations/cross-fragment-slicing.test.ts
// D5-16 cross-fragment highlight slicing — pure range-math proof.
//
// The contract (Plan 05-04 / 05-RESEARCH §Pattern 4 + §Pitfall 5): a single-
// block highlight whose block is split across a page boundary MUST render a
// `<mark>` slice on EACH page fragment containing part of its grapheme range,
// both sharing `data-highlight-id`. A silent gap at a page turn would hide
// the passage from the reader (T-05-15 mitigation). The intersection math
// lives in fragmentRenderer.tsx's `_test_sliceHighlightsForEntry` helper
// (pure logic — no DOM, no React); this test exercises it with synthetic
// article + fragment fixtures.
//
// The full paginated render proof (real layout, real cross-browser mark
// inspection) is Plan 05-05's Playwright suite. Here we prove the range
// arithmetic itself: intersect each highlight range with each fragment
// entry's article-global visible range; emit a per-entry slice for every
// non-empty intersection (intersectStart < intersectEnd); end-exclusive at
// the boundary.
//
// All fixtures use ASCII text where character offset === grapheme offset,
// keeping the math readable. The slicer uses graphemeClusters internally;
// the article's `lang: "en"` keeps Intl.Segmenter on the ASCII fast path.
import { describe, expect, it } from "vitest";
import { _test_sliceHighlightsForEntry } from "../../../src/pagination/fragmentRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import type { CanonicalArticle } from "../../../src/content/types";

/**
 * Build a synthetic article with one long paragraph of `len` graphemes.
 * The paragraph is a single run (no marks) so the slicer's per-run length
 * sum equals the block length exactly — clean range math, no run-boundary
 * edge cases (those belong to sliceRunsForHighlights's own tests).
 */
function articleWithOneParagraph(len: number): CanonicalArticle {
  return {
    id: "synthetic-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/synthetic",
      title: "Synthetic Article",
      retrievedAt: "2026-08-07T00:00:00Z",
      originalHtmlHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "A".repeat(len), marks: [] }],
      },
    ],
    footnotes: [],
  };
}

/** Construct a confident ArticleBodyHighlight at article-global [start, end). */
function highlightAt(
  id: string,
  start: number,
  end: number,
  status: ArticleBodyHighlight["status"] = "confident",
): ArticleBodyHighlight {
  return { id, position: { start, end }, hasNote: false, status };
}

describe("_test_sliceHighlightsForEntry — D5-16 cross-fragment intersection math", () => {
  // Article: one 100-grapheme paragraph at article-global [0, 100).
  // (block 0 starts at offset 0; no BLOCK_SEPARATOR prefix.)
  const article = articleWithOneParagraph(100);

  it("emits ONE slice per containing fragment for a highlight split by a page boundary (D5-16)", () => {
    // The block is split across two fragments: page A covers [0, 50),
    // page B covers [50, 100). The highlight spans the split point.
    const h = highlightAt("hl-split", 30, 70);

    // Page A entry: blockIndex 0, intra-block [0, 50).
    const slicesA = _test_sliceHighlightsForEntry([h], article, 0, 0, 50, "en");
    // Page B entry: blockIndex 0, intra-block [50, 100).
    const slicesB = _test_sliceHighlightsForEntry([h], article, 0, 50, 100, "en");

    // BOTH fragments must produce a slice — D5-16's load-bearing claim:
    // no silent gap at a page turn.
    expect(slicesA).toHaveLength(1);
    expect(slicesB).toHaveLength(1);

    // The slice positions are ENTRY-LOCAL (relative to the entry start),
    // so page A's slice is [30, 50) (the [30, 70) highlight clipped to the
    // [0, 50) entry) and page B's slice is [0, 20) (the same highlight
    // shifted by -50 to land in the [50, 100) entry's coordinate).
    const intersectStartA = Math.max(h.position.start, 0);
    const intersectEndA = Math.min(h.position.end, 50);
    expect(slicesA[0]!.position).toEqual({
      start: intersectStartA - 0,
      end: intersectEndA - 0,
    });
    expect(slicesA[0]!.position).toEqual({ start: 30, end: 50 });

    const intersectStartB = Math.max(h.position.start, 50);
    const intersectEndB = Math.min(h.position.end, 100);
    expect(slicesB[0]!.position).toEqual({
      start: intersectStartB - 50,
      end: intersectEndB - 50,
    });
    expect(slicesB[0]!.position).toEqual({ start: 0, end: 20 });

    // D5-16 / ANNO-05: both slices share the SAME id — when InlineList
    // wraps each entry's slice in <mark data-highlight-id="hl-split">, the
    // two pages' marks share the id so the popover/note is reachable from
    // either page. (data-highlight-id is set by InlineRenderer from
    // slice.highlightId; here we assert the upstream id field is shared.)
    expect(slicesA[0]!.id).toBe("hl-split");
    expect(slicesB[0]!.id).toBe("hl-split");
    expect(slicesA[0]!.id).toBe(slicesB[0]!.id);
  });

  it("emits a slice ONLY on the containing fragment for a within-fragment highlight", () => {
    // Highlight entirely inside page A's range [0, 50).
    const h = highlightAt("hl-A", 10, 40);

    const slicesA = _test_sliceHighlightsForEntry([h], article, 0, 0, 50, "en");
    const slicesB = _test_sliceHighlightsForEntry([h], article, 0, 50, 100, "en");

    expect(slicesA).toHaveLength(1);
    expect(slicesA[0]!.position).toEqual({ start: 10, end: 40 });
    // Page B's entry [50, 100) does NOT intersect [10, 40) — no slice.
    expect(slicesB).toHaveLength(0);
  });

  it("emits no slice when the highlight is entirely outside the fragment's range", () => {
    // Highlight in the second half; test against the first fragment only.
    const h = highlightAt("hl-B", 60, 90);
    const slicesA = _test_sliceHighlightsForEntry([h], article, 0, 0, 50, "en");
    expect(slicesA).toHaveLength(0);
  });

  it("emits no slice for a zero-length intersection at the boundary (end-exclusive)", () => {
    // Highlight [40, 50) touches the entry boundary at exactly 50. The
    // intersection with [0, 50) is [40, 50) — non-empty, so a slice IS
    // emitted on page A. But the intersection with page B's [50, 100) is
    // [max(40,50), min(50,100)) = [50, 50) — ZERO LENGTH (end-exclusive),
    // so NO slice is emitted on page B. This is the end-exclusive contract:
    // touching ranges do not overlap.
    const h = highlightAt("hl-touch", 40, 50);
    const slicesA = _test_sliceHighlightsForEntry([h], article, 0, 0, 50, "en");
    const slicesB = _test_sliceHighlightsForEntry([h], article, 0, 50, 100, "en");

    expect(slicesA).toHaveLength(1);
    expect(slicesA[0]!.position).toEqual({ start: 40, end: 50 });
    // intersectStart (50) === intersectEnd (50) → no slice.
    expect(slicesB).toHaveLength(0);
  });

  it("threads the D5-02 status field so ambiguous/orphan slices render via the unresolved marker path", () => {
    // The status field propagates so InlineRenderer can emit
    // mark.highlight.unresolved for ambiguous/orphan slices (D5-04). The
    // cross-fragment math itself is status-agnostic — every status passes
    // through verbatim.
    const ambiguous = highlightAt("hl-amb", 30, 70, "ambiguous");
    const orphan = highlightAt("hl-orph", 30, 70, "orphan");

    const slicesAmb = _test_sliceHighlightsForEntry([ambiguous], article, 0, 0, 50, "en");
    const slicesOrph = _test_sliceHighlightsForEntry([orphan], article, 0, 50, 100, "en");

    expect(slicesAmb[0]!.status).toBe("ambiguous");
    expect(slicesOrph[0]!.status).toBe("orphan");
  });

  it("preserves a 3-fragment split with no gaps and no overlaps (multi-page highlight)", () => {
    // Synthetic 3-page article: block 0 has 300 graphemes; pages are 100 each.
    const big = articleWithOneParagraph(300);
    const h = highlightAt("hl-3page", 50, 250);

    const slicesP1 = _test_sliceHighlightsForEntry([h], big, 0, 0, 100, "en");
    const slicesP2 = _test_sliceHighlightsForEntry([h], big, 0, 100, 200, "en");
    const slicesP3 = _test_sliceHighlightsForEntry([h], big, 0, 200, 300, "en");

    expect(slicesP1).toHaveLength(1);
    expect(slicesP2).toHaveLength(1);
    expect(slicesP3).toHaveLength(1);

    // Each page carries the shared id (D5-16).
    expect(slicesP1[0]!.id).toBe("hl-3page");
    expect(slicesP2[0]!.id).toBe("hl-3page");
    expect(slicesP3[0]!.id).toBe("hl-3page");

    // Entry-local positions: P1 [50,100), P2 [0,100), P3 [0,50).
    expect(slicesP1[0]!.position).toEqual({ start: 50, end: 100 });
    expect(slicesP2[0]!.position).toEqual({ start: 0, end: 100 });
    expect(slicesP3[0]!.position).toEqual({ start: 0, end: 50 });

    // The three entry-local slices reconstruct the article-global highlight
    // when concatenated with the per-entry offsets — no gaps, no overlaps.
    const reconstructed = [
      [slicesP1[0]!.position.start + 0, slicesP1[0]!.position.end + 0],
      [slicesP2[0]!.position.start + 100, slicesP2[0]!.position.end + 100],
      [slicesP3[0]!.position.start + 200, slicesP3[0]!.position.end + 200],
    ];
    expect(reconstructed).toEqual([
      [50, 100],
      [100, 200],
      [200, 250],
    ]);
  });

  it("handles a multi-block article: offset accumulation includes BLOCK_SEPARATOR between blocks", () => {
    // Two 50-grapheme paragraphs. blockGlobalStart for block 1 = 50 + 1
    // (BLOCK_SEPARATOR is "\n", length 1) = 51.
    const twoBlock: CanonicalArticle = {
      id: "two-block",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/two",
        title: "Two Blocks",
        retrievedAt: "2026-08-07T00:00:00Z",
        originalHtmlHash:
          "0000000000000000000000000000000000000000000000000000000000000000",
      },
      blocks: [
        { kind: "paragraph", content: [{ text: "B".repeat(50), marks: [] }] },
        { kind: "paragraph", content: [{ text: "C".repeat(50), marks: [] }] },
      ],
      footnotes: [],
    };
    // Highlight at article-global [45, 60) spans block 0's tail + block 1's
    // head across the BLOCK_SEPARATOR. (The separator itself is not part
    // of any block's content; the highlight ranges only cover content
    // graphemes, so this is a realistic cross-block highlight.)
    const h = highlightAt("hl-cross", 45, 60);

    // Block 0 entry covers article-global [0, 50).
    const slicesB0 = _test_sliceHighlightsForEntry([h], twoBlock, 0, 0, 50, "en");
    // Block 1 entry starts at article-global 51 (50 + 1 separator).
    // An entry covering [51, 101) takes the slice [51, 60) → entry-local [0, 9).
    const slicesB1 = _test_sliceHighlightsForEntry([h], twoBlock, 1, 0, 50, "en");

    expect(slicesB0).toHaveLength(1);
    expect(slicesB0[0]!.position).toEqual({ start: 45, end: 50 });
    expect(slicesB1).toHaveLength(1);
    expect(slicesB1[0]!.position).toEqual({ start: 0, end: 9 });
    // Shared id across the two block fragments.
    expect(slicesB0[0]!.id).toBe("hl-cross");
    expect(slicesB1[0]!.id).toBe("hl-cross");
  });
});
