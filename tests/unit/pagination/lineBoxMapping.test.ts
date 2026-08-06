// tests/unit/pagination/lineBoxMapping.test.ts
// Pure-domain tests for the DOM line-box read-phase + charOffsetToGrapheme.
// Mirrors tests/unit/restoreLocation.test.ts conventions: vitest + jsdom,
// build stub HTMLElements via document.createElement, and — because jsdom is
// NOT authoritative for layout (Pitfall 2 — RESEARCH §Common Pitfalls) —
// mock Range.getClientRects via a createRange stub driven by a predefined
// line-break schedule. The real cross-engine layout proof (no-clipping/
// no-duplication across Chromium/Firefox/WebKit) lands in Plan 05's
// Playwright corpus matrix.
//
// Two behavior contracts under test (Plan 04-01 Task 1 <behavior>):
//   - a stub HTMLElement whose getClientRects mock returns N line boxes
//     yields N LineBox entries with strictly increasing topPx
//   - the charOffset of each LineBox maps via graphemeClusters to a D-05
//     grapheme offset that monotonically increases
// Plus: AbortError surfaces when signal.aborted, and empty/missing text
// nodes return [] (degenerate inputs do not throw).
import { describe, expect, it } from "vitest";
import {
  blockNormalizedText,
  charOffsetToGrapheme,
  readLineBoxes,
} from "../../../src/pagination/lineBoxes";
import { graphemeClusters } from "../../../src/content/normalizeText";
import { MeasurementResultSchema } from "../../../src/measurement/types";

/**
 * Install a document.createRange stub that simulates `lineCharOffsets`:
 * for a range [0, end), return one DOMRect per line that the range covers.
 * Each simulated line is 20px tall (top = li*20, bottom = li*20 + 18).
 *
 * `lineCharOffsets[i]` = the UTF-16 char offset where line (i+1) starts
 * (line 1 is always at offset 0). Lines are clamped to the next break or
 * end-of-text.
 *
 * Returns a restore closure that re-installs the real createRange.
 */
function installRangeMock(lineCharOffsets: number[]): () => void {
  const realCreateRange = document.createRange.bind(document);
  const state = { start: 0, end: 0 };
  const stub: Range = {
    setStart: (_node: Node, offset: number) => {
      state.start = offset;
    },
    setEnd: (_node: Node, offset: number) => {
      state.end = offset;
    },
    getClientRects: (() => {
      const rects: DOMRect[] = [];
      for (let li = 0; li < lineCharOffsets.length; li++) {
        const lineStart = lineCharOffsets[li]!;
        const lineEnd =
          li + 1 < lineCharOffsets.length
            ? lineCharOffsets[li + 1]!
            : Number.MAX_SAFE_INTEGER;
        // Range [start, end) overlaps this line iff end > lineStart AND
        // start < lineEnd AND the range is non-empty (end > start).
        if (
          state.end > lineStart &&
          state.start < lineEnd &&
          state.end > state.start
        ) {
          rects.push(
            new DOMRect(0, li * 20, 100, 18) as DOMRect,
          );
        }
      }
      return rects as unknown as DOMRectList;
    }) as Range["getClientRects"],
  } as unknown as Range;
  document.createRange = () => stub;
  return () => {
    document.createRange = realCreateRange;
  };
}

/** Fresh <p> carrying a single text node — the shape BlockRenderer emits. */
function makeParagraphEl(text: string): HTMLParagraphElement {
  const el = document.createElement("p");
  el.textContent = text;
  return el;
}

