// Issue #233 — giant-prose bounded continuations (unit seams).
//
// The block-aligned long-prose slice (blockWindow.ts) refuses any article
// whose single block exceeds the window capacity, so an enormous paragraph
// falls to the legacy whole-document path and dies on the 300-page ceiling.
// These tests pin the INTRA-BLOCK source-cursor path: giant paragraphs are
// sliced into ordered continuations that cover every source grapheme exactly
// once, strictly advance the cursor, and keep every coordinate in the
// original article's D-05 substrate (ADR 0011 — saved reading identity is
// never rewritten).
//
// The fixtures are pure ASCII, so the independent expected length is the
// string arithmetic itself (graphemes == UTF-16 units == characters) — the
// expectations below never re-run the segmentation the implementation uses.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import {
  articleGraphemeIndex,
  blockNormalizedText,
  graphemeClusters,
  inlineText,
} from "../../../src/content/normalizeText";
import {
  BlockWindowSchema,
  MeasurementScopeSchema,
  blockWindowForOffset,
  blockWindows,
  canUseBlockWindows,
} from "../../../src/pagination/blockWindow";
import type { BlockWindow } from "../../../src/pagination/blockWindow";
import { paginateDocument } from "../../../src/pagination/fragment";
import { pageStartGlobalOffset } from "../../../src/pagination/anchor";
import { splitParagraphBlock } from "../../../src/pagination/splitBlock";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";
const SEGMENT_LENGTH = "Segment 0000 of the enormous record. ".length; // 38 ASCII chars

/** The giant block's expected D-05 grapheme length, derived from the
 * fixture arithmetic alone: 38 chars per segment, minus the ONE trailing
 * space normalizeRunText trims off the single run (ASCII, so graphemes ==
 * characters — the expectation never re-runs segmentation). */
function expectedGiantLength(segmentCount: number): number {
  return segmentCount * SEGMENT_LENGTH - 1;
}

function giantBlock(segmentCount: number) {
  const text = Array.from(
    { length: segmentCount },
    (_, n) => `Segment ${String(n).padStart(4, "0")} of the enormous record. `,
  ).join("");
  return { kind: "paragraph" as const, content: [{ text, marks: [] }] };
}

function giantProseArticle(segmentCount = 758) {
  return ArticleSchema.parse({
    id: "giant-prose",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Giant prose",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-prose-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Enormous", marks: [] }] },
      giantBlock(segmentCount),
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** The article-global D-05 grapheme offset of a window's first source
 * grapheme — the cursor position the continuation starts at. */
const windowGlobalStart = (
  article: ReturnType<typeof giantProseArticle>,
  window: BlockWindow,
): number => {
  const offsets = articleGraphemeIndex(article).blockStartOffsets;
  return offsets[window.startBlock]! + (window.startGrapheme ?? 0);
};

