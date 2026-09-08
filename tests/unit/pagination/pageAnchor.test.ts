// tests/unit/pagination/pageAnchor.test.ts
// 260908-oht — boundary-value unit tests for the committed-page anchor
// (pageAnchorOffset). Completion is DERIVED from the saved reading-position
// offset (Math.min(1, offset/total) >= 0.98), but only page/block START
// offsets were ever persisted — the last page of a multi-page article starts
// around 0.90 of the text, so no article ever crossed the threshold
// passively. pageAnchorOffset pins the LAST page of a MULTI-page set to
// graphemeLength(article) while keeping every other page (and the only page
// of a one-page set — POLISH-02's open-reads-0 boundary) at its
// pageStartGlobalOffset.
//
// Pure-domain tests: the helper composes ONLY graphemeLength
// (src/content/normalizeText.ts) + pageStartGlobalOffset (this module) —
// REUSE-DO-NOT-FORK. Fixture builders mirror progress-formula.test.ts
// (baseArticle + ArticleSchema.parse + paragraph() + fragment()).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle, InlineRun } from "../../../src/content/types";
import { graphemeLength } from "../../../src/content/normalizeText";
import {
  pageAnchorOffset,
  pageStartGlobalOffset,
} from "../../../src/pagination/anchor";
import type { PageFragment } from "../../../src/pagination/types";

// ─── fixture builders (progress-formula.test.ts analogs) ────────────────────

const baseArticle = {
  id: "page-anchor-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/page-anchor",
    title: "Page Anchor Test",
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

// ─── boundary table ──────────────────────────────────────────────────────────

describe("pageAnchorOffset — committed-page anchor boundary table", () => {
  it("empty pages → 0 (defensive)", () => {
    const article = parseArticle([paragraph("Hello world")]);
    expect(pageAnchorOffset(article, [], 0)).toBe(0);
  });

  it("out-of-range idx → 0 (negative and past the end)", () => {
    const article = parseArticle([
      paragraph("First paragraph of several here."),
      paragraph("Second paragraph of several here."),
      paragraph("Third paragraph of several here."),
    ]);
    const pages = [
      fragment(0, [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 31 }]),
      fragment(1, [{ blockIndex: 1, startGrapheme: 0, endGrapheme: 32 }]),
      fragment(2, [{ blockIndex: 2, startGrapheme: 0, endGrapheme: 31 }]),
    ];
    expect(pageAnchorOffset(article, pages, -1)).toBe(0);
    expect(pageAnchorOffset(article, pages, 3)).toBe(0);
    expect(pageAnchorOffset(article, pages, 99)).toBe(0);
  });

  it("first/middle page of a 3-page set → pageStartGlobalOffset value (byte-identical to today)", () => {
    const texts = [
      "First paragraph of several here.",
      "Second paragraph of several here.",
      "Third paragraph of several here.",
    ];
    const article = parseArticle(texts.map(paragraph));
    const pages = texts.map((text, i) =>
      fragment(i, [{ blockIndex: i, startGrapheme: 0, endGrapheme: text.length }]),
    );
    expect(pageAnchorOffset(article, pages, 0)).toBe(
      pageStartGlobalOffset(article, pages[0]!),
    );
    expect(pageAnchorOffset(article, pages, 0)).toBe(0);
    expect(pageAnchorOffset(article, pages, 1)).toBe(
      pageStartGlobalOffset(article, pages[1]!),
    );
  });

  it("last page of a 3-page set → graphemeLength(article) (the completion pin)", () => {
    const texts = [
      "First paragraph of several here.",
      "Second paragraph of several here.",
      "Third paragraph of several here.",
    ];
    const article = parseArticle(texts.map(paragraph));
    const pages = texts.map((text, i) =>
      fragment(i, [{ blockIndex: i, startGrapheme: 0, endGrapheme: text.length }]),
    );
    expect(pageAnchorOffset(article, pages, 2)).toBe(graphemeLength(article));
  });

  it("the ONLY page of a 1-page set → 0, not total (POLISH-02 open-reads-0 preserved)", () => {
    const article = parseArticle([
      paragraph("A calm short paragraph."),
      paragraph("A second calm paragraph."),
    ]);
    const only = fragment(0, [
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 23 },
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 25 },
    ]);
    expect(pageAnchorOffset(article, [only], 0)).toBe(0);
  });
});