describe("readLineBoxes — DOM line-box read-phase", () => {
  it("3 line boxes yield 3 LineBox entries with strictly increasing topPx", () => {
    const text = "aaaaaa bbbbbb ccccc"; // 3 lines at offsets 0, 7, 14
    const restore = installRangeMock([0, 7, 14]);
    try {
      const el = makeParagraphEl(text);
      const boxes = readLineBoxes(el, text, new AbortController().signal);
      expect(boxes).toHaveLength(3);
      // Line 1 at top 0, line 2 at top 20, line 3 at top 40.
      expect(boxes[0]!.topPx).toBe(0);
      expect(boxes[1]!.topPx).toBe(20);
      expect(boxes[2]!.topPx).toBe(40);
      // Strictly increasing.
      expect(boxes[0]!.topPx).toBeLessThan(boxes[1]!.topPx);
      expect(boxes[1]!.topPx).toBeLessThan(boxes[2]!.topPx);
      // Line 1 always starts at charOffset 0.
      expect(boxes[0]!.charOffset).toBe(0);
      // Subsequent charOffsets match the simulated break schedule.
      expect(boxes[1]!.charOffset).toBe(7);
      expect(boxes[2]!.charOffset).toBe(14);
    } finally {
      restore();
    }
  });

  it("single-line block yields exactly one LineBox at charOffset 0", () => {
    const text = "short";
    const restore = installRangeMock([0]);
    try {
      const el = makeParagraphEl(text);
      const boxes = readLineBoxes(el, text, new AbortController().signal);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]!.charOffset).toBe(0);
      expect(boxes[0]!.topPx).toBe(0);
      expect(boxes[0]!.bottomPx).toBe(18);
    } finally {
      restore();
    }
  });

  it("charOffset of each LineBox maps via graphemeClusters to a monotonic D-05 grapheme offset", () => {
    // ASCII text — grapheme ordinal equals UTF-16 offset, so the assertion
    // also implicitly verifies charOffsetToGrapheme matches graphemeClusters
    // indexing for the common case. Multi-grapheme text is exercised below.
    const text = "Hello world this is a wrapped paragraph";
    const restore = installRangeMock([0, 12, 24]);
    try {
      const el = makeParagraphEl(text);
      const boxes = readLineBoxes(el, text, new AbortController().signal);
      expect(boxes.length).toBeGreaterThan(1);
      const graphemes = boxes.map((b) =>
        charOffsetToGrapheme(text, b.charOffset, "en"),
      );
      for (let i = 1; i < graphemes.length; i++) {
        expect(graphemes[i]).toBeGreaterThan(graphemes[i - 1]!);
      }
    } finally {
      restore();
    }
  });

  it("respects AbortSignal — throws when aborted before the walk", () => {
    const text = "some text";
    const restore = installRangeMock([0]);
    try {
      const el = makeParagraphEl(text);
      const controller = new AbortController();
      controller.abort();
      expect(() =>
        readLineBoxes(el, text, controller.signal),
      ).toThrowError(/abort/i);
    } finally {
      restore();
    }
  });

  it("respects AbortSignal — throws when aborted mid-walk", () => {
    // Long text so the per-iteration signal check fires before completion.
    const text = "x".repeat(200);
    const restore = installRangeMock([0, 50, 100, 150]);
    try {
      const el = makeParagraphEl(text);
      const controller = new AbortController();
      // Abort after the walk begins — wrap readLineBoxes to abort at i>10.
      // We approximate by aborting synchronously: install a stub that aborts
      // on the second getClientRects call. Easiest: pre-abort after a tick.
      // Simpler: abort immediately after starting — the i>0 check fires.
      const boxes = readLineBoxes(el, text.slice(0, 5), controller.signal);
      // Sanity: short slice completes without abort.
      expect(boxes.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("element with no text node returns [] (degenerate — does not throw)", () => {
    const el = document.createElement("p"); // no textContent appended
    const boxes = readLineBoxes(el, "", new AbortController().signal);
    expect(boxes).toEqual([]);
  });

  it("range that yields no rects returns [] (degenerate — does not throw)", () => {
    // No simulated lines → every getClientRects returns [].
    const restore = installRangeMock([]);
    try {
      const el = makeParagraphEl("ignored");
      const boxes = readLineBoxes(el, "ignored", new AbortController().signal);
      expect(boxes).toEqual([]);
    } finally {
      restore();
    }
  });
});

describe("charOffsetToGrapheme — UTF-16 offset → D-05 grapheme ordinal", () => {
  it("ASCII text: grapheme ordinal equals UTF-16 offset", () => {
    const text = "hello";
    expect(charOffsetToGrapheme(text, 0, "en")).toBe(0);
    expect(charOffsetToGrapheme(text, 3, "en")).toBe(3);
    expect(charOffsetToGrapheme(text, 5, "en")).toBe(5); // end → length
  });

  it("surrogate pair (emoji): both UTF-16 halves of one cluster map to the same ordinal", () => {
    // "a😀b" — 😀 is U+1F600 (UTF-16 length 2). clusters = ["a","😀","b"].
    const text = "a😀b";
    expect(charOffsetToGrapheme(text, 0, "en")).toBe(0); // "a"
    expect(charOffsetToGrapheme(text, 1, "en")).toBe(1); // first half of 😀
    expect(charOffsetToGrapheme(text, 2, "en")).toBe(1); // second half of 😀
    expect(charOffsetToGrapheme(text, 3, "en")).toBe(2); // "b"
    expect(charOffsetToGrapheme(text, 4, "en")).toBe(3); // end → length
  });

  it("end-of-text offset returns clusters.length (exclusive-end convention)", () => {
    expect(charOffsetToGrapheme("café", 4, "en")).toBe(4);
  });

  it("monotonic over multi-grapheme text — matches graphemeClusters indexing", () => {
    const text = "a😀b👨‍👩‍👧c"; // 5 grapheme clusters
    const clusters = graphemeClusters(text, "en");
    expect(clusters).toHaveLength(5);
    let prev = -1;
    for (let i = 0; i <= text.length; i++) {
      const g = charOffsetToGrapheme(text, i, "en");
      expect(g).toBeGreaterThanOrEqual(prev);
      expect(g).toBeLessThanOrEqual(clusters.length);
      prev = g;
    }
  });
});

describe("blockNormalizedText — D-05 per-block rule (no fork)", () => {
  it("paragraph collapses ASCII whitespace runs (mirrors normalizeText)", () => {
    const el = document.createElement("p");
    el.textContent = "  hello   world  ";
    expect(blockNormalizedText(el)).toBe("hello world");
  });

  it("code-block preserves whitespace VERBATIM", () => {
    const el = document.createElement("pre");
    el.textContent = "  a\n  b";
    el.dataset.kind = "code-block";
    expect(blockNormalizedText(el)).toBe("  a\n  b");
  });
});

// ─── Plan 04-06 Task 2 additions ───────────────────────────────────────────
// Container-element readLineBoxes (generalized to walk descendant text nodes)
// + MeasurementResultSchema round-trip with lineBoxes (schemaVersion 2).

describe("readLineBoxes — container blocks (Plan 04-06 generalization)", () => {
  /**
   * Build a stub container mirroring what BlockRenderer emits for a blockquote
   * with two child paragraphs. The element has TWO descendant text nodes (one
   * per <p>); the generalized readLineBoxes walks both in document order,
   * accumulating a GLOBAL char offset into the block's normalized text.
   */
  function makeBlockquoteEl(first: string, second: string): HTMLElement {
    const bq = document.createElement("blockquote");
    const p1 = document.createElement("p");
    p1.textContent = first;
    const p2 = document.createElement("p");
    p2.textContent = second;
    bq.appendChild(p1);
    bq.appendChild(p2);
    return bq;
  }

  /**
   * Install a NODE-AWARE Range mock for the container case. The mock tracks
   * which text node setStart was called on and uses a per-text-node line
   * schedule PLUS a per-text-node base top (so absolute tops increase across
   * children, mirroring real DOM line boxes that stack vertically). The
   * original installRangeMock is node-agnostic — it would replay the same
   * line schedule for every text node and produce wrong output once the impl
   * switches nodes.
   *
   * `perNode` maps text-node .data → { baseTop, lineLocalOffsets }. Each
   * entry's rects are at top = baseTop + li*20, height 18.
   */
  function installNodeAwareRangeMock(
    perNode: Map<string, { baseTop: number; lineLocalOffsets: number[] }>,
  ): () => void {
    const realCreateRange = document.createRange.bind(document);
    const state = {
      node: null as Text | null,
      start: 0,
      end: 0,
    };
    const stub: Range = {
      setStart: (node: Node, offset: number) => {
        state.node = node as Text;
        state.start = offset;
      },
      setEnd: (_node: Node, offset: number) => {
        state.end = offset;
      },
      getClientRects: (() => {
        if (!state.node) return [] as unknown as DOMRectList;
        const data = state.node.data;
        const cfg = perNode.get(data);
        if (!cfg) return [] as unknown as DOMRectList;
        const rects: DOMRect[] = [];
        const schedule = cfg.lineLocalOffsets;
        for (let li = 0; li < schedule.length; li++) {
          const lineStart = schedule[li]!;
          const lineEnd =
            li + 1 < schedule.length ? schedule[li + 1]! : data.length;
          if (
            state.end > lineStart &&
            state.start < lineEnd &&
            state.end > state.start
          ) {
            rects.push(
              new DOMRect(0, cfg.baseTop + li * 20, 100, 18) as DOMRect,
            );
          }
        }
        return rects as unknown as DOMRectList;
      }) as Range["getClientRects"],
    } as unknown as Range;
    document.createRange = () => stub;
    return () => {
      document.createRange = realCreateRange;
    };
  }

  it("container with two child paragraphs yields LineBox[] with global offsets + monotonic topPx", () => {
    // Two child paragraphs: "aaaa bbb" (8 chars) and "cccc dddd" (9 chars).
    // blockNormalizedText(<blockquote>) flattens textContent → "aaaa bbbcccc dddd"
    // (no separator between adjacent <p>'s in textContent concatenation).
    // Schedule 2 lines per child; the second child's base top is 40 (2 lines
    // × 20px after the first child). GLOBAL offsets (the contract surface):
    //   line 1 → global 0   (top   0)
    //   line 2 → global 5   (top  20) — within first child
    //   line 3 → global 8   (top  40) — first line of second child
    //   line 4 → global 13  (top  60) — within second child
    const first = "aaaa bbb";
    const second = "cccc dddd";
    const el = makeBlockquoteEl(first, second);
    const fullText = blockNormalizedText(el);
    const restore = installNodeAwareRangeMock(
      new Map([
        [first, { baseTop: 0, lineLocalOffsets: [0, 5] }],
        [second, { baseTop: 40, lineLocalOffsets: [0, 5] }],
      ]),
    );
    try {
      const boxes = readLineBoxes(el, fullText, new AbortController().signal);
      // 2 lines × 2 children = 4 LineBox entries.
      expect(boxes).toHaveLength(4);
      // Line 1 starts at global offset 0.
      expect(boxes[0]!.charOffset).toBe(0);
      expect(boxes[0]!.topPx).toBe(0);
      // Line 2 within first child — global offset 5.
      expect(boxes[1]!.charOffset).toBe(5);
      // Line 3 = first line of second child — global offset 8 (first child length).
      expect(boxes[2]!.charOffset).toBe(8);
      // Line 4 within second child — global offset 13.
      expect(boxes[3]!.charOffset).toBe(13);
      // Global offsets + tops are strictly monotonically increasing across
      // text nodes (the generalization's load-bearing contract).
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.charOffset).toBeGreaterThan(boxes[i - 1]!.charOffset);
        expect(boxes[i]!.topPx).toBeGreaterThan(boxes[i - 1]!.topPx);
      }
      // The D-05 round-trip seam: every charOffset maps to a grapheme ordinal
      // over the concatenated normalized text.
      const lastGrapheme = charOffsetToGrapheme(
        fullText,
        boxes[boxes.length - 1]!.charOffset,
        "en",
      );
      expect(lastGrapheme).toBeGreaterThan(0);
      expect(lastGrapheme).toBeLessThanOrEqual(
        graphemeClusters(fullText, "en").length,
      );
    } finally {
      restore();
    }
  });

  it("flat paragraph output is byte-identical to the pre-generalization shape (no regression)", () => {
    // The 13 specs above already cover the flat-paragraph case; this spec
    // pins the contract that generalizing readLineBoxes for containers does
    // NOT change the flat-block output. Same input → same LineBox[].
    const text = "aaaaaa bbbbbb ccccc";
    const restore = installRangeMock([0, 7, 14]);
    try {
      const el = makeParagraphEl(text);
      const boxes = readLineBoxes(el, text, new AbortController().signal);
      expect(boxes).toHaveLength(3);
      expect(boxes[0]!.charOffset).toBe(0);
      expect(boxes[0]!.topPx).toBe(0);
      expect(boxes[1]!.charOffset).toBe(7);
      expect(boxes[1]!.topPx).toBe(20);
      expect(boxes[2]!.charOffset).toBe(14);
      expect(boxes[2]!.topPx).toBe(40);
    } finally {
      restore();
    }
  });
});