describe("giant-prose continuations — window model", () => {
  it("admits a giant paragraph, but still refuses giant atomic kinds and footnote bodies", () => {
    expect(canUseBlockWindows(giantProseArticle())).toBe(true);
    // Atomic kinds have no intra-block split semantic — the honest legacy
    // path (explicit failure) stays theirs until a dedicated slice exists.
    expect(
      canUseBlockWindows(
        ArticleSchema.parse({
          ...giantProseArticle(),
          blocks: [
            giantProseArticle().blocks[0]!,
            {
              kind: "code-block" as const,
              source: Array.from({ length: 758 }, (_, n) => `line ${n}`).join("\n"),
              lang: "text",
            },
            giantProseArticle().blocks[2]!,
          ],
        }),
      ),
    ).toBe(false);
    expect(
      canUseBlockWindows(
        ArticleSchema.parse({
          ...giantProseArticle(),
          footnotes: [{ id: "fn-1", content: [{ text: "A footnote body.", marks: [] }] }],
        }),
      ),
    ).toBe(false);
  });

  it("slices one giant paragraph into ordered continuations covering it exactly once", () => {
    const article = giantProseArticle();
    const giantLength = expectedGiantLength(758);
    expect(articleGraphemeIndex(article).perBlockLengths[1]).toBe(giantLength);
    const windows = blockWindows(article);
    // The giant block's FIRST chunk fills the heading window's remaining
    // capacity (no heading-only window at the open); interior chunks are
    // single-block windows; the final chunk heads the trailing window and
    // carries the closing whole blocks.
    expect(windows).toEqual([
      { startBlock: 0, endBlock: 2, endGrapheme: 7992 },
      { startBlock: 1, endBlock: 2, startGrapheme: 7992, endGrapheme: 15992 },
      { startBlock: 1, endBlock: 2, startGrapheme: 15992, endGrapheme: 23992 },
      { startBlock: 1, endBlock: 3, startGrapheme: 23992 },
    ]);
    // Exactly-once coverage of the giant block's graphemes, in order: every
    // window that touches block 1 contributes one slice of it.
    const giantCoverage = (w: BlockWindow): { start: number; end: number } => ({
      start: w.startBlock === 1 ? (w.startGrapheme ?? 0) : 0,
      end: w.endBlock - 1 === 1 ? (w.endGrapheme ?? giantLength) : giantLength,
    });
    const covering = windows.filter((w) => w.startBlock <= 1 && w.endBlock > 1);
    expect(covering.length).toBe(4);
    let cursor = 0;
    for (const window of covering) {
      const slice = giantCoverage(window);
      expect(slice.start).toBe(cursor); // no gap, no overlap
      expect(slice.end - slice.start).toBeLessThanOrEqual(8000);
      cursor = slice.end;
    }
    expect(cursor).toBe(giantLength);
    // The trailing window's head slice begins exactly where the last full
    // continuation ended, and extends to the block end (no endGrapheme).
    const trailing = windows.at(-1)!;
    expect(trailing.startGrapheme).toBe(23992);
    expect(trailing.endGrapheme).toBeUndefined();
  });

  it("strictly advances the source cursor across continuations", () => {
    const article = giantProseArticle();
    const windows = blockWindows(article);
    for (let i = 1; i < windows.length; i++) {
      const previous = windowGlobalStart(article, windows[i - 1]!);
      const current = windowGlobalStart(article, windows[i]!);
      expect(current).toBeGreaterThan(previous);
    }
  });

  it("maps offsets to the continuation containing them, and the end pin to the final one", () => {
    const article = giantProseArticle();
    const offsets = articleGraphemeIndex(article).blockStartOffsets;
    const windows = blockWindows(article);
    const giantStart = offsets[1]!; // heading (8) + one separator
    // Inside the heading → first window. Mid-second-slice → that slice.
    expect(blockWindowForOffset(article, 0)).toEqual(windows[0]);
    expect(blockWindowForOffset(article, giantStart + 12000)).toEqual(windows[1]);
    // A seam offset opens the NEXT continuation (half-open ranges).
    expect(blockWindowForOffset(article, giantStart + 15992)).toEqual(windows[2]);
    // Separator graphemes before the closing block stay in the last window.
    expect(blockWindowForOffset(article, offsets[2]! - 1)).toEqual(windows.at(-1));
    expect(blockWindowForOffset(article, Number.MAX_SAFE_INTEGER)).toEqual(windows.at(-1));
  });

  it("keeps the block-aligned baseline unchanged for works without giant blocks", () => {
    const ordinary = ArticleSchema.parse({
      ...giantProseArticle(),
      blocks: Array.from({ length: 40 }, (_, i) => ({
        kind: "paragraph" as const,
        content: [{ text: `Passage ${i} of ordinary length.`, marks: [] }],
      })),
    });
    const windows = blockWindows(ordinary);
    expect(windows.length).toBeGreaterThan(1);
    for (const window of windows) {
      expect(window.startGrapheme).toBeUndefined();
      expect(window.endGrapheme).toBeUndefined();
    }
    // A paragraph of exactly the window capacity is one whole window block —
    // slicing only ever engages when a single block EXCEEDS the capacity.
    const exact = giantProseArticle();
    const exactFit = ArticleSchema.parse({
      ...exact,
      blocks: [exact.blocks[0]!, giantBlock(210), exact.blocks[2]!],
    });
    // 210 segments = 7980 graphemes (< 8000): still ordinary accumulation.
    for (const window of blockWindows(exactFit)) {
      expect(window.startGrapheme).toBeUndefined();
      expect(window.endGrapheme).toBeUndefined();
    }
  });

  it("validates the window and scope shapes at the boundary", () => {
    // Slice bounds attach to a window's own first/last block — any window
    // span may carry them (a giant chunk can share a window with whole
    // neighbors on either side).
    expect(() =>
      BlockWindowSchema.parse({ startBlock: 1, endBlock: 3, endGrapheme: 8000 }),
    ).not.toThrow();
    expect(() => BlockWindowSchema.parse({ startBlock: 2, endBlock: 2 })).toThrow();
    expect(() =>
      BlockWindowSchema.parse({
        startBlock: 1,
        endBlock: 2,
        startGrapheme: 8000,
        endGrapheme: 16000,
      }),
    ).not.toThrow();
    expect(() =>
      MeasurementScopeSchema.parse({
        articleId: "giant-prose",
        revision: 1,
        startBlock: 1,
        endBlock: 2,
        startGrapheme: -1,
      }),
    ).toThrow();
    // The scope boundary carries the SAME start<end rule as the window
    // schema — one rule, both boundary contracts.
    expect(() =>
      MeasurementScopeSchema.parse({
        articleId: "giant-prose",
        revision: 1,
        startBlock: 2,
        endBlock: 2,
      }),
    ).toThrow();
    expect(() =>
      MeasurementScopeSchema.parse({
        articleId: "giant-prose",
        revision: 1,
        startBlock: 1,
        endBlock: 2,
        startGrapheme: 8000,
        endGrapheme: 16000,
      }),
    ).not.toThrow();
  });
});

