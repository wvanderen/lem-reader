// tests/unit/pagination/firstPageReserved.test.ts
// Plan 13-04 (Option A — human decision 2026-08-18): boundary unit tests
// for the additive `firstPageReservedPx` pagination-engine parameter.
//
// CONTRACT UNDER TEST:
//   - default equivalence: omitting the option and passing 0 produce
//     byte-identical FragmentationResults (the pre-13-04 behavior for
//     every existing caller/test)
//   - page-1 budget: page 1 places less content (viewport - reserve);
//     pages 2+ keep the FULL viewport budget
//   - floor clamp: an oversized reserve floors page 1's budget at
//     FIRST_PAGE_BUDGET_FLOOR instead of collapsing the walk
//   - soft-budget escapes: a first block that exceeds the reserved budget
//     but fits the FULL page height still places on (or splits onto) page
//     1 — the reserve never manufactures a dom-fallback the unreserved
//     engine would not produce
//
// Pure-domain tests only (jsdom is NOT authoritative for layout — Pitfall
// 2); the cross-engine layout proof lives in the e2e corpus specs.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle, InlineRun } from "../../../src/content/types";
import type { MeasurementResult, LineBox } from "../../../src/measurement/types";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import { graphemeClusters, normalizeText } from "../../../src/content/normalizeText";
import { paginateDocument } from "../../../src/pagination/fragment";
import type { FragmentationResult } from "../../../src/pagination/types";

// ─── fixture builders (mirrors fragmentOrder.test.ts) ──────────────────────

const baseArticle = {
  id: "first-page-reserved-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/first-page-reserved",
    title: "First Page Reserved Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function parseArticle(blocks: unknown[]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

function uniformLineBoxes(
  textLength: number,
  charsPerLine: number,
  lineHeight = 20,
): LineBox[] {
  if (textLength === 0) return [];
  const count = Math.max(1, Math.ceil(textLength / charsPerLine));
  const boxes: LineBox[] = [];
  for (let i = 0; i < count; i++) {
    boxes.push({
      charOffset: i * charsPerLine,
      topPx: i * lineHeight,
      bottomPx: i * lineHeight + lineHeight - 2,
    });
  }
  return boxes;
}

function measurementStub(
  rows: Array<{
    kind: string;
    heightPx: number;
    marginBlockStartPx?: number;
    marginBlockEndPx?: number;
    lineCount: number;
    lineBoxes?: LineBox[];
  }>,
): MeasurementResult {
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
    blocks: rows.map((r) => ({ ...r, lineBoxes: r.lineBoxes ?? [] })),
    computedAt: "2026-08-18T00:00:00.000Z",
  };
}

function run(
  article: CanonicalArticle,
  measurement: MeasurementResult,
  pageContentBoxHeightPx: number,
  firstPageReservedPx?: number,
): FragmentationResult {
  return paginateDocument({
    article,
    measurement,
    pageContentBoxHeightPx,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
    ...(firstPageReservedPx === undefined ? {} : { firstPageReservedPx }),
  });
}

const para = (text: string) => ({
  kind: "paragraph" as const,
  content: [{ text }] as InlineRun[],
});

/** Per-block grapheme length via the shared substrate (no fork — Pitfall 3). */
function blockGraphemeLength(block: CanonicalArticle["blocks"][number]): number {
  const synthetic = ArticleSchema.parse({ ...baseArticle, blocks: [block] });
  return graphemeClusters(normalizeText(synthetic), "en").length;
}

