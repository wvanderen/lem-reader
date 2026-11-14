import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import {
  blockWindows,
  readingWindows,
  isWholeArticleWindow,
  hasWholeArticlePagination,
  blockWindowForOffset,
  canUseBlockWindows,
  windowGlobalEnd,
  windowGlobalStart,
} from "../../../src/pagination/blockWindow";
import { paginateDocument } from "../../../src/pagination/fragment";
import { pageAnchorOffset } from "../../../src/pagination/anchor";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";

const article = ArticleSchema.parse({
  id: "long-prose",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Long prose",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "long-prose",
  },
  blocks: Array.from({ length: 640 }, (_, i) => ({
    kind: "paragraph",
    content: [{ text: `Passage ${i}. Ordinary prose with a stable source position.` }],
  })),
});

function measurement(startBlock: number, endBlock: number): MeasurementResult {
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
    scope: { articleId: article.id, revision: article.revision, startBlock, endBlock },
    blocks: Array.from({ length: endBlock - startBlock }, () => ({
      kind: "paragraph",
      heightPx: 60,
      lineCount: 1,
      lineBoxes: [],
    })),
  };
}

function paginate(view: MeasurementResult) {
  return paginateDocument({
    article,
    measurement: view,
    pageContentBoxHeightPx: 100,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

describe("bounded long-prose pagination", () => {
  it("keeps an ordinary 25-page article in one exact, continuous publication", () => {
    const ordinary = ArticleSchema.parse({ ...article, blocks: article.blocks.slice(0, 100) });
    expect(blockWindows(ordinary).length).toBeGreaterThan(1); // old routing reset here
    const windows = readingWindows(ordinary);
    expect(windows).toEqual([{ startBlock: 0, endBlock: 100, includeFootnotes: true }]);
    expect(isWholeArticleWindow(ordinary, windows[0])).toBe(true);
    const view = measurement(0, 100);
    const result = paginateDocument({
      article: ordinary,
      measurement: view,
      pageContentBoxHeightPx: 240,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.continuation).toBeUndefined();
    expect(result.pages).toHaveLength(25);
    expect(hasWholeArticlePagination(ordinary, windows[0], result.pages)).toBe(true);
    expect(hasWholeArticlePagination(ordinary, windows[0], result.pages.slice(0, 20))).toBe(false);
    expect(result.pages.map((p) => p.pageIndex)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(result.pages.flatMap((p) => p.blocks.map((b) => b.blockIndex))).toEqual(
      Array.from({ length: 100 }, (_, i) => i),
    );
  });

  it("keeps 325 short source rows in one exact 25-page publication", () => {
    const ordinary = ArticleSchema.parse({ ...article, blocks: article.blocks.slice(0, 325) });
    const windows = readingWindows(ordinary);
    expect(windows).toEqual([{ startBlock: 0, endBlock: 325, includeFootnotes: true }]);
    const result = paginateDocument({
      article: ordinary,
      measurement: measurement(0, 325),
      pageContentBoxHeightPx: 780,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.pages).toHaveLength(25);
    expect(result.continuation).toBeUndefined();
    expect(hasWholeArticlePagination(ordinary, windows[0], result.pages)).toBe(true);
  });

  it("publishes a single long paragraph as 25 complete pages with canonical coverage", () => {
    const ordinary = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "word ".repeat(2000) }] }],
    });
    const range = readingWindows(ordinary)[0]!;
    const view = measurement(0, 1);
    view.blocks = [
      {
        kind: "paragraph",
        heightPx: 2000,
        lineCount: 100,
        lineBoxes: Array.from({ length: 100 }, (_, i) => ({
          charOffset: i * 100,
          topPx: i * 20,
          bottomPx: (i + 1) * 20,
        })),
      },
    ];
    const result = paginateDocument({
      article: ordinary,
      measurement: view,
      pageContentBoxHeightPx: 80,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(range).toEqual({ startBlock: 0, endBlock: 1, includeFootnotes: true });
    expect(result.status).toBe("ok");
    expect(result.pages).toHaveLength(25);
    expect(result.continuation).toBeUndefined();
    expect(hasWholeArticlePagination(ordinary, range, result.pages)).toBe(true);
    const entries = result.pages.flatMap((page) => page.blocks);
    expect(entries[0]!.startGrapheme).toBe(0);
    expect(entries.at(-1)!.endGrapheme).toBe(9_999); // canonical text trims trailing space
    entries.slice(1).forEach((entry, i) => {
      expect(entry.blockIndex).toBe(0);
      expect(entry.startGrapheme).toBe(entries[i]!.endGrapheme);
    });
  });

  it("requires continuous canonical coverage including every nonempty note", () => {
    const work = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "body" }] }],
      footnotes: [
        { id: "fn-1", content: [{ text: "first" }] },
        { id: "fn-2", content: [{ text: " " }] },
        { id: "fn-3", content: [{ text: "last" }] },
      ],
    });
    const range = readingWindows(work)[0]!;
    const pages = [
      {
        schemaVersion: 1 as const,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 4 },
          { blockIndex: 1, footnoteIndex: 0, startGrapheme: 0, endGrapheme: 5 },
          { blockIndex: 1, footnoteIndex: 2, startGrapheme: 0, endGrapheme: 4 },
        ],
      },
    ];
    expect(hasWholeArticlePagination(work, range, pages)).toBe(true);
    expect(
      hasWholeArticlePagination(work, range, [
        { ...pages[0]!, blocks: pages[0]!.blocks.filter((_, i) => i !== 1) },
      ]),
    ).toBe(false);
    expect(
      hasWholeArticlePagination(work, range, [
        {
          ...pages[0]!,
          blocks: [
            pages[0]!.blocks[0]!,
            { blockIndex: 1, footnoteIndex: 0, startGrapheme: 1, endGrapheme: 5 },
            pages[0]!.blocks[2]!,
          ],
        },
      ]),
    ).toBe(false);
  });

  it("does not mistake small continuation tiles for a whole-reading admission limit", () => {
    const ordinary = ArticleSchema.parse({
      ...article,
      blocks: Array.from({ length: 125 }, () => ({
        kind: "paragraph",
        content: [{ text: "The reader keeps a stable place. ".repeat(30) }],
      })),
    });
    expect(articleGraphemeIndex(ordinary).totalGraphemes).toBeGreaterThan(111_000);
    expect(readingWindows(ordinary)).toEqual([
      { startBlock: 0, endBlock: 125, includeFootnotes: true },
    ]);
  });

  it("bounds aggregate source work and DOM rows, independent of block shape", () => {
    const manyRows = ArticleSchema.parse({
      ...article,
      blocks: Array.from({ length: 2049 }, () => ({
        kind: "paragraph",
        content: [{ text: "Short." }],
      })),
    });
    expect(readingWindows(manyRows)).toEqual(blockWindows(manyRows));
    const rowBoundary = ArticleSchema.parse({
      ...manyRows,
      blocks: manyRows.blocks.slice(0, 2048),
    });
    expect(readingWindows(rowBoundary)).toEqual([
      { startBlock: 0, endBlock: 2048, includeFootnotes: true },
    ]);
    const textHeavy = ArticleSchema.parse({
      ...article,
      blocks: Array.from({ length: 20 }, () => ({
        kind: "paragraph",
        content: [{ text: "x".repeat(14_000) }],
      })),
    });
    expect(readingWindows(textHeavy)).toEqual(blockWindows(textHeavy));
    const giant = ArticleSchema.parse({
      ...article,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "x".repeat(9000) }],
        },
      ],
    });
    expect(readingWindows(giant)).toEqual([{ startBlock: 0, endBlock: 1, includeFootnotes: true }]);
    expect(isWholeArticleWindow(giant, readingWindows(giant)[0])).toBe(true);
    const huge = ArticleSchema.parse({
      ...giant,
      blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(256_001) }] }],
    });
    expect(readingWindows(huge)).toEqual(blockWindows(huge));
    expect(isWholeArticleWindow(huge, readingWindows(huge)[0])).toBe(false);
  });

  it("exposes the existing whole-document ceiling, but covers the work through bounded measurements", () => {
    const full = measurement(0, article.blocks.length);
    delete full.scope;
    expect(paginate(full).reason).toBe("page-ceiling");
    const seen: number[] = [];
    for (const range of blockWindows(article)) {
      const result = paginate(measurement(range.startBlock, range.endBlock));
      expect(result.status).toBe("ok");
      expect(result.pages.length).toBeLessThanOrEqual(32);
      seen.push(...result.pages.flatMap((page) => page.blocks.map((entry) => entry.blockIndex)));
    }
    expect(seen).toEqual(article.blocks.map((_, i) => i));
  });

  it("only enables the first slice for sources it can completely cover within block bounds", () => {
    expect(canUseBlockWindows(article)).toBe(true);
    expect(
      canUseBlockWindows(ArticleSchema.parse({ ...article, blocks: [article.blocks[0]] })),
    ).toBe(false);
    // Issue #235 — footnote bodies participate in bounded traversal: a
    // footnote-carrying LONG work is admitted (its window sequence covers
    // the footnotes region too), not refused to the legacy path.
    const footnoted = ArticleSchema.parse({
      ...article,
      footnotes: [{ id: "fn-1", content: [{ text: "A footnote body." }] }],
    });
    expect(canUseBlockWindows(footnoted)).toBe(true);
    // …and the admission covers the WHOLE stream: the windows tile body +
    // footnote graphemes exactly once, ending at the canonical total.
    let tiled = 0;
    for (const range of blockWindows(footnoted)) {
      expect(windowGlobalStart(footnoted, range)).toBe(tiled);
      tiled = windowGlobalEnd(footnoted, range);
    }
    expect(tiled).toBe(articleGraphemeIndex(footnoted).totalGraphemes);
    expect(
      canUseBlockWindows(
        ArticleSchema.parse({
          ...article,
          blocks: [
            ...article.blocks,
            { kind: "paragraph", content: [{ text: "x".repeat(8_001) }] },
          ],
        }),
      ),
    ).toBe(true); // issue #233 — giant prose is covered by intra-block continuations
    expect(
      canUseBlockWindows(
        ArticleSchema.parse({
          ...article,
          blocks: [
            ...article.blocks,
            { kind: "code-block", source: "x".repeat(8_001), lang: "text" },
          ],
        }),
      ),
    ).toBe(false); // giant atomic kinds keep the honest legacy path
  });

  it("uses original global coordinates and does not finish the article at a window end", () => {
    const ranges = blockWindows(article);
    const first = paginate(measurement(ranges[0]!.startBlock, ranges[0]!.endBlock));
    const lastIndex = first.pages.length - 1;
    expect(pageAnchorOffset(article, first.pages, lastIndex)).toBe(
      articleGraphemeIndex(article).blockStartOffsets[31],
    );
    const lastRange = ranges.at(-1)!;
    const last = paginate(measurement(lastRange.startBlock, lastRange.endBlock));
    expect(pageAnchorOffset(article, last.pages, last.pages.length - 1)).toBe(
      articleGraphemeIndex(article).totalGraphemes,
    );
  });

  it("pins a one-page terminal window, but never marks a one-page work finished on open", () => {
    const end = article.blocks.length;
    const terminal = paginate(measurement(end - 1, end));
    expect(terminal.pages).toHaveLength(1);
    expect(pageAnchorOffset(article, terminal.pages, 0)).toBe(
      articleGraphemeIndex(article).totalGraphemes,
    );
    const short = ArticleSchema.parse({ ...article, blocks: [article.blocks[0]] });
    expect(
      pageAnchorOffset(
        short,
        [
          {
            schemaVersion: 1,
            pageIndex: 0,
            blocks: [
              {
                blockIndex: 0,
                startGrapheme: 0,
                endGrapheme: articleGraphemeIndex(short).perBlockLengths[0]!,
              },
            ],
          },
        ],
        0,
      ),
    ).toBe(0);
  });

  it("retains zero-text visual blocks in the ordered window cover", () => {
    const visual = ArticleSchema.parse({
      ...article,
      blocks: Array.from({ length: 70 }, () => ({ kind: "figure", alt: "", caption: [] })),
    });
    const ranges = blockWindows(visual);
    expect(ranges.map((range) => range.endBlock - range.startBlock)).toEqual([32, 32, 6]);
    expect(ranges[0]!.startBlock).toBe(0);
    expect(ranges.at(-1)!.endBlock).toBe(70);
  });

  it("rejects a mismatched revision or incomplete measurement instead of pairing rows with other blocks", () => {
    const wrong = measurement(32, 64);
    wrong.scope!.revision = 2;
    expect(paginate(wrong).reason).toBe("measurement-scope-mismatch");
    const partial = measurement(32, 64);
    partial.blocks.pop();
    expect(paginate(partial).reason).toBe("measurement-scope-mismatch");
  });

  it("resolves direct late-work and end-pin jumps without laying out preceding windows", () => {
    const offset = articleGraphemeIndex(article).blockStartOffsets[500]!;
    expect(blockWindowForOffset(article, offset)).toEqual({ startBlock: 480, endBlock: 512 });
    expect(blockWindowForOffset(article, Number.MAX_SAFE_INTEGER)).toEqual(
      blockWindows(article).at(-1),
    );
  });
});
