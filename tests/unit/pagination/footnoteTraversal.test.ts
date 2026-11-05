// Issue #235 — footnote bodies participate in bounded source traversal.
//
// These tests pin the CANONICAL coordinate contract first (TDD red): footnote
// rows derive their D-05 offsets from the SAME substrate normalizeText uses —
// never a second accumulation. Every later seam (windows, engine, anchors,
// measurement, renderers) consumes this one definition.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import {
  articleGraphemeIndex,
  footnoteRows,
  graphemeClusters,
  graphemeLength,
  inlineText,
  normalizeText,
} from "../../../src/content/normalizeText";
import {
  blockWindowForOffset,
  blockWindows,
  canUseBlockWindows,
  refineWindow,
  sameWindow,
  windowGlobalEnd,
  windowGlobalStart,
  windowScopeKey,
} from "../../../src/pagination/blockWindow";
import { paginateDocument } from "../../../src/pagination/fragment";
import { pageAnchorOffset, pageStartGlobalOffset } from "../../../src/pagination/anchor";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";

function articleWith(
  overrides: {
    blocks?: unknown[];
    footnotes?: unknown[];
    id?: string;
  } = {},
) {
  return ArticleSchema.parse({
    id: overrides.id ?? "footnote-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "A footnoted work",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "footnote-work-v1",
    },
    blocks: overrides.blocks ?? [
      { kind: "heading", level: 2, content: [{ text: "Chapter", marks: [] }] },
      {
        kind: "paragraph",
        content: [
          {
            text: "The archivist cites the ledger.[1] A second claim follows.[2]",
            marks: [],
          },
        ],
      },
      { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
      { kind: "paragraph", content: [{ text: "Closing prose.", marks: [] }] },
    ],
    footnotes: overrides.footnotes ?? [
      { id: "fn-1", content: [{ text: "The ledger is archived in the north wing.", marks: [] }] },
      { id: "fn-2", content: [{ text: "See the second ledger for the full claim.", marks: [] }] },
    ],
  });
}

describe("footnote rows on the canonical coordinate substrate", () => {
  it("derives exactly one row per NON-EMPTY footnote body, in order", () => {
    const article = articleWith({
      footnotes: [
        { id: "fn-1", content: [{ text: "First body.", marks: [] }] },
        { id: "fn-2", content: [{ text: "  ", marks: [] }] }, // whitespace-only — no canonical presence
        { id: "fn-3", content: [{ text: "Third body.", marks: [] }] },
      ],
    });
    const rows = footnoteRows(article);
    expect(rows.map((row) => row.index)).toEqual([0, 2]);
    expect(rows.map((row) => row.length)).toEqual([
      graphemeClusters("First body.", "en").length,
      graphemeClusters("Third body.", "en").length,
    ]);
  });

  it("places row offsets exactly where normalizeText puts the footnotes region", () => {
    const article = articleWith();
    const rows = footnoteRows(article);
    const text = normalizeText(article);
    for (const row of rows) {
      const fn = article.footnotes[row.index]!;
      expect(text.slice(row.start, row.start + row.length)).toBe(inlineText(fn.content));
    }
    // Rows are separated by exactly one BLOCK_SEPARATOR, mirroring the join.
    expect(rows[1]!.start).toBe(rows[0]!.start + rows[0]!.length + 1);
    // The last row ends at the canonical total — no phantom trailing separator.
    const index = articleGraphemeIndex(article);
    expect(rows.at(-1)!.start + rows.at(-1)!.length).toBe(index.totalGraphemes);
  });

  it("starts the footnotes region at offset 0 only when the body contributes no text", () => {
    const article = articleWith({
      blocks: [{ kind: "paragraph", content: [{ text: "  ", marks: [] }] }],
    });
    const rows = footnoteRows(article);
    expect(rows[0]!.start).toBe(0);
    const text = normalizeText(article);
    expect(text.slice(rows[0]!.start, rows[0]!.start + rows[0]!.length)).toBe(
      inlineText(article.footnotes[0]!.content),
    );
  });

  it("returns no rows (and never a negative region) for a footnote-less work", () => {
    const article = articleWith({ footnotes: [] });
    expect(footnoteRows(article)).toEqual([]);
  });

  it("caches rows per parsed article object (same array identity)", () => {
    const article = articleWith();
    expect(footnoteRows(article)).toBe(footnoteRows(article));
  });
});