// ── Pagination-engine seam: slice-scoped measurement → pages ────────────────

const LINE_PX = 20;
const GRAPHEMES_PER_LINE = 20;

/**
 * A trusted measurement for a giant-block window: row r renders `lines[r]
 * ?? lines.at(-1)` synthetic line boxes. A SLICED head row's charOffsets are
 * SLICE-LOCAL UTF-16 ordinals (the rendered slice's own text stream — what
 * readLineBoxes would report for the projected element); whole rows are
 * block-local.
 */
function sliceMeasurement(
  article: ReturnType<typeof giantProseArticle>,
  window: BlockWindow,
  opts: { lines: number[] },
): MeasurementResult {
  const rowCount = window.endBlock - window.startBlock;
  const fallbackLines = opts.lines.at(-1)!;
  const blocks = Array.from({ length: rowCount }, (_, row) => {
    const lines = opts.lines[row] ?? fallbackLines;
    return {
      kind: "paragraph",
      heightPx: lines * LINE_PX,
      marginBlockStartPx: 0,
      marginBlockEndPx: 0,
      lineCount: lines,
      lineBoxes: Array.from({ length: lines }, (_, k) => ({
        charOffset: k * GRAPHEMES_PER_LINE,
        topPx: k * LINE_PX,
        bottomPx: (k + 1) * LINE_PX,
      })),
    };
  });
  return {
    schemaVersion: 2,
    constraints: {
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      viewportWidthPx: 800,
      lang: "en",
    },
    computedAt: "2026-01-01T00:00:00Z",
    scope: {
      articleId: article.id,
      revision: article.revision,
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      ...(window.startGrapheme !== undefined ? { startGrapheme: window.startGrapheme } : {}),
      ...(window.endGrapheme !== undefined ? { endGrapheme: window.endGrapheme } : {}),
    },
    blocks,
  };
}

