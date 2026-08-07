// tests/unit/pagination/fragmentOrder.test.ts
// Pure-domain tests for the pagination orchestrator's contract invariants:
//
//   PAGE-03 exactly-once + canonical order:
//     - concatenating every page fragment's source ranges covers
//       [0, graphemeLength(article)) with no gaps/overlaps
//     - for any two pages i < j, every intra-block range on i precedes
//       every range on j in canonical (blockIndex, startGrapheme) order
//
//   PAGE-04 termination:
//     - an atomic block at > 75% of page content-box height yields
//       status "fallback" + a dom-fallback diagnostic emit
//
// The orchestrator is pure: it reads DOM geometry via the articleEl stub
// (mocked querySelectorAll + per-element getClientRects via a Range mock)
// and produces a FragmentationResult. jsdom is NOT authoritative for layout
// (Pitfall 2 — RESEARCH §Common Pitfalls); the real cross-engine layout
// proof (no-clipping/no-duplication across Chromium/Firefox/WebKit) lives
// in Plan 05's Playwright corpus matrix. These tests cover the pure logic.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle, InlineRun } from "../../../src/content/types";
import type { MeasurementResult } from "../../../src/measurement/types";
import type { DiagnosticEvent, LineBox } from "../../../src/measurement/types";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import { graphemeClusters, normalizeText } from "../../../src/content/normalizeText";
import { paginateDocument } from "../../../src/pagination/fragment";
import type { FragmentationResult } from "../../../src/pagination/types";

// ─── fixture builders ──────────────────────────────────────────────────────

const baseArticle = {
  id: "fragment-order-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/fragment-order",
    title: "Fragment Order Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function parseArticle(blocks: unknown[]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

/**
 * Build a uniform LineBox[] schedule: `count` lines each 20px tall, breaking
 * at every `charsPerLine` UTF-16 code units. The first line is at top 0.
 * Used to drive the engine via measurement stubs (Plan 04-06 Task 3 path).
 */
function uniformLineBoxes(
  textLength: number,
  charsPerLine: number,
  lineHeight = 20,
): LineBox[] {
  if (textLength === 0) return [];
  const count = Math.max(1, Math.ceil(textLength / charsPerLine));
  const boxes: LineBox[] = [];
  for (let i = 0; i < count; i++) {
    const charOffset = i * charsPerLine;
    boxes.push({
      charOffset,
      topPx: i * lineHeight,
      bottomPx: i * lineHeight + lineHeight - 2,
    });
  }
  return boxes;
}

/** Build a MeasurementResult stub with per-element kind/height/lineCount/lineBoxes. */
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
    computedAt: "2026-08-06T00:00:00.000Z",
  };
}

/** Track every DiagnosticBus emit so tests can assert on dom-fallback events. */
function trackingBus(): { bus: DiagnosticBus; events: DiagnosticEvent[] } {
  const bus = new DiagnosticBus();
  const events: DiagnosticEvent[] = [];
  bus.subscribe((e) => events.push(e));
  return { bus, events };
}

// ─── invariant assertions ──────────────────────────────────────────────────

/**
 * Per-block grapheme length, computed by wrapping the block in a synthetic
 * single-block article and reusing normalizeText (no forked logic — Pitfall 3).
 */
function blockGraphemeLength(
  block: CanonicalArticle["blocks"][number],
): number {
  const synthetic = ArticleSchema.parse({ ...baseArticle, blocks: [block] });
  return graphemeClusters(normalizeText(synthetic), "en").length;
}

/**
 * Assert each block's content is covered EXACTLY ONCE across all pages.
 *
 * The engine emits INTRA-block grapheme ranges (per types.ts: offsets are
 * 0-based within each block, NOT article-global). So we group ranges by
 * blockIndex and verify that each block's intra-block ranges union to
 * [0, blockLength) with no gaps or overlaps within the block.
 *
 * BLOCK_SEPARATOR characters between blocks are NOT reader-visible content
 * and are intentionally not covered by any range — they are an artifact of
 * the normalized-text concatenation, not a content unit (PAGE-03 "every
 * supported content unit appears exactly once").
 */
function assertExactOnceCoverage(
  article: CanonicalArticle,
  result: FragmentationResult,
): void {
  expect(result.status).toBe("ok");
  expect(result.pages.length).toBeGreaterThan(0);
  // Group ranges by blockIndex.
  const byBlock = new Map<number, Array<{ start: number; end: number }>>();
  for (const page of result.pages) {
    for (const entry of page.blocks) {
      const arr = byBlock.get(entry.blockIndex) ?? [];
      arr.push({ start: entry.startGrapheme, end: entry.endGrapheme });
      byBlock.set(entry.blockIndex, arr);
    }
  }
  // Each block's intra-block ranges union to [0, blockLength) exactly once.
  for (let i = 0; i < article.blocks.length; i++) {
    const block = article.blocks[i]!;
    const ranges = (byBlock.get(i) ?? []).slice().sort((a, b) => a.start - b.start);
    const blockLen = blockGraphemeLength(block);
    let cursor = 0;
    for (const r of ranges) {
      expect(r.start).toBe(cursor);
      expect(r.end).toBeGreaterThan(r.start);
      cursor = r.end;
    }
    expect(cursor).toBe(blockLen);
  }
}