/** A book-length footnoted body: enough blocks for several body windows. */
function longFootnotedWork(fnBodies?: { id: string; text: string }[], id = "footnote-work") {
  type Block =
    | { kind: "paragraph"; content: { text: string; marks: never[] }[] }
    | { kind: "footnote-reference"; footnoteId: string; marker: string };
  const blocks: Block[] = Array.from({ length: 80 }, (_, i) => ({
    kind: "paragraph" as const,
    content: [
      {
        text: `Passage ${i}. ` + "The archivist kept a careful record of each journey. ".repeat(6),
        marks: [] as const,
      },
    ],
  }));
  blocks.splice(
    4,
    0,
    { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
    { kind: "footnote-reference", footnoteId: "fn-2", marker: "[2]" },
  );
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: "A long footnoted work",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: `${id}-v1`,
    },
    blocks,
    footnotes: fnBodies?.map((fn) => ({ id: fn.id, content: [{ text: fn.text, marks: [] }] })) ?? [
      { id: "fn-1", content: [{ text: "The ledger is archived in the north wing.", marks: [] }] },
      { id: "fn-2", content: [{ text: "The second ledger confirms the claim.", marks: [] }] },
    ],
  });
}

describe("footnote bodies in bounded source traversal (issue #235)", () => {
  it("admits footnote-carrying long works to the windowed path", () => {
    expect(canUseBlockWindows(longFootnotedWork())).toBe(true);
  });

  it("admits footnote-carrying works only when bounded pagination is genuinely needed", () => {
    expect(canUseBlockWindows(longFootnotedWork())).toBe(true);
    // A SHORT work with small footnotes (one body window + one footnote
    // window) keeps the legacy full-document path — existing short-work
    // behavior is unchanged by this slice.
    const short = articleWith({
      blocks: [{ kind: "paragraph", content: [{ text: "One passage.", marks: [] }] }],
    });
    expect(canUseBlockWindows(short)).toBe(false);
    // The empty-body degenerate keeps the legacy path: its footnotes region
    // starts at offset 0 and block-aligned body windows would misaddress it.
    const emptyBody = articleWith({
      blocks: [{ kind: "paragraph", content: [{ text: "  ", marks: [] }] }],
    });
    expect(canUseBlockWindows(emptyBody)).toBe(false);
    // A short body whose footnote rows ALONE need several windows is bounded
    // pagination's honest case.
    const notesLong = longFootnotedWork(
      Array.from({ length: 6 }, (_, i) => ({
        id: `fn-${i + 1}`,
        text: "Ledger line. ".repeat(500), // ~3900 graphemes each — two per window
      })),
      "notes-long-work",
    );
    expect(canUseBlockWindows(notesLong)).toBe(true);
  });

  it("tiles the whole canonical stream — body windows then footnote windows, exactly once", () => {
    const article = longFootnotedWork();
    const windows = blockWindows(article);
    const index = articleGraphemeIndex(article);
    let expectedStart = 0;
    for (const [i, window] of windows.entries()) {
      const start = windowGlobalStart(article, window);
      const end = windowGlobalEnd(article, window);
      expect(start, `window ${i} start`).toBe(expectedStart);
      expect(end, `window ${i} end`).toBeGreaterThan(start);
      expectedStart = end;
    }
    // The final window ends exactly at the work's true end (footnotes included).
    expect(expectedStart).toBe(index.totalGraphemes);
    // Footnote windows are homogeneous: an empty body range anchored at the
    // body's end, footnote fields present, no intra-BODY slice bounds.
    for (const window of windows) {
      if (window.startFootnote === undefined) continue;
      expect(window.startBlock).toBe(article.blocks.length);
      expect(window.endBlock).toBe(article.blocks.length);
      expect(window.startGrapheme).toBeUndefined();
      expect(window.endGrapheme).toBeUndefined();
      expect(window.startFootnote).toBeLessThan(window.endFootnote!);
    }
    // Every non-empty footnote body is covered by exactly one window row set.
    const covered = new Set(
      windows.flatMap((w) =>
        footnoteRows(article)
          .filter(
            (row) => row.index >= (w.startFootnote ?? -1) && row.index < (w.endFootnote ?? -1),
          )
          .map((row) => row.index),
      ),
    );
    expect([...covered].sort((a, b) => a - b)).toEqual(footnoteRows(article).map((r) => r.index));
  });

  it("routes canonical offsets — row starts, inter-row separators, and the end pin — to footnote windows", () => {
    const article = longFootnotedWork();
    const rows = footnoteRows(article);
    const windows = blockWindows(article);
    for (const row of rows) {
      const window = blockWindowForOffset(article, row.start);
      expect(window.startFootnote).toBeDefined();
      expect(row.index).toBeGreaterThanOrEqual(window.startFootnote!);
      expect(row.index).toBeLessThan(window.endFootnote!);
      expect(windowGlobalStart(article, window)).toBeLessThanOrEqual(row.start);
      expect(windowGlobalEnd(article, window)).toBeGreaterThan(row.start);
    }
    // The end-pin offset (the work's total) lands in the FINAL window.
    const last = blockWindowForOffset(article, graphemeLength(article));
    expect(sameWindow(last, windows.at(-1)!)).toBe(true);
  });

  it("splits an oversized footnote body into repeated bounded continuations", () => {
    const giant = "Ledger line. ".repeat(1400); // ~10920 graphemes > 8,000 capacity
    const article = longFootnotedWork([
      { id: "fn-1", text: "A small body." },
      { id: "fn-2", text: giant },
    ]);
    expect(canUseBlockWindows(article)).toBe(true);
    const rows = footnoteRows(article);
    expect(rows[1]!.length).toBeGreaterThan(8000);
    const windows = blockWindows(article);
    const fnWindows = windows.filter((w) => w.startFootnote !== undefined);
    expect(fnWindows.length).toBeGreaterThanOrEqual(2);
    // The giant row's intra-row slices are ordered, bounded, and cover the
    // row exactly once. (The small first row may share the giant row's FIRST
    // chunk window — the same no-heading-only-boundary rule the body walk
    // uses — so slices are derived per window against the rows they cover.)
    const rowByIndex = new Map(rows.map((row) => [row.index, row]));
    const giantSlices = fnWindows
      .filter((w) => w.startFootnote! <= 1 && 1 < w.endFootnote!)
      .map((w) => ({
        start: w.startFootnote === 1 ? (w.startFootnoteGrapheme ?? 0) : 0,
        end:
          w.endFootnote! - 1 === 1
            ? (w.endFootnoteGrapheme ?? rowByIndex.get(1)!.length)
            : rowByIndex.get(1)!.length,
      }));
    expect(giantSlices.length).toBeGreaterThanOrEqual(2);
    let expected = 0;
    for (const slice of giantSlices) {
      expect(slice.start).toBe(expected);
      expect(slice.end - slice.start).toBeLessThanOrEqual(8000);
      expected = slice.end;
    }
    expect(expected).toBe(rowByIndex.get(1)!.length);
    // Tiling still reaches the work's true end.
    let cursor = 0;
    for (const w of windows) {
      expect(windowGlobalStart(article, w)).toBe(cursor);
      cursor = windowGlobalEnd(article, w);
    }
    expect(cursor).toBe(graphemeLength(article));
  });

  it("refines a footnote window at a capacity cursor without renumbering anything", () => {
    const giant = "Ledger line. ".repeat(1400);
    const article = longFootnotedWork([{ id: "fn-1", text: giant }]);
    const windows = blockWindows(article);
    const fnWindows = windows.filter((w) => w.startFootnote !== undefined);
    expect(fnWindows.length).toBeGreaterThanOrEqual(2);
    const whole = fnWindows[0]!;
    const rowLength = footnoteRows(article)[0]!.length;
    const refineAt = 4000; // strictly inside the first chunk's intra-row range
    const refined = refineWindow(article, whole, {
      blockIndex: article.blocks.length,
      footnoteIndex: 0,
      startGrapheme: refineAt,
    });
    expect(refined).not.toBeNull();
    const [prefix, tail] = refined!;
    expect(windowGlobalStart(article, prefix)).toBe(windowGlobalStart(article, whole));
    expect(windowGlobalEnd(article, tail)).toBe(windowGlobalEnd(article, whole));
    expect(windowGlobalEnd(article, prefix)).toBe(windowGlobalStart(article, tail));
    expect(prefix.startFootnote).toBe(0);
    expect(prefix.endFootnoteGrapheme).toBe(refineAt);
    expect(tail.startFootnoteGrapheme).toBe(refineAt);
    // Distinct scope keys — one window identity per slice (issue #233 rule).
    expect(windowScopeKey(prefix)).not.toBe(windowScopeKey(tail));
    expect(windowScopeKey(whole)).not.toBe(windowScopeKey(prefix));
    // A cursor outside the window refines nothing.
    expect(
      refineWindow(article, whole, {
        blockIndex: article.blocks.length,
        footnoteIndex: 0,
        startGrapheme: rowLength - 1,
      }),
    ).toBeNull();
  });

  it("normalizes the same with footnotes present — order, separators, and offsets untouched", () => {
    const article = longFootnotedWork();
    const text = normalizeText(article);
    // Footnote text participates exactly once, after the body, in footnotes order.
    const rows = footnoteRows(article);
    expect(text.slice(rows[0]!.start - 1, rows[0]!.start)).toBe("\n");
    expect(rows.at(-1)!.start + rows.at(-1)!.length).toBe(text.length);
  });
});

