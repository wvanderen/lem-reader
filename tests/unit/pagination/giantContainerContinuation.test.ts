// Issue #234 — giant container bounded continuations (unit seams).
//
// #233's intra-block source cursor covered prose only: any article whose
// single list or blockquote exceeded the window capacity fell to the legacy
// whole-document path and its unbounded measurement. These tests pin the
// container extension at the two seams the reader feels:
//
//   1. The window model (blockWindow.ts): giant lists/quotations slice into
//      ordered continuations that cover every source grapheme exactly once,
//      strictly advance the cursor, and keep every coordinate in the
//      original article's D-05 substrate (ADR 0011 — saved reading identity
//      is never rewritten). Giant ATOMIC kinds keep the honest legacy path.
//
//   2. The pagination engine (fragment.ts): a container slice scope
//      paginates WITHIN its slice bounds in whole-block coordinates, splits
//      repeatedly inside one window, and rebases slice-local line boxes
//      through the same rule the projection renders by.
//
// Fixtures are pure ASCII with raw == normalized streams where exact split
// arithmetic is asserted, so expectations are string arithmetic — never a
// re-run of the implementation.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import {
  blockWindowForOffset,
  blockWindows,
  canUseBlockWindows,
  refineWindow,
  windowHasNext,
  windowHasPrevious,
} from "../../../src/pagination/blockWindow";
import type { BlockWindow } from "../../../src/pagination/blockWindow";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import { paginateDocument } from "../../../src/pagination/fragment";
import type { MeasurementResult } from "../../../src/measurement/types";
import {
  giantListArticle,
  giantListItemArticle,
  giantQuoteArticle,
  shortListQuoteArticle,
} from "../../fixtures/giantContainers";
import { giantCodeArticle } from "../../fixtures/giantProse";

const LANG_EN = "en";