/**
 * Assert canonical order across pages: for any two pages i < j, every range
 * on i precedes every range on j in canonical (blockIndex, startGrapheme)
 * order. (A range on page i with blockIndex k + start s must be ≤ any range
 * on page j with blockIndex k' + start s' where (k, s) ≤ (k', s').)
 */
function assertCanonicalOrder(
  _article: CanonicalArticle,
  result: FragmentationResult,
): void {
  for (let i = 0; i < result.pages.length; i++) {
    for (let j = i + 1; j < result.pages.length; j++) {
      const earlier = result.pages[i]!.blocks;
      const later = result.pages[j]!.blocks;
      for (const a of earlier) {
        for (const b of later) {
          // a must precede b: (a.blockIndex, a.endGrapheme) <= (b.blockIndex, b.startGrapheme)
          if (a.blockIndex === b.blockIndex) {
            expect(a.endGrapheme).toBeLessThanOrEqual(b.startGrapheme);
          } else {
            expect(a.blockIndex).toBeLessThan(b.blockIndex);
          }
        }
      }
    }
  }
}

// ─── exactly-once + canonical order ─────────────────────────────────────────

describe("paginateDocument — PAGE-03 exactly-once + canonical order", () => {
  it("4 short paragraphs across 2 pages cover [0, graphemeLength) exactly once", () => {
    // Each paragraph: 4 lines × 20px = 80px. Page height 160px → 2 per page.
    const para = (text: string) => ({
      kind: "paragraph" as const,
      content: [{ text }] as InlineRun[],
    });
    const paraTexts = [
      "aaaa bbbb cccc dddd",
      "eeee ffff gggg hhhh",
      "iiii jjjj kkkk llll",
      "mmmm nnnn oooo pppp",
    ];
    const article = parseArticle(paraTexts.map(para));
    // Build per-block measurement stubs with lineBoxes — the engine consumes
    // pre-captured line boxes from measurement (Plan 04-06 Task 3). Each
    // paragraph is 19 chars at 5 chars/line = 4 lines × 20px = 80px tall.
    const measurement = measurementStub(
      paraTexts.map((t) => ({
        kind: "paragraph",
        heightPx: 80,
        lineCount: 4,
        lineBoxes: uniformLineBoxes(t.length, 5),
      })),
    );
    const { bus } = trackingBus();
    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 160,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    assertExactOnceCoverage(article, result);
    assertCanonicalOrder(article, result);
    // 2 pages with 2 whole-block entries each.
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.blocks).toHaveLength(2);
    expect(result.pages[1]!.blocks).toHaveLength(2);
  });

  it("includes collapsed block margins in the page budget", () => {
    const texts = ["First paragraph.", "Second paragraph.", "Third paragraph."];
    const article = parseArticle(
      texts.map((text) => ({
        kind: "paragraph" as const,
        content: [{ text }] as InlineRun[],
      })),
    );
    const measurement = measurementStub(
      texts.map((text) => ({
        kind: "paragraph",
        heightPx: 180,
        marginBlockStartPx: 30,
        marginBlockEndPx: 30,
        lineCount: 6,
        lineBoxes: uniformLineBoxes(text.length, 3, 30),
      })),
    );
    const { bus } = trackingBus();

    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 600,
      diagnostics: bus,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.blocks).toHaveLength(3);
    expect(result.pages[1]!.blocks).toHaveLength(1);
    expect(result.pages[0]!.blocks[2]!.endGrapheme).toBeLessThan(
      result.pages[1]!.blocks[0]!.endGrapheme,
    );
    assertExactOnceCoverage(article, result);
  });

  it("a single-page article (all blocks fit) emits exactly one page covering [0, length)", () => {
    const article = parseArticle([
      { kind: "heading", level: 2, content: [{ text: "Section title" }] },
      { kind: "paragraph", content: [{ text: "A short body paragraph." }] },
    ]);
    const measurement = measurementStub([
      {
        kind: "heading",
        heightPx: 24,
        lineCount: 1,
        lineBoxes: uniformLineBoxes("Section title".length, 100),
      },
      {
        kind: "paragraph",
        heightPx: 24,
        lineCount: 1,
        lineBoxes: uniformLineBoxes("A short body paragraph.".length, 100),
      },
    ]);
    const { bus } = trackingBus();
    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 200,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    assertExactOnceCoverage(article, result);
    expect(result.pages).toHaveLength(1);
  });

  it("intra-block split covers [0, length) with no gaps/overlaps across pages", () => {
    // Single 10-line paragraph at 20px/line = 200px total. Page height 100px.
    // Engine MUST split the block: lines [0,5) on page 1 (100px), [5,10) on
    // page 2 (100px). With widow rules (SPLIT_WIDOW_LINES=2), the split
    // must keep at least 2 lines per side; candidate at line 5 satisfies
    // this naturally.
    const text = "a b c d e f g h i j k l m n o p q r s t";
    const article = parseArticle([
      { kind: "paragraph", content: [{ text }] },
    ]);
    // Line schedule: 10 lines, breaking every 4 chars. text length 39.
    const lineBoxes = uniformLineBoxes(text.length, 4);
    const measurement = measurementStub([
      { kind: "paragraph", heightPx: 200, lineCount: 10, lineBoxes },
    ]);
    const { bus } = trackingBus();
    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 100,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    assertExactOnceCoverage(article, result);
    assertCanonicalOrder(article, result);
    // The block was split — page 1 has the before-slice, page 2 has the
    // after-slice, both referencing blockIndex 0.
    expect(result.pages.length).toBe(2);
    const p1 = result.pages[0]!;
    const p2 = result.pages[1]!;
    expect(p1.blocks).toHaveLength(1);
    expect(p2.blocks).toHaveLength(1);
    expect(p1.blocks[0]!.blockIndex).toBe(0);
    expect(p2.blocks[0]!.blockIndex).toBe(0);
    expect(p1.blocks[0]!.startGrapheme).toBe(0);
    expect(p1.blocks[0]!.endGrapheme).toBe(p2.blocks[0]!.startGrapheme);
    expect(p2.blocks[0]!.endGrapheme).toBe(
      graphemeClusters(normalizeText(article), "en").length,
    );
  });

  // Plan 04-06 Task 3: container-block case. The engine MUST handle a
  // blockquote fixture (previously tripped block-element-mismatch fallback
  // because querySelectorAll counted nested <p> children). With
  // pre-captured lineBoxes via measurement + the [data-block-index] 1:1
  // contract, the engine paginates containers without dom-fallback.
  it("a blockquote fixture paginates to status 'ok' (container-block case)", () => {
    // Two short paragraphs wrapped in a blockquote, then a short paragraph.
    // The blockquote is small enough to fit on one page alongside the
    // standalone paragraph. The test asserts status "ok" — i.e. the engine
    // does NOT trip dom-fallback for the container.
    const article = parseArticle([
      {
        kind: "blockquote",
        children: [
          { kind: "paragraph", content: [{ text: "Quoted one with enough text." }] },
          { kind: "paragraph", content: [{ text: "Quoted two with enough text." }] },
        ],
      },
      { kind: "paragraph", content: [{ text: "Standalone paragraph after." }] },
    ]);
    // Block model text for the blockquote (Plan 04-06 Task 3 contract):
    //   "Quoted one with enough text." + BLOCK_SEPARATOR + "Quoted two with enough text."
    // = "Quoted one with enough text.\nQuoted two with enough text." (57 chars)
    // The measurement captures lineBoxes against THIS text (the renderer's
    // coordinate). 4 lines × ~14 chars/line, 20px/line → 80px tall.
    const blockquoteText =
      "Quoted one with enough text.\nQuoted two with enough text.";
    const blockquoteLineBoxes = uniformLineBoxes(blockquoteText.length, 14);
    const standaloneText = "Standalone paragraph after.";
    const measurement = measurementStub([
      {
        kind: "blockquote",
        heightPx: 80,
        lineCount: 4,
        lineBoxes: blockquoteLineBoxes,
      },
      {
        kind: "paragraph",
        heightPx: 40,
        lineCount: 2,
        lineBoxes: uniformLineBoxes(standaloneText.length, 14),
      },
    ]);
    const { bus, events } = trackingBus();
    const result = paginateDocument({
      article,
      measurement,
      pageContentBoxHeightPx: 200,
      diagnostics: bus,
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("ok");
    expect(result.pages.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(0);
    assertExactOnceCoverage(article, result);
  });
});

// ─── AbortSignal handling (V7 silent cancel) ───────────────────────────────

describe("paginateDocument — AbortSignal handling (V7)", () => {
  it("AbortSignal aborted before walk → throws AbortError (silent cancel)", () => {
    const article = parseArticle([
      { kind: "paragraph", content: [{ text: "hi" }] },
    ]);
    const measurement = measurementStub([
      {
        kind: "paragraph",
        heightPx: 20,
        lineCount: 1,
        lineBoxes: uniformLineBoxes(2, 100),
      },
    ]);
    const { bus } = trackingBus();
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      paginateDocument({
        article,
        measurement,
        pageContentBoxHeightPx: 100,
        diagnostics: bus,
        signal: controller.signal,
      }),
    ).toThrowError(/abort/i);
  });
});