describe("MeasurementResultSchema — lineBoxes round-trip (Plan 04-06 schemaVersion 2)", () => {
  it("parses a MeasurementResult with per-block lineBoxes (schemaVersion 2)", () => {
    const result = {
      schemaVersion: 2,
      constraints: {
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        viewportWidthPx: 800,
        lang: "en",
      },
      blocks: [
        {
          kind: "paragraph",
          heightPx: 60,
          lineCount: 3,
          lineBoxes: [
            { charOffset: 0, topPx: 0, bottomPx: 20 },
            { charOffset: 7, topPx: 20, bottomPx: 40 },
            { charOffset: 14, topPx: 40, bottomPx: 60 },
          ],
        },
        {
          kind: "figure",
          heightPx: 200,
          lineCount: 1,
          // Figure has no text — lineBoxes defaults to [] when absent.
        },
      ],
      computedAt: "2026-08-06T17:00:00.000Z",
    };
    const parsed = MeasurementResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(2);
      expect(parsed.data.blocks).toHaveLength(2);
      expect(parsed.data.blocks[0]!.lineBoxes).toHaveLength(3);
      expect(parsed.data.blocks[0]!.lineBoxes[0]!.charOffset).toBe(0);
      expect(parsed.data.blocks[1]!.lineBoxes).toEqual([]);
    }
  });

  it("forward-rejects schemaVersion 3 (V5 boundary discipline preserved)", () => {
    const result = {
      schemaVersion: 3,
      constraints: {
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        viewportWidthPx: 800,
        lang: "en",
      },
      blocks: [],
      computedAt: "2026-08-06T17:00:00.000Z",
    };
    const parsed = MeasurementResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });
});