function paginateSlice(
  article: ReturnType<typeof giantProseArticle>,
  window: BlockWindow,
  opts: { lines: number[]; pageHeightPx: number },
) {
  return paginateDocument({
    article,
    measurement: sliceMeasurement(article, window, { lines: opts.lines }),
    pageContentBoxHeightPx: opts.pageHeightPx,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

/** Every page-entry range of a single-block continuation pagination. */
function entryRanges(
  pages: ReturnType<typeof paginateSlice>["pages"],
): { start: number; end: number }[] {
  return pages.flatMap((page) =>
    page.blocks.map((entry) => ({ start: entry.startGrapheme, end: entry.endGrapheme })),
  );
}

describe("giant-prose continuations — pagination engine", () => {
  it("paginates one continuation strictly within its slice bounds, in whole-block coordinates", () => {
    const article = giantProseArticle();
    // Second continuation [8000, 16000), 400 slice lines of 20px, page box
    // 200px → ten 20px lines per page → a strictly-advancing page walk.
    const window: BlockWindow = {
      startBlock: 1,
      endBlock: 2,
      startGrapheme: 8000,
      endGrapheme: 16000,
    };
    const result = paginateSlice(article, window, { lines: [400], pageHeightPx: 200 });
    expect(result.status).toBe("ok");
    const ranges = entryRanges(result.pages);
    expect(ranges.length).toBeGreaterThan(1);
    // Whole-block coordinates: the first page OPENS at the slice origin and
    // the last page CLOSES at the slice end (never slice-local 0/N).
    expect(ranges[0]!.start).toBe(8000);
    expect(ranges.at(-1)!.end).toBe(16000);
    // Exactly-once contiguous coverage: each page continues where the
    // previous stopped, no gaps, no overlaps, all inside the slice.
    let cursor = 8000;
    for (const range of ranges) {
      expect(range.start).toBe(cursor);
      expect(range.end).toBeGreaterThan(range.start);
      expect(range.end).toBeLessThanOrEqual(16000);
      cursor = range.end;
    }
    expect(cursor).toBe(16000);
    // Every entry names the ORIGINAL block (identity never rewritten).
    expect(result.pages.every((page) => page.blocks.every((b) => b.blockIndex === 1))).toBe(true);
  });

  it("keeps continuation paginations continuous in original global coordinates", () => {
    const article = giantProseArticle();
    const windows = blockWindows(article).filter((w) => w.startBlock === 1);
    const first = windows[1]!; // [8000, 16000)
    const second = windows[2]!; // [16000, 24000)
    const a = paginateSlice(article, first, { lines: [400], pageHeightPx: 200 });
    const b = paginateSlice(article, second, { lines: [400], pageHeightPx: 200 });
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    // A's final grapheme and B's first grapheme are adjacent source
    // positions: one past A's last page == B's first page start.
    const aEnd = pageStartGlobalOffset(article, a.pages.at(-1)!);
    const aLastRange = a.pages.at(-1)!.blocks.at(-1)!;
    const aEndExclusive = aEnd - aLastRange.startGrapheme + aLastRange.endGrapheme;
    expect(pageStartGlobalOffset(article, b.pages[0]!)).toBe(aEndExclusive);
    // And B strictly advances the global cursor past A's whole window.
    expect(pageStartGlobalOffset(article, b.pages[0]!)).toBeGreaterThan(
      pageStartGlobalOffset(article, a.pages[0]!),
    );
  });

  it("rejects out-of-range slice origins instead of pairing rows with other content", () => {
    const article = giantProseArticle();
    const giantLength = articleGraphemeIndex(article).perBlockLengths[1]!;
    const beyond: BlockWindow = {
      startBlock: 1,
      endBlock: 2,
      startGrapheme: giantLength,
    };
    expect(paginateSlice(article, beyond, { lines: [10], pageHeightPx: 200 }).reason).toBe(
      "measurement-scope-mismatch",
    );
    const emptyEnd: BlockWindow = { startBlock: 1, endBlock: 2, endGrapheme: 0 };
    expect(paginateSlice(article, emptyEnd, { lines: [10], pageHeightPx: 200 }).reason).toBe(
      "measurement-scope-mismatch",
    );
    const pastEnd: BlockWindow = { startBlock: 1, endBlock: 2, endGrapheme: giantLength + 1 };
    expect(paginateSlice(article, pastEnd, { lines: [10], pageHeightPx: 200 }).reason).toBe(
      "measurement-scope-mismatch",
    );
    // A slice scope is a PROSE scope: the guard enforces the kind invariant
    // the paragraph rebase + window projection rely on.
    const containerArticle = ArticleSchema.parse({
      ...article,
      blocks: [
        article.blocks[0]!,
        {
          kind: "blockquote" as const,
          children: [{ kind: "paragraph" as const, content: [{ text: "Quoted. ".repeat(400) }] }],
        },
        article.blocks[2]!,
      ],
    });
    const slicedContainer: BlockWindow = {
      startBlock: 1,
      endBlock: 2,
      startGrapheme: 10,
      endGrapheme: 300,
    };
    expect(
      paginateDocument({
        article: containerArticle,
        measurement: sliceMeasurement(containerArticle, slicedContainer, { lines: [10] }),
        pageContentBoxHeightPx: 200,
        diagnostics: new DiagnosticBus(),
        signal: new AbortController().signal,
      }).reason,
    ).toBe("measurement-scope-mismatch");
  });

  it("keeps genuinely unpageable slice content an explicit typed failure", () => {
    const article = giantProseArticle();
    // Fewer lines than the 2/2 widow rule needs and too tall for the page:
    // the slice cannot be split or moved — the honest typed fallback, not a
    // manufactured page.
    const window: BlockWindow = { startBlock: 1, endBlock: 2 };
    const result = paginateSlice(article, window, { lines: [3], pageHeightPx: 40 });
    expect(result.status).toBe("fallback");
    expect(result.reason).toBe("unsplittable-block-overflow");
  });

  it("slices a paragraph at intra-block grapheme ranges preserving markup and the stream", () => {
    const article = giantProseArticle();
    const block = article.blocks[1]!;
    const normClusters = graphemeClusters(blockNormalizedText(block), article.lang);
    // A window that cuts INSIDE the run text on both sides.
    const sliced = splitParagraphBlock(block, 100, 300, article.lang) as Extract<
      typeof block,
      { kind: "paragraph" }
    >;
    expect(sliced.kind).toBe("paragraph");
    expect(inlineText(sliced.content)).toBe(normClusters.slice(100, 300).join(""));
  });
});

// ── Anchor-coordinate seam: saved positions stay original across seams ──────

import { pageAnchorOffset } from "../../../src/pagination/anchor";
import { endPinOffset } from "../../../src/reader/readingPosition";

describe("giant-prose continuations — saved-position coordinates", () => {
  it("never completes the work at an intermediate continuation's page anchor", () => {
    const article = giantProseArticle();
    const total = articleGraphemeIndex(article).totalGraphemes;
    // The [8000, 16000) continuation paginated as its own tiny page set —
    // even a ONE-page continuation mid-block must not read as finished.
    const mid: BlockWindow = {
      startBlock: 1,
      endBlock: 2,
      startGrapheme: 8000,
      endGrapheme: 12000,
    };
    const result = paginateSlice(article, mid, { lines: [200], pageHeightPx: 8000 });
    expect(result.status).toBe("ok");
    expect(result.pages).toHaveLength(1);
    const anchor = pageAnchorOffset(article, result.pages, 0);
    expect(anchor).toBe(pageStartGlobalOffset(article, result.pages[0]!));
    expect(anchor).toBeLessThan(total);
  });

  it("pins the true end only from the final continuation of the work", () => {
    const article = giantProseArticle();
    const total = articleGraphemeIndex(article).totalGraphemes;
    const trailing = blockWindows(article).at(-1)!;
    expect(trailing.startGrapheme).toBeGreaterThan(0); // begins mid-giant-block
    const result = paginateSlice(article, trailing, { lines: [203, 2], pageHeightPx: 200 });
    expect(result.status).toBe("ok");
    const anchor = pageAnchorOffset(article, result.pages, result.pages.length - 1);
    expect(anchor).toBe(endPinOffset(article));
    expect(endPinOffset(article)).toBe(total);
    // An interior continuation of the same walk stays strictly below it.
    const interior = paginateSlice(article, blockWindows(article)[1]!, {
      lines: [400],
      pageHeightPx: 200,
    });
    expect(pageAnchorOffset(article, interior.pages, interior.pages.length - 1)).toBeLessThan(
      total,
    );
  });

  it("keeps page-start offsets contiguous with the block's own coordinate space", () => {
    const article = giantProseArticle();
    const offsets = articleGraphemeIndex(article).blockStartOffsets;
    const giantStart = offsets[1]!;
    // The first window's first page begins exactly at the article's own
    // start (the heading heads it; the giant chunk follows on the page).
    const first = paginateSlice(article, blockWindows(article)[0]!, {
      lines: [1, 400],
      pageHeightPx: 200,
    });
    expect(pageStartGlobalOffset(article, first.pages[0]!)).toBe(0);
    // The second continuation's first page begins exactly one slice in
    // (the first window consumed 7992 giant graphemes beside the heading).
    const second = paginateSlice(article, blockWindows(article)[1]!, {
      lines: [400],
      pageHeightPx: 200,
    });
    expect(pageStartGlobalOffset(article, second.pages[0]!)).toBe(giantStart + 7992);
    // And the third exactly one more slice in.
    const third = paginateSlice(article, blockWindows(article)[2]!, {
      lines: [400],
      pageHeightPx: 200,
    });
    expect(pageStartGlobalOffset(article, third.pages[0]!)).toBe(giantStart + 15992);
  });
});

// ── Coordinate-bridge seam: line-box rebase == the rendered slice ───────────

import {
  rawPrefixUtf16ForNormOffset,
  charOffsetToNormGrapheme,
} from "../../../src/pagination/splitBlock";
import { blockRawText } from "../../../src/pagination/splitBlock";

describe("giant-prose continuations — line-box rebase", () => {
  it("rebases slice-local charOffsets onto exactly the rendered slice's raw stream", () => {
    const article = giantProseArticle();
    const block = article.blocks[1]!;
    const runs = (block as Extract<typeof block, { kind: "paragraph" }>).content;
    const rawConcat = blockRawText(block);
    // Every probe offset: the prefix computed for the engine's line-box
    // rebase must point at EXACTLY the raw text the projected slice renders
    // — otherwise split points drift against the visible window.
    for (const start of [1, 37, 500, 7992, 12000, 24000]) {
      const sliced = splitParagraphBlock(block, start, start + 1000, article.lang) as Extract<
        typeof block,
        { kind: "paragraph" }
      >;
      const sliceRaw = sliced.content.map((r) => r.text).join("");
      const prefix = rawPrefixUtf16ForNormOffset(runs, start, article.lang);
      expect(rawConcat.slice(prefix, prefix + sliceRaw.length)).toBe(sliceRaw);
      // The rebased origin lands at/inside the slice (a boundary whitespace
      // cluster may place the first rendered grapheme just past it).
      const originNorm = charOffsetToNormGrapheme(runs, prefix, article.lang);
      expect(originNorm).toBeGreaterThanOrEqual(Math.max(0, start - 1));
      expect(originNorm).toBeLessThanOrEqual(start);
    }
    // Past-the-end charOffsets resolve to the norm length (exclusive end).
    expect(charOffsetToNormGrapheme(runs, rawConcat.length + 5, article.lang)).toBe(
      articleGraphemeIndex(article).perBlockLengths[1],
    );
  });
});

describe("container rows keep the whole-block split bridge", () => {
  it("splits a blockquote/list row without a slice scope through the container path", () => {
    // Containers are never slice-scoped (issue #233 is prose-only), but they
    // DO split at page boundaries — their raw text is not a flat run array,
    // so the conversion must keep the whole-block bridge instead of reading
    // a paragraph .content that does not exist.
    const containerArticle = ArticleSchema.parse({
      ...giantProseArticle(),
      blocks: [
        giantProseArticle().blocks[0]!,
        {
          kind: "blockquote" as const,
          children: [
            {
              kind: "paragraph" as const,
              content: [{ text: "Quoted half one. ".repeat(400), marks: [] }],
            },
            {
              kind: "paragraph" as const,
              content: [{ text: "Quoted half two. ".repeat(400), marks: [] }],
            },
          ],
        },
      ],
    });
    const lineCount = 40;
    const measurement = {
      schemaVersion: 2 as const,
      constraints: {
        font: "serif" as const,
        size: 18 as const,
        measure: 64 as const,
        spacing: "comfortable" as const,
        viewportWidthPx: 800,
        lang: "en",
      },
      computedAt: "2026-01-01T00:00:00Z",
      scope: {
        articleId: containerArticle.id,
        revision: containerArticle.revision,
        startBlock: 1,
        endBlock: 2,
      },
      blocks: [
        {
          kind: "blockquote",
          heightPx: lineCount * LINE_PX,
          marginBlockStartPx: 0,
          marginBlockEndPx: 0,
          lineCount,
          lineBoxes: Array.from({ length: lineCount }, (_, k) => ({
            charOffset: k * GRAPHEMES_PER_LINE,
            topPx: k * LINE_PX,
            bottomPx: (k + 1) * LINE_PX,
          })),
        },
      ],
    };
    const result = paginateDocument({
      article: containerArticle,
      measurement,
      pageContentBoxHeightPx: 200,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    const ranges = entryRanges(result.pages);
    expect(ranges[0]!.start).toBe(0);
    expect(ranges.at(-1)!.end).toBeGreaterThan(0);
    let cursor = 0;
    for (const range of ranges) {
      expect(range.start).toBe(cursor);
      cursor = range.end;
    }
  });
});

// ── Overflow correction inside a continuation (spec: correction keeps it) ──
// The post-render guard (refragmentOverflowingPage) runs on LIVE DOM; jsdom
// is not authoritative for layout, so this mirrors overflowGuard.test.ts's
// stub discipline: stub child rects + mock readLineBoxes, then assert a
// window-slice page corrects WITHIN its slice bounds and still advances.

import { vi } from "vitest";
const readLineBoxesMock =
  vi.fn<(el: HTMLElement, fullText: string, signal: AbortSignal) => LineBox[]>();
vi.mock("../../../src/pagination/lineBoxes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/pagination/lineBoxes")>();
  return {
    ...actual,
    readLineBoxes: (...args: Parameters<typeof actual.readLineBoxes>) => readLineBoxesMock(...args),
  };
});

import { refragmentOverflowingPage } from "../../../src/pagination/overflowGuard";
import type { LineBox } from "../../../src/measurement/types";

describe("giant-prose continuations — overflow correction mid-continuation", () => {
  function stubRect(r: { top: number; bottom: number; height: number }): DOMRect {
    return {
      top: r.top,
      bottom: r.bottom,
      left: 0,
      right: 0,
      width: 0,
      height: r.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  function makeFragmentEl(text: string): HTMLElement {
    const fragment = document.createElement("section");
    fragment.className = "page-fragment";
    fragment.getBoundingClientRect = () => stubRect({ top: 0, bottom: 0, height: 0 });
    const child = document.createElement("p");
    child.setAttribute("data-block-index", "1");
    child.textContent = text;
    // The rendered slice overflows its page by a wide margin.
    child.getBoundingClientRect = () => stubRect({ top: 0, bottom: 5000, height: 5000 });
    fragment.appendChild(child);
    return fragment as unknown as HTMLElement;
  }

  it("corrects a slice-boundary page within its slice and keeps the continuation advanceable", () => {
    const article = giantProseArticle();
    readLineBoxesMock.mockImplementation((el, fullText) =>
      uniformLines(fullText.length, 20).map((lb) => ({
        ...lb,
        topPx: lb.topPx + (el.getBoundingClientRect().top || 0),
        bottomPx: lb.bottomPx + (el.getBoundingClientRect().top || 0),
      })),
    );
    const giantNorm = blockNormalizedText(article.blocks[1]!);
    const sliceText = giantNorm.slice(8000, 16000); // the [8000, 16000) window
    const pages: import("../../../src/pagination/types").PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [{ blockIndex: 1, startGrapheme: 8000, endGrapheme: 16000 }],
      },
    ];
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl: makeFragmentEl(sliceText),
      pageContentBoxHeightPx: 700,
      tolerance: 2,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    // Usable pages: the guard corrected the page instead of failing it.
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    const ranges = result!.flatMap((page) =>
      page.blocks.map((b) => ({ start: b.startGrapheme, end: b.endGrapheme })),
    );
    // The correction stays INSIDE the continuation's slice bounds and still
    // covers it exactly once — the rest of the work remains advanceable.
    expect(ranges[0]!.start).toBe(8000);
    expect(ranges.at(-1)!.end).toBe(16000);
    let cursor = 8000;
    for (const range of ranges) {
      expect(range.start).toBe(cursor);
      expect(range.end).toBeGreaterThan(range.start);
      expect(range.end).toBeLessThanOrEqual(16000);
      cursor = range.end;
    }
    expect(cursor).toBe(16000);
  });
});

/** Uniform synthetic line boxes (each `charsPerLine` wide, 20px tall). */
function uniformLines(textLength: number, charsPerLine: number): LineBox[] {
  const count = Math.max(1, Math.ceil(textLength / charsPerLine));
  return Array.from({ length: count }, (_, k) => ({
    charOffset: k * charsPerLine,
    topPx: k * 20,
    bottomPx: (k + 1) * 20 - 2,
  }));
}