// ── Engine: footnote windows paginate through the SAME pipeline ──────────────

import type { CanonicalArticle } from "../../../src/content/types";
import type { SourceCursor } from "../../../src/pagination/types";

const SHORT = { width: 360, height: 700 };

function measurementFor(
  article: CanonicalArticle,
  window: ReturnType<typeof blockWindows>[number],
): MeasurementResult {
  const fnRows = footnoteRows(article).filter(
    (row) => row.index >= (window.startFootnote ?? -1) && row.index < (window.endFootnote ?? -1),
  );
  const bodyCount = window.startFootnote !== undefined ? 0 : window.endBlock - window.startBlock;
  return {
    schemaVersion: 2,
    constraints: {
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      viewportWidthPx: SHORT.width,
      lang: "en",
    },
    computedAt: "2026-01-01T00:00:00Z",
    scope: {
      articleId: article.id,
      revision: article.revision,
      ...window,
    },
    blocks: Array.from({ length: bodyCount + fnRows.length }, (_, i) => ({
      kind: i < bodyCount ? "paragraph" : "footnote-body",
      heightPx: 60,
      lineCount: 6,
      lineBoxes: Array.from({ length: 6 }, (_, line) => ({
        charOffset: line * 2,
        topPx: line * 10,
        bottomPx: (line + 1) * 10,
      })),
    })),
  };
}