/** Assert every block's intra-block ranges union to [0, blockLen) exactly once. */
function assertExactOnceCoverage(
  article: CanonicalArticle,
  result: FragmentationResult,
): void {
  expect(result.status).toBe("ok");
  expect(result.pages.length).toBeGreaterThan(0);
  const byBlock = new Map<number, Array<{ start: number; end: number }>>();
  for (const page of result.pages) {
    for (const entry of page.blocks) {
      const arr = byBlock.get(entry.blockIndex) ?? [];
      arr.push({ start: entry.startGrapheme, end: entry.endGrapheme });
      byBlock.set(entry.blockIndex, arr);
    }
  }
  for (let i = 0; i < article.blocks.length; i++) {
    const ranges = (byBlock.get(i) ?? []).slice().sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const r of ranges) {
      expect(r.start).toBe(cursor);
      expect(r.end).toBeGreaterThan(r.start);
      cursor = r.end;
    }
    expect(cursor).toBe(blockGraphemeLength(article.blocks[i]!));
  }
}

/** Four uniform paragraphs, each `blockPx` tall (whole-block placement). */
function uniformArticle(texts: string[], blockPx: number, lineHeight: number) {
  const article = parseArticle(texts.map(para));
  const measurement = measurementStub(
    texts.map((t) => ({
      kind: "paragraph",
      heightPx: blockPx,
      lineCount: Math.round(blockPx / lineHeight),
      lineBoxes: uniformLineBoxes(t.length, 5, lineHeight),
    })),
  );
  return { article, measurement };
}

// ─── tests ─────────────────────────────────────────────────────────────────

