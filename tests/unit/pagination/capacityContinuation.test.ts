import { describe, expect, it, vi } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";
import { paginateDocument } from "../../../src/pagination/fragment";
import { refragmentOverflowingPage } from "../../../src/pagination/overflowGuard";

vi.mock("../../../src/pagination/lineBoxes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/pagination/lineBoxes")>()),
  readLineBoxes: () =>
    Array.from({ length: 4 }, (_, k) => ({
      charOffset: k * 2,
      topPx: k * 20,
      bottomPx: (k + 1) * 20,
    })),
}));
import { pageAnchorOffset } from "../../../src/pagination/anchor";
import type { PageFragment } from "../../../src/pagination/types";
import {
  refineWindow,
  windowHasNext,
  windowHasPrevious,
} from "../../../src/pagination/blockWindow";

const article = ArticleSchema.parse({
  id: "capacity",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Capacity",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "capacity",
  },
  blocks: Array.from({ length: 302 }, () => ({
    kind: "heading",
    level: 2,
    content: [{ text: "Heading", marks: [] }],
  })),
});
const measurement: MeasurementResult = {
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
  scope: { articleId: article.id, revision: 1, startBlock: 0, endBlock: 302 },
  blocks: article.blocks.map(() => ({
    kind: "heading",
    heightPx: 40,
    lineCount: 1,
    lineBoxes: [],
  })),
};

