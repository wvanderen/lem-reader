// tests/unit/annotations/selector-roundtrip.test.ts
// The ANNO-05/ANNO-06 round-trip invariant: for the same revision,
//   offset → deriveQuoteSelector → resolveQuoteSelector → offset
// must equal the original offset byte-for-byte. This is the load-bearing
// correctness property of the entire annotation layer — every UI slice in
// Plans 05-02..05-05 depends on it.
//
// Mirrors tests/unit/selectors.test.ts conventions. Pure logic — jsdom-safe.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
  resolveQuoteSelector,
} from "../../../src/content/normalizeText";
import type { CanonicalArticle } from "../../../src/content/types";
import type { TextPositionSelector } from "../../../src/content/normalizeText";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "roundtrip-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/roundtrip",
    title: "Round-trip Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:roundtrip",
  },
};

/** A small synthetic article set exercising multi-block + footnote shapes. */
function syntheticArticles(): CanonicalArticle[] {
  return [
    parseArticle({
      ...baseArticle,
      id: "roundtrip-single",
      blocks: [
        {
          kind: "paragraph",
          content: [
            {
              text: "the calm booklike reader anchors highlights to normalized text grapheme offsets",
            },
          ],
        },
      ],
    }),
    parseArticle({
      ...baseArticle,
      id: "roundtrip-multi",
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "First Section" }] },
        {
          kind: "paragraph",
          content: [{ text: "opening paragraph with several readable sentences" }],
        },
        { kind: "heading", level: 3, content: [{ text: "Subsection" }] },
        {
          kind: "paragraph",
          content: [{ text: "a second paragraph carries different vocabulary" }],
        },
      ],
    }),
    parseArticle({
      ...baseArticle,
      id: "roundtrip-footnote",
      blocks: [
        {
          kind: "paragraph",
          content: [
            { text: "body with a footnote marker" },
            { text: " following more text here" },
          ],
        },
        {
          kind: "footnote-reference",
          footnoteId: "fn-1",
          marker: "[1]",
        },
      ],
      footnotes: [
        { id: "fn-1", content: [{ text: "the footnote body content stands alone" }] },
      ],
    }),
  ];
}

/**
 * Collect a few sample positions across an article: one near the start, one in
 * the middle, one near the end. Positions are clamped to valid ranges and
 * avoid zero-length spans.
 */
function samplePositions(article: CanonicalArticle): TextPositionSelector[] {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const total = clusters.length;
  if (total < 10) return [{ start: 0, end: Math.min(4, total) }];
  const positions: TextPositionSelector[] = [
    { start: 1, end: 5 },
    { start: Math.floor(total / 2), end: Math.floor(total / 2) + 4 },
    { start: Math.max(0, total - 6), end: total - 1 },
  ];
  return positions;
}

describe("selector round-trip — ANNO-05/06 invariant (same revision)", () => {
  for (const article of syntheticArticles()) {
    describe(`article ${article.id} (lang=${article.lang})`, () => {
      for (const position of samplePositions(article)) {
        const label = `position {start:${position.start}, end:${position.end}}`;
        it(`round-trips ${label} through derive → resolve`, () => {
          const selector = deriveQuoteSelector(article, position);
          const resolved = resolveQuoteSelector(article, selector, position);
          // The resolved value MUST be a TextPositionSelector (not ambiguous/orphan)
          // because the same-revision text is byte-identical — exact always matches
          // at least once at the original position.
          expect(resolved).not.toBe("ambiguous");
          expect(resolved).not.toBe("orphan");
          const resolvedPos = resolved as TextPositionSelector;
          // ANNO-05 invariant: byte-for-byte equality with the original.
          expect(resolvedPos.start).toBe(position.start);
          expect(resolvedPos.end).toBe(position.end);
        });
      }
    });
  }

  it("the resolved exact equals the derived exact on the same article", () => {
    const article = syntheticArticles()[1]!;
    const position = samplePositions(article)[1]!;
    const selector = deriveQuoteSelector(article, position);
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const expectedExact = clusters
      .slice(position.start, position.end)
      .join("");
    expect(selector.exact).toBe(expectedExact);
  });
});