describe("paginateDocument — firstPageReservedPx (Plan 13-04 Option A)", () => {
  const TEXTS = [
    "aaaa bbbb cccc dddd eeee",
    "ffff gggg hhhh iiii jjjj",
    "kkkk llll mmmm nnnn oooo",
    "pppp qqqq rrrr ssss tttt",
  ];

  it("omitting the option and passing 0 are byte-identical (default equivalence)", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    const omitted = run(article, measurement, 160);
    const zero = run(article, measurement, 160, 0);
    expect(zero).toEqual(omitted);
    expect(omitted.status).toBe("ok");
  });

  it("reserve 0 on a multi-page article equals the unreserved engine (regression lock)", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    // Page height 160 → 2 whole 80px blocks per page (baseline [2, 2]).
    const baseline = run(article, measurement, 160);
    expect(baseline.pages.map((p) => p.blocks.length)).toEqual([2, 2]);
    const zeroReserve = run(article, measurement, 160, 0);
    expect(zeroReserve.pages).toEqual(baseline.pages);
  });

  it("page 1 places within (viewport - reserve); pages 2+ keep the FULL budget", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    // Reserve 100 on a 200px page: page-1 budget 100 → one 80px block
    // (a second would reach 160 > 100). Page 2 pays NO reserve → two whole
    // blocks (160) PLUS a widow-legal 2-line slice of the third (160+38 =
    // 198 ≤ 200 — impossible under the 100 reserved budget). Page 3 carries
    // the remainder of block 3.
    const result = run(article, measurement, 200, 100);
    expect(result.status).toBe("ok");
    expect(result.pages.map((p) => p.blocks.length)).toEqual([1, 3, 1]);
    // Page 1 holds exactly one whole block (the reserved budget bound it).
    expect(result.pages[0]!.blocks).toHaveLength(1);
    expect(result.pages[0]!.blocks[0]!.endGrapheme).toBe(
      blockGraphemeLength(article.blocks[0]!),
    );
    assertExactOnceCoverage(article, result);
  });

  it("a reserve larger than the viewport floors page 1's budget instead of falling back", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    // Reserve 10x the 200px page: budget floors at 0.5 * 200 = 100 → page 1
    // still places one block; pages 2+ full. The pre-Option-A in-flow-spot
    // failure mode (starved page 1 → dom-fallback collapse) must not occur.
    const result = run(article, measurement, 200, 2000);
    expect(result.status).toBe("ok");
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages[0]!.blocks.length).toBeGreaterThan(0);
    assertExactOnceCoverage(article, result);
  });

  it("negative reserves normalize to 0 (defensive clamp)", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    const baseline = run(article, measurement, 160);
    const negative = run(article, measurement, 160, -50);
    expect(negative).toEqual(baseline);
  });

  it("ATOMIC first block that exceeds the reserved budget but fits the full page still places on page 1", () => {
    // Heading (atomic per classifyBlock): 120px on a 200px page with a 100px
    // reserve → exceeds the 100px reserved budget, fits the full page.
    // Without the soft-budget escape, Case B's flushPage() on the EMPTY
    // first page throws zero-progress → dom-fallback (the collapse class).
    const article = parseArticle([
      { kind: "heading", level: 2, content: [{ text: "A tall opening heading" }] },
      ...TEXTS.slice(0, 2).map(para),
    ]);
    const measurement = measurementStub([
      {
        kind: "heading",
        heightPx: 120,
        lineCount: 3,
        lineBoxes: uniformLineBoxes("A tall opening heading".length, 9, 40),
      },
      ...TEXTS.slice(0, 2).map((t) => ({
        kind: "paragraph",
        heightPx: 80,
        lineCount: 4,
        lineBoxes: uniformLineBoxes(t.length, 5),
      })),
    ]);
    const result = run(article, measurement, 200, 100);
    expect(result.status).toBe("ok");
    expect(result.pages[0]!.blocks[0]!.blockIndex).toBe(0);
    expect(result.pages[0]!.blocks[0]!.startGrapheme).toBe(0);
    expect(result.pages[0]!.blocks[0]!.endGrapheme).toBe(
      blockGraphemeLength(article.blocks[0]!),
    );
    assertExactOnceCoverage(article, result);
  });

  it("SPLITTING first block with no widow-legal reserved-budget split retries at the full page height", () => {
    // 4 lines x 55px = 220px block on a 200px page with a 100px reserve
    // (page-1 budget 100). No widow-legal split fits 100px (2 lines = 110),
    // so the escape retries against the full 200px page: a 2-line
    // (110px ≤ 200) widow-legal before-slice places on page 1 instead of
    // the unreservable "unsplittable-block-overflow" fallback.
    const text = "aaaa bbbb cccc dddd";
    const article = parseArticle([para(text), ...TEXTS.slice(0, 1).map(para)]);
    const measurement = measurementStub([
      {
        kind: "paragraph",
        heightPx: 220,
        lineCount: 4,
        lineBoxes: uniformLineBoxes(text.length, 5, 55),
      },
      ...TEXTS.slice(0, 1).map((t) => ({
        kind: "paragraph",
        heightPx: 80,
        lineCount: 4,
        lineBoxes: uniformLineBoxes(t.length, 5),
      })),
    ]);
    const result = run(article, measurement, 200, 100);
    expect(result.status).toBe("ok");
    // Page 1 holds a PARTIAL slice of block 0 (the escaped split).
    const page1Block0 = result.pages[0]!.blocks.find((b) => b.blockIndex === 0);
    expect(page1Block0).toBeDefined();
    expect(page1Block0!.endGrapheme).toBeGreaterThan(0);
    expect(page1Block0!.endGrapheme).toBeLessThan(
      blockGraphemeLength(article.blocks[0]!),
    );
    assertExactOnceCoverage(article, result);
  });

  it("reserve applies to page 1 ONLY — a later flush never re-pays it", () => {
    const { article, measurement } = uniformArticle(TEXTS, 80, 20);
    const result = run(article, measurement, 200, 100);
    expect(result.pages.map((p) => p.blocks.length)).toEqual([1, 3, 1]);
    // Page 2 carries two whole 80px blocks plus a 2-line slice = 198px of
    // placed content — far beyond the 100px reserved budget, proof that
    // pages 2+ use the FULL viewport budget.
    const page2Entries = result.pages[1]!.blocks;
    expect(page2Entries.length).toBe(3);
    const page2HasPartialSlice = page2Entries.some(
      (e, idx) =>
        idx === page2Entries.length - 1 &&
        e.endGrapheme < blockGraphemeLength(article.blocks[e.blockIndex]!),
    );
    expect(page2HasPartialSlice).toBe(true);
  });
});
