import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import {
  blockWindows,
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