describe("pagination capacity is an advancing continuation, not a failure", () => {
  it("retains 300 usable pages and resumes at the first omitted original source coordinate", () => {
    const diagnostics = new DiagnosticBus();
    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 60,
      diagnostics,
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.pages).toHaveLength(300);
    expect(result.pages[0]!.blocks[0]!.blockIndex).toBe(0);
    expect(result.pages.at(-1)!.blocks[0]!.blockIndex).toBe(299);
    expect(result.continuation).toEqual({ blockIndex: 300, startGrapheme: 0 });
    expect(pageAnchorOffset(article, result.pages, 299)).toBeLessThan(2414);
    expect(diagnostics.recent()).toEqual([]);
    const tail = paginateDocument({
      article,
      measurement: {
        ...measurement,
        scope: { articleId: article.id, revision: 1, startBlock: 300, endBlock: 302 },
        blocks: measurement.blocks.slice(300),
      },
      pageContentBoxHeightPx: 60,
      diagnostics,
      signal: new AbortController().signal,
    });
    expect(tail.status).toBe("ok");
    expect(tail.pages.flatMap((p) => p.blocks.map((b) => b.blockIndex))).toEqual([300, 301]);
    expect(tail.continuation).toBeUndefined();
  });

  it("repeatedly splits a prose scope before live repair and continues at page capacity", () => {
    const prose = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(8000), marks: [] }] }],
    });
    const measureSlice = (start: number): MeasurementResult => ({
      ...measurement,
      scope: {
        articleId: prose.id,
        revision: 1,
        startBlock: 0,
        endBlock: 1,
        startGrapheme: start,
        endGrapheme: 8000,
      },
      blocks: [
        {
          kind: "paragraph",
          heightPx: ((8000 - start) / 8) * 20,
          lineCount: (8000 - start) / 8,
          lineBoxes: Array.from({ length: (8000 - start) / 8 }, (_, k) => ({
            charOffset: k * 8,
            topPx: k * 20,
            bottomPx: (k + 1) * 20,
          })),
        },
      ],
    });
    const paginate = (start: number) =>
      paginateDocument({
        article: prose,
        measurement: measureSlice(start),
        pageContentBoxHeightPx: 40,
        diagnostics: new DiagnosticBus(),
        signal: new AbortController().signal,
      });
    const first = paginate(0);
    expect(first.status).toBe("ok");
    expect(first.pages).toHaveLength(300);
    expect(first.continuation).toEqual({ blockIndex: 0, startGrapheme: 4800 });
    expect(first.pages.at(-1)!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 4784, endGrapheme: 4800 },
    ]);
    const tail = paginate(4800);
    expect(tail.status).toBe("ok");
    expect(tail.pages).toHaveLength(200);
    expect(tail.continuation).toBeUndefined();
    const entries = [...first.pages, ...tail.pages].flatMap((page) => page.blocks);
    expect(entries.map((entry) => entry.startGrapheme)).toEqual(
      Array.from({ length: 500 }, (_, k) => k * 16),
    );
    expect(entries.at(-1)!.endGrapheme).toBe(8000);
  });

  it("does not reapply a source paragraph's top margin to each continuation", () => {
    const prose = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(64), marks: [] }] }],
    });
    const result = paginateDocument({
      article: prose,
      measurement: {
        ...measurement,
        scope: { articleId: prose.id, revision: 1, startBlock: 0, endBlock: 1 },
        blocks: [
          {
            kind: "paragraph",
            heightPx: 160,
            marginBlockStartPx: 10,
            lineCount: 8,
            lineBoxes: Array.from({ length: 8 }, (_, k) => ({
              charOffset: k * 8,
              topPx: k * 20,
              bottomPx: (k + 1) * 20,
            })),
          },
        ],
      },
      pageContentBoxHeightPx: 60,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(
      result.pages.flatMap((page) =>
        page.blocks.map((entry) => [entry.startGrapheme, entry.endGrapheme]),
      ),
    ).toEqual([
      [0, 16],
      [16, 40],
      [40, 64],
    ]);
  });

  function correction(tooTall = false) {
    const pages: PageFragment[] = Array.from({ length: 300 }, (_, i) => ({
      schemaVersion: 1,
      pageIndex: i,
      blocks: (i === 0 ? [0, 1] : [i + 1]).map((blockIndex) => ({
        blockIndex,
        startGrapheme: 0,
        endGrapheme: 7,
      })),
    }));
    const fragmentEl = document.createElement("section");
    fragmentEl.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    for (const [top, bottom] of [
      [0, 40],
      [40, tooTall ? 140 : 80],
    ]) {
      const child = document.createElement("h2");
      child.getBoundingClientRect = () => ({ top, bottom, height: bottom! - top! }) as DOMRect;
      fragmentEl.appendChild(child);
    }
    const diagnostics = new DiagnosticBus();
    const onCapacity = vi.fn();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 60,
      tolerance: 2,
      diagnostics,
      signal: new AbortController().signal,
      onCapacity,
    });
    return { result, diagnostics, onCapacity };
  }

  it("corrects overflow at capacity, preserving the prefix and yielding its omitted tail", () => {
    const { result, diagnostics, onCapacity } = correction();
    expect(result).toHaveLength(300);
    expect(result![0]!.blocks.map((b) => b.blockIndex)).toEqual([0]);
    expect(result![1]!.blocks.map((b) => b.blockIndex)).toEqual([1]);
    expect(result!.at(-1)!.blocks[0]!.blockIndex).toBe(299);
    expect(onCapacity).toHaveBeenCalledWith({ blockIndex: 300, startGrapheme: 0 });
    expect(diagnostics.recent()).toEqual([]);
  });

  it("keeps the corrected 300th page and yields an intra-block tail in original coordinates", () => {
    const prose = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(8000), marks: [] }] }],
    });
    const pages: PageFragment[] = Array.from({ length: 300 }, (_, i) => ({
      schemaVersion: 1,
      pageIndex: i,
      blocks: [{ blockIndex: 0, startGrapheme: i * 2, endGrapheme: i === 299 ? 8000 : i * 2 + 2 }],
    }));
    const fragmentEl = document.createElement("section");
    fragmentEl.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    const paragraph = document.createElement("p");
    paragraph.textContent = "x".repeat(7402);
    paragraph.getBoundingClientRect = () => ({ top: 0, bottom: 80, height: 80 }) as DOMRect;
    fragmentEl.appendChild(paragraph);
    const onCapacity = vi.fn();
    const result = refragmentOverflowingPage({
      article: prose,
      pages,
      overflowingPageIndex: 299,
      fragmentEl,
      pageContentBoxHeightPx: 40,
      tolerance: 0,
      diagnostics: new DiagnosticBus(),
      signal: new AbortController().signal,
      onCapacity,
    });
    expect(result).toHaveLength(300);
    expect(result!.at(-1)!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 598, endGrapheme: 602 },
    ]);
    expect(onCapacity).toHaveBeenCalledWith({ blockIndex: 0, startGrapheme: 602 });
  });

  it("keeps work boundaries honest for capacity-refined windows, not just initial windows", () => {
    const prose = ArticleSchema.parse({
      ...article,
      blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(16000), marks: [] }] }],
    });
    const refined = refineWindow(
      prose,
      { startBlock: 0, endBlock: 1, endGrapheme: 8000 },
      { blockIndex: 0, startGrapheme: 4000 },
    )!;
    expect(refined).toEqual([
      { startBlock: 0, endBlock: 1, endGrapheme: 4000 },
      { startBlock: 0, startGrapheme: 4000, endBlock: 1, endGrapheme: 8000 },
    ]);
    expect(windowHasPrevious(prose, refined[0])).toBe(false);
    expect(windowHasNext(prose, refined[0])).toBe(true);
    expect(windowHasPrevious(prose, refined[1])).toBe(true);
    expect(windowHasNext(prose, refined[1])).toBe(true);
  });

  it("does not disguise a genuinely uncorrectable block as capacity", () => {
    const { result, diagnostics, onCapacity } = correction(true);
    expect(result).toEqual([]);
    expect(onCapacity).not.toHaveBeenCalled();
    expect(diagnostics.recent().at(-1)).toMatchObject({
      kind: "dom-fallback",
      reason: "overflow-no-progress",
    });
  });
});