describe("giant-container continuations — window model", () => {
  it("admits giant lists and quotations, but still refuses giant atomic kinds and footnote bodies", () => {
    expect(canUseBlockWindows(giantListArticle())).toBe(true);
    expect(canUseBlockWindows(giantQuoteArticle())).toBe(true);
    expect(canUseBlockWindows(giantListItemArticle())).toBe(true);
    // Atomic kinds have no intra-block split semantic — the honest legacy
    // path stays theirs.
    expect(canUseBlockWindows(giantCodeArticle())).toBe(false);
    // Footnote bodies keep the whole-document region outside windows.
    const withFootnote = giantQuoteArticle();
    expect(
      canUseBlockWindows({
        ...withFootnote,
        footnotes: [{ id: "fn-1", content: [{ text: "A footnote body.", marks: [] }] }],
      }),
    ).toBe(false);
  });

  it("keeps the block-aligned baseline for works without giant blocks", () => {
    for (const window of blockWindows(shortListQuoteArticle())) {
      expect(window.startGrapheme).toBeUndefined();
      expect(window.endGrapheme).toBeUndefined();
    }
  });

  it("slices one giant list into ordered continuations covering it exactly once", () => {
    const article = giantListArticle();
    const index = articleGraphemeIndex(article);
    const listLength = index.perBlockLengths[1]!;
    expect(listLength).toBeGreaterThan(8000);
    const windows = blockWindows(article);
    // The giant block's FIRST chunk fills the heading window's remaining
    // capacity; interior chunks are single-block windows; the final chunk
    // heads the trailing window with the closing whole blocks (#233 rule).
    const covering = windows.filter((w) => w.startBlock <= 1 && w.endBlock > 1);
    expect(covering.length).toBeGreaterThanOrEqual(3);
    let cursor = 0;
    for (const window of covering) {
      const slice = {
        start: window.startBlock === 1 ? (window.startGrapheme ?? 0) : 0,
        end: window.endBlock - 1 === 1 ? (window.endGrapheme ?? listLength) : listLength,
      };
      expect(slice.start).toBe(cursor); // no gap, no overlap
      expect(slice.end - slice.start).toBeLessThanOrEqual(8000);
      cursor = slice.end;
    }
    expect(cursor).toBe(listLength);
    // Whole neighbors keep block-aligned windows (ordinary shape unchanged).
    expect(windows[0]).toEqual({ startBlock: 0, endBlock: 2, endGrapheme: 8000 - 11 });
    // The final chunk (7989 + 8000 = 15989 ≥ 23681 — no second interior
    // chunk) heads the trailing window with the closing whole blocks.
    expect(windows.at(-1)).toEqual({ startBlock: 1, endBlock: 4, startGrapheme: 15989 });
  });

  it("slices a giant quotation with several nested blocks the same way", () => {
    const article = giantQuoteArticle();
    const index = articleGraphemeIndex(article);
    const quoteLength = index.perBlockLengths[1]!;
    expect(quoteLength).toBeGreaterThan(16000); // several continuations
    let cursor = 0;
    for (const window of blockWindows(article).filter((w) => w.startBlock <= 1 && w.endBlock > 1)) {
      const slice = {
        start: window.startBlock === 1 ? (window.startGrapheme ?? 0) : 0,
        end: window.endBlock - 1 === 1 ? (window.endGrapheme ?? quoteLength) : quoteLength,
      };
      expect(slice.start).toBe(cursor);
      expect(slice.end - slice.start).toBeLessThanOrEqual(8000);
      cursor = slice.end;
    }
    expect(cursor).toBe(quoteLength);
  });

  it("slices INSIDE one enormous list item rather than only between items", () => {
    const article = giantListItemArticle();
    const index = articleGraphemeIndex(article);
    const listLength = index.perBlockLengths[1]!;
    expect(listLength).toBeGreaterThan(8000);
    // Only FOUR ordinary items flank the giant fourth item — the ordinary
    // items cannot fill a continuation alone, so every slice boundary past
    // the first falls INSIDE the giant item's graphemes.
    const covering = blockWindows(article).filter((w) => w.startBlock <= 1 && w.endBlock > 1);
    expect(covering.length).toBeGreaterThanOrEqual(2);
    let cursor = 0;
    for (const window of covering) {
      const slice = {
        start: window.startBlock === 1 ? (window.startGrapheme ?? 0) : 0,
        end: window.endBlock - 1 === 1 ? (window.endGrapheme ?? listLength) : listLength,
      };
      expect(slice.start).toBe(cursor);
      cursor = slice.end;
    }
    expect(cursor).toBe(listLength);
  });

  it("maps offsets to the continuation containing them across a container", () => {
    const article = giantListArticle();
    const index = articleGraphemeIndex(article);
    const windows = blockWindows(article);
    const listStart = index.blockStartOffsets[1]!;
    expect(blockWindowForOffset(article, 0)).toEqual(windows[0]);
    expect(blockWindowForOffset(article, listStart + 12000)).toEqual(windows[1]);
    // A seam offset opens the NEXT continuation (half-open ranges).
    const seam = listStart + (windows[0]!.endGrapheme ?? 0);
    expect(blockWindowForOffset(article, seam)).toEqual(windows[1]);
    // The end pin lands in the final continuation.
    expect(blockWindowForOffset(article, Number.MAX_SAFE_INTEGER)).toEqual(windows.at(-1));
  });

  it("refines a container window at a capacity cursor into two covering children", () => {
    const article = giantListArticle();
    const index = articleGraphemeIndex(article);
    const current = blockWindows(article)[1]!;
    const cut = {
      blockIndex: 1,
      startGrapheme: current.startGrapheme! + 2000,
    };
    const refined = refineWindow(article, current, cut);
    expect(refined).not.toBeNull();
    const [prefix, tail] = refined!;
    // Both children cover exactly the same original source range: the
    // prefix runs [current, current + cut) and the tail runs [current + cut,
    // currentEnd) — contiguous, no gap, no overlap, nothing renumbered.
    const global = (w: BlockWindow) =>
      index.blockStartOffsets[w.startBlock]! + (w.startGrapheme ?? 0);
    expect(global(prefix)).toBe(global(current));
    expect(global(tail)).toBe(global(current) + 2000);
    expect(prefix.endGrapheme).toBe(current.startGrapheme! + 2000);
    expect(tail.endGrapheme).toBe(current.endGrapheme);
    // The refined windows keep the neighbor semantics intact.
    expect(windowHasPrevious(article, tail)).toBe(true);
    expect(windowHasNext(article, prefix)).toBe(true);
  });
});

// ── Pagination-engine seam: container slice scopes → pages ─────────────────