function paginate(
  article: CanonicalArticle,
  window: ReturnType<typeof blockWindows>[number],
  pageHeightPx = 120,
) {
  return paginateDocument({
    article,
    measurement: measurementFor(article, window),
    pageContentBoxHeightPx: pageHeightPx,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

describe("footnote windows through the pagination engine (issue #235)", () => {
  it("emits explicit footnoteIndex entries that cover the window's rows exactly once", () => {
    const article = longFootnotedWork();
    const fnWindow = blockWindows(article).find((w) => w.startFootnote !== undefined)!;
    const result = paginate(article, fnWindow);
    expect(result.status).toBe("ok");
    const rows = footnoteRows(article).filter(
      (row) => row.index >= fnWindow.startFootnote! && row.index < fnWindow.endFootnote!,
    );
    // Homogeneous page: every entry addresses a footnote row; blockIndex is
    // the past-body sentinel, never a forged block.
    const entries = result.pages.flatMap((page) => page.blocks);
    expect(entries.length).toBe(rows.length);
    for (const [i, entry] of entries.entries()) {
      expect(entry.footnoteIndex).toBe(rows[i]!.index);
      expect(entry.blockIndex).toBe(article.blocks.length);
      expect(entry.startGrapheme).toBe(0);
      expect(entry.endGrapheme).toBe(rows[i]!.length);
    }
    // The page's canonical start is the footnote row's canonical offset —
    // pageStartGlobalOffset speaks the SAME currency as the substrate.
    expect(pageStartGlobalOffset(article, result.pages[0]!)).toBe(rows[0]!.start);
  });

  it("keeps body windows free of footnote entries (never forged into the block walk)", () => {
    const article = longFootnotedWork();
    const bodyWindow = blockWindows(article).find((w) => w.startFootnote === undefined)!;
    const result = paginate(article, bodyWindow);
    expect(result.status).toBe("ok");
    for (const entry of result.pages.flatMap((page) => page.blocks)) {
      expect(entry.footnoteIndex).toBeUndefined();
      expect(entry.blockIndex).toBeLessThan(article.blocks.length);
    }
  });

  it("splits an oversized footnote slice across pages with repeated continuation", () => {
    const giant = "Ledger line. ".repeat(1400); // > window capacity
    const article = longFootnotedWork([{ id: "fn-1", text: giant }]);
    const fnWindows = blockWindows(article).filter((w) => w.startFootnote !== undefined);
    expect(fnWindows.length).toBeGreaterThanOrEqual(2);
    const rowLength = footnoteRows(article)[0]!.length;
    const covered: { start: number; end: number }[] = [];
    for (const window of fnWindows) {
      const result = paginate(article, window);
      expect(result.status).toBe("ok");
      for (const page of result.pages) {
        // One row per page-slice entry — page splits inside the giant row
        // produce ordered, adjacent slices of the SAME footnoteIndex.
        for (const entry of page.blocks) {
          expect(entry.footnoteIndex).toBe(0);
          covered.push({ start: entry.startGrapheme, end: entry.endGrapheme });
        }
      }
    }
    // Ordered, adjacent, exact cover of the row — no omission, no duplication.
    let expected = 0;
    for (const slice of covered) {
      expect(slice.start).toBe(expected);
      expect(slice.end).toBeGreaterThan(slice.start);
      expected = slice.end;
    }
    expect(expected).toBe(rowLength);
  });

  it("yields a footnote capacity cursor (not a fallback) at the page ceiling", () => {
    const giant = "Ledger line. ".repeat(1400);
    const article = longFootnotedWork([{ id: "fn-1", text: giant }]);
    const window = blockWindows(article).find((w) => w.startFootnote !== undefined)!;
    // A pathological page box (20px over 1px line boxes stepping one raw
    // unit) consumes ~18 graphemes per page, so the slice's 8,000 graphemes
    // exceed the 300-page ceiling inside ONE footnote-slice pass — the
    // scoped walk must retain its prefix and yield a footnote cursor.
    const base = measurementFor(article, window);
    const pathological: MeasurementResult = {
      ...base,
      blocks: base.blocks.map((block) => ({
        ...block,
        heightPx: 8_000,
        lineCount: 8_000,
        lineBoxes: Array.from({ length: 8_000 }, (_, line) => ({
          charOffset: line,
          topPx: line,
          bottomPx: line + 1,
        })),
      })),
    };
    const result = paginateDocument({
      article,
      measurement: pathological,
      pageContentBoxHeightPx: 20,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.continuation).toBeDefined();
    const cursor: SourceCursor = result.continuation!;
    expect(cursor.footnoteIndex).toBe(0);
    expect(cursor.blockIndex).toBe(article.blocks.length);
    expect(cursor.startGrapheme).toBeGreaterThan(0);
  });
});

describe("anchors speak footnote coordinates (issue #235)", () => {
  it("pins the work end only when the LAST footnote row is fully reached", () => {
    const article = longFootnotedWork();
    const windows = blockWindows(article);
    const lastBodyWindow = windows.filter((w) => w.startFootnote === undefined).at(-1)!;
    const bodyResult = paginate(article, lastBodyWindow);
    const bodyLast = bodyResult.pages.length - 1;
    // Body-window end must NOT finish a footnoted work: the anchor is the
    // page's own passage, never the total.
    expect(pageAnchorOffset(article, bodyResult.pages, bodyLast)).toBe(
      pageStartGlobalOffset(article, bodyResult.pages[bodyLast]!),
    );
    expect(pageAnchorOffset(article, bodyResult.pages, bodyLast)).toBeLessThan(
      articleGraphemeIndex(article).totalGraphemes,
    );
    // The final FOOTNOTE page does complete the work.
    const fnWindow = windows.at(-1)!;
    const fnResult = paginate(article, fnWindow);
    const fnLast = fnResult.pages.length - 1;
    expect(pageAnchorOffset(article, fnResult.pages, fnLast)).toBe(
      articleGraphemeIndex(article).totalGraphemes,
    );
  });

  it("opens footnote works at anchor 0 — one-page or not", () => {
    const article = longFootnotedWork();
    const windows = blockWindows(article);
    const firstBody = windows[0]!;
    const result = paginate(article, firstBody);
    expect(result.status).toBe("ok");
    expect(pageAnchorOffset(article, result.pages, 0)).toBe(0);
    // Progress on the first page of a footnoted work never reads finished.
    expect(pageAnchorOffset(article, result.pages, 0)).toBeLessThan(
      articleGraphemeIndex(article).totalGraphemes,
    );
  });
});

describe("empty note bodies between full ones (review finding)", () => {
  // footnotes [full, whitespace-only, full]: the middle body is NOT a row,
  // and window fields carry footnote indices — offset lookups must find rows
  // by canonical index, never by filtered-array position.
  function interleavedWork() {
    type Block =
      | { kind: "paragraph"; content: { text: string; marks: never[] }[] }
      | { kind: "footnote-reference"; footnoteId: string; marker: string };
    const blocks: Block[] = Array.from({ length: 80 }, (_, i) => ({
      kind: "paragraph" as const,
      content: [
        {
          text:
            `Passage ${i}. ` + "The archivist kept a careful record of each journey. ".repeat(6),
          marks: [] as const,
        },
      ],
    }));
    blocks.splice(4, 0, { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" });
    return ArticleSchema.parse({
      id: "interleaved-footnotes",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Interleaved notes",
        retrievedAt: "2026-01-01T00:00:00Z",
        originalHtmlHash: "interleaved-v1",
      },
      blocks,
      footnotes: [
        { id: "fn-1", content: [{ text: "A full body with text.", marks: [] }] },
        { id: "fn-2", content: [{ text: "   ", marks: [] }] },
        { id: "fn-3", content: [{ text: "The second full body.", marks: [] }] },
      ],
    });
  }

  it("tiles, resolves offsets, and refines windows when empty bodies interleave", () => {
    const article = interleavedWork();
    const rows = footnoteRows(article);
    expect(rows.map((row) => row.index)).toEqual([0, 2]);
    expect(canUseBlockWindows(article)).toBe(true);
    const windows = blockWindows(article);
    // Tiling never touches a missing row — windowGlobalEnd resolves by index.
    let cursor = 0;
    for (const window of windows) {
      expect(windowGlobalStart(article, window)).toBe(cursor);
      cursor = windowGlobalEnd(article, window);
    }
    expect(cursor).toBe(articleGraphemeIndex(article).totalGraphemes);
    // The final window's end is the last ROW's end (index 2), not position 3.
    const fnWindows = windows.filter((w) => w.startFootnote !== undefined);
    expect(fnWindows.length).toBeGreaterThanOrEqual(1);
    for (const window of fnWindows) {
      expect(window.endFootnote).toBeLessThanOrEqual(3);
    }
    // Canonical routing and refinement both work for the interleaved stream.
    const target = blockWindowForOffset(article, rows[1]!.start);
    expect(target.startFootnote).toBeDefined();
    expect(rows[1]!.index).toBeGreaterThanOrEqual(target.startFootnote!);
    expect(rows[1]!.index).toBeLessThan(target.endFootnote!);
  });
});
