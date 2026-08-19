// tests/unit/pagination/progress-formula.test.ts
// Boundary-value unit tests for the offset-anchored paginated progress ratio
// (POLISH-02, Phase 13 Plan 02). The OLD hairline semantics divided page
// numbers (current/total), so a one-page article read 100% on open and page 1
// of a two-page article read 50% at the very start. The NEW semantics anchor
// progress to actual position in the text:
//
//   ratio = pageStartGlobalOffset(article, fragment) / graphemeLength(article)
//
// over the D-05 grapheme coordinate system (derived per layout, never
// persisted). SC#2 boundary table under test:
//
//   1. one-page article, only fragment        → 0 (not 100% on open)
//   2. first fragment of a multi-page article → 0 (progresses from the start)
//   3. successive fragments                    → monotonically non-decreasing;
//      last fragment strictly below 1 while the last page has content
//   4. graphemeLength 0 (defensive empty)      → 0
//   5. start offset beyond total (defensive)   → clamps to 1
//
// Pure-domain tests: the helper composes ONLY pageStartGlobalOffset
// (src/pagination/anchor.ts) + graphemeLength (src/content/normalizeText.ts)
// — REUSE-DO-NOT-FORK; no new offset-accumulation walks are asserted against.
// Article construction follows the tests/unit/pagination/fragmentOrder.test.ts
// neighbors (baseArticle + ArticleSchema.parse), not new factories.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle, InlineRun } from "../../../src/content/types";
import { paginatedProgressRatio } from "../../../src/pagination/progress";
import type { PageFragment } from "../../../src/pagination/types";

// ─── fixture builders (fragmentOrder.test.ts analogs) ───────────────────────

const baseArticle = {
  id: "progress-formula-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/progress-formula",
    title: "Progress Formula Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function parseArticle(blocks: unknown[]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

const paragraph = (text: string) => ({
  kind: "paragraph" as const,
  content: [{ text }] as InlineRun[],
});

function fragment(
  pageIndex: number,
  blocks: Array<{ blockIndex: number; startGrapheme: number; endGrapheme: number }>,
): PageFragment {
  return { schemaVersion: 1, pageIndex, blocks };
}

// ─── SC#2 boundary table ─────────────────────────────────────────────────────

describe("paginatedProgressRatio — SC#2 boundary table", () => {
  it("a one-page article's only fragment yields ratio 0 (1-page no longer reads 100% on open)", () => {
    const article = parseArticle([
      paragraph("A calm short paragraph."),
      paragraph("A second calm paragraph."),
    ]);
    // The engine's single page covering both blocks whole.
    const only = fragment(0, [
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 23 },
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 25 },
    ]);
    expect(paginatedProgressRatio(article, only)).toBe(0);
  });

  it("the first fragment of a multi-fragment article yields ratio 0 (progresses from the start)", () => {
    const article = parseArticle([
      paragraph("First paragraph of several here."),
      paragraph("Second paragraph of several here."),
      paragraph("Third paragraph of several here."),
    ]);
    const first = fragment(0, [
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 31 },
    ]);
    expect(paginatedProgressRatio(article, first)).toBe(0);
  });

  it("ratios across successive fragments are monotonically non-decreasing and the last fragment's ratio is strictly below 1", () => {
    const texts = [
      "First paragraph of several here.",
      "Second paragraph of several here.",
      "Third paragraph of several here.",
    ];
    const article = parseArticle(texts.map(paragraph));
    // One whole block per page (hand-built cover, canonical order).
    const pages = texts.map((text, i) =>
      fragment(i, [{ blockIndex: i, startGrapheme: 0, endGrapheme: text.length }]),
    );
    const ratios = pages.map((p) => paginatedProgressRatio(article, p));
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1]!);
    }
    // The last page still has content (its block is non-empty), so its START
    // offset sits strictly inside the article — below 1.
    expect(ratios[ratios.length - 1]!).toBeGreaterThan(0);
    expect(ratios[ratios.length - 1]!).toBeLessThan(1);
  });

  it("an article whose graphemeLength is 0 yields ratio 0 (defensive empty)", () => {
    // A code-block with empty source is schema-valid and normalizes to "".
    const article = parseArticle([{ kind: "code-block", source: "" }]);
    const only = fragment(0, [
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 0 },
    ]);
    expect(paginatedProgressRatio(article, only)).toBe(0);
  });

  it("a start offset beyond total clamps to 1 (defensive upper bound)", () => {
    const article = parseArticle([paragraph("Hello world")]);
    // Stale corpus fragment whose start overshoots the article (11 graphemes).
    const stale = fragment(0, [
      { blockIndex: 0, startGrapheme: 999, endGrapheme: 1000 },
    ]);
    expect(paginatedProgressRatio(article, stale)).toBe(1);
  });
});