const LINE_PX = 20;
const GRAPHEMES_PER_LINE = 20;

/** One quoted-ASCII run whose raw stream IS its normalized stream (single
 * spaces inside, trimmed ends): exact split arithmetic for the engine's
 * container rebase. */
function giantQuoteChild(segments: number): string {
  return Array.from(
    { length: segments },
    (_, n) => `Quote ${String(n).padStart(4, "0")} of the enormous record.`,
  ).join(" ");
}

function singleChildQuoteArticle(segments: number) {
  return ArticleSchema.parse({
    id: "engine-quote-scope",
    revision: 1,
    lang: LANG_EN,
    provenance: {
      title: "Engine quote scope",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "engine-quote-scope-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Citation", marks: [] }] },
      {
        kind: "blockquote",
        children: [
          { kind: "paragraph", content: [{ text: giantQuoteChild(segments), marks: [] }] },
        ],
      },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** A trusted measurement for a window: row r renders `lines[r] ?? last`
 * synthetic line boxes. A SLICED head row's charOffsets are SLICE-LOCAL
 * UTF-16 ordinals (what readLineBoxes reports for the projected element). */
function sliceMeasurement(
  article: ReturnType<typeof singleChildQuoteArticle>,
  window: { startBlock: number; endBlock: number; startGrapheme?: number; endGrapheme?: number },
  kind: string,
  lines: number[],
): MeasurementResult {
  const rowCount = window.endBlock - window.startBlock;
  const fallbackLines = lines.at(-1)!;
  return {
    schemaVersion: 2,
    constraints: {
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      viewportWidthPx: 800,
      lang: LANG_EN,
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
    blocks: Array.from({ length: rowCount }, (_, row) => {
      const count = lines[row] ?? fallbackLines;
      return {
        kind,
        heightPx: count * LINE_PX,
        marginBlockStartPx: 0,
        marginBlockEndPx: 0,
        lineCount: count,
        lineBoxes: Array.from({ length: count }, (_, k) => ({
          charOffset: k * GRAPHEMES_PER_LINE,
          topPx: k * LINE_PX,
          bottomPx: (k + 1) * LINE_PX,
        })),
      };
    }),
  };
}

function paginate(
  article: ReturnType<typeof singleChildQuoteArticle> | ReturnType<typeof giantListArticle>,
  window: { startBlock: number; endBlock: number; startGrapheme?: number; endGrapheme?: number },
  kind: string,
  lines: number[],
  pageHeightPx = 200,
) {
  return paginateDocument({
    article,
    measurement: sliceMeasurement(article, window, kind, lines),
    pageContentBoxHeightPx: pageHeightPx,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

describe("giant-container continuations — pagination engine", () => {
  it("accepts a blockquote slice scope and paginates strictly within its bounds", () => {
    // 400 segments × 35 chars + separators = a raw==norm stream; the
    // continuation [8000, 16000) is 400 slice lines → ten 20px lines per
    // page → a strictly-advancing page walk across ONE window.
    const article = singleChildQuoteArticle(1200);
    const quoteLength = articleGraphemeIndex(article).perBlockLengths[1]!;
    expect(quoteLength).toBeGreaterThan(40000);
    const window = { startBlock: 1, endBlock: 2, startGrapheme: 8000, endGrapheme: 16000 };
    const result = paginate(article, window, "blockquote", [400]);
    expect(result.status).toBe("ok");
    expect(result.pages.length).toBeGreaterThan(1);
    const ranges = result.pages.flatMap((page) =>
      page.blocks.map((entry) => ({ start: entry.startGrapheme, end: entry.endGrapheme })),
    );
    // Whole-block coordinates: the first page OPENS at the slice origin,
    // the last page CLOSES at the slice end.
    expect(ranges[0]!.start).toBe(8000);
    expect(ranges.at(-1)!.end).toBe(16000);
    let cursor = 8000;
    for (const range of ranges) {
      expect(range.start).toBe(cursor); // exactly-once, no gaps, no overlaps
      expect(range.end).toBeGreaterThan(range.start);
      expect(range.end).toBeLessThanOrEqual(16000);
      cursor = range.end;
    }
    expect(cursor).toBe(16000);
    // Every entry names the ORIGINAL block (identity never rewritten).
    expect(result.pages.every((page) => page.blocks.every((b) => b.blockIndex === 1))).toBe(true);
  });

  it("rebases slice-local container line boxes through the rendered cut", () => {
    // raw == norm for this child, so the first page's split must land at
    // exactly slice origin + 200 graphemes (ten 20px lines): a wrong or
    // missing prefix shifts this label measurably.
    const article = singleChildQuoteArticle(1200);
    const window = { startBlock: 1, endBlock: 2, startGrapheme: 8000, endGrapheme: 16000 };
    const result = paginate(article, window, "blockquote", [400]);
    expect(result.status).toBe("ok");
    expect(result.pages[0]!.blocks.at(-1)!.endGrapheme).toBe(8000 + 200);
  });

  it("splits a giant list continuation repeatedly with exact coverage", () => {
    const article = giantListArticle();
    // The INTERIOR single-block continuation [7989, 15989): 400 slice lines
    // → ten 20px lines per page → a repeated remainder walk inside ONE
    // bounded window.
    const current = blockWindows(article)[1]!;
    expect(current.startBlock).toBe(1);
    expect(current.endBlock).toBe(2);
    const result = paginate(article, current, "numbered-list", [400]);
    expect(result.status).toBe("ok");
    const ranges = result.pages.flatMap((page) =>
      page.blocks.map((entry) => ({ start: entry.startGrapheme, end: entry.endGrapheme })),
    );
    expect(ranges.length).toBeGreaterThan(10); // repeated bounded splitting
    let cursor = ranges[0]!.start;
    for (const range of ranges) {
      expect(range.start).toBe(cursor);
      expect(range.end).toBeGreaterThan(range.start);
      cursor = range.end;
    }
    expect(ranges[0]!.start).toBe(current.startGrapheme);
    expect(ranges.at(-1)!.end).toBe(current.endGrapheme);
  });

  it("paginates the whole trailing window: container tail + closing blocks", () => {
    const article = giantListArticle();
    const current = blockWindows(article).at(-1)!;
    expect(current.startBlock).toBe(1);
    expect(current.endBlock).toBe(4);
    // The list tail spans ~7692 graphemes ≈ 385 lines; the closing heading
    // and paragraph are small. Every row's slice bounds are honored.
    const result = paginate(article, current, "numbered-list", [385, 1, 2]);
    expect(result.status).toBe("ok");
    expect(result.pages.length).toBeGreaterThan(5);
    const all = result.pages.flatMap((page) => page.blocks);
    // Exactly-once coverage of the WHOLE window in source order.
    expect(all[0]!.blockIndex).toBe(1);
    expect(all[0]!.startGrapheme).toBe(current.startGrapheme);
    expect(all.at(-1)!.blockIndex).toBe(3);
    let previousBlock = -1;
    let previousEnd = -1;
    for (const entry of all) {
      expect(entry.blockIndex).toBeGreaterThanOrEqual(previousBlock);
      if (entry.blockIndex === previousBlock) {
        expect(entry.startGrapheme).toBe(previousEnd);
      }
      previousBlock = entry.blockIndex;
      previousEnd = entry.endGrapheme;
    }
  });

  it("keeps genuinely unpageable slice content an explicit typed failure", () => {
    const article = singleChildQuoteArticle(1200);
    const window = { startBlock: 1, endBlock: 2, startGrapheme: 8000, endGrapheme: 16000 };
    const result = paginate(article, window, "blockquote", [3], 40);
    expect(result.status).toBe("fallback");
    expect(result.reason).toBe("unsplittable-block-overflow");
  });

  it("rejects slice scopes on kinds without an intra-block split semantic", () => {
    const article = singleChildQuoteArticle(10);
    const mismatch = paginateDocument({
      article: {
        ...article,
        blocks: [
          article.blocks[0]!,
          { kind: "code-block", source: giantQuoteChild(10), language: "text" },
          article.blocks[2]!,
        ],
      },
      measurement: sliceMeasurement(
        article,
        { startBlock: 1, endBlock: 2, startGrapheme: 10, endGrapheme: 300 },
        "code-block",
        [10],
      ),
      pageContentBoxHeightPx: 200,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(mismatch.reason).toBe("measurement-scope-mismatch");
  });
});
