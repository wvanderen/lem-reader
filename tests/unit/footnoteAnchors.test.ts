import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { Block } from "../../src/content/types";
import { articleGraphemeIndex, footnoteRows } from "../../src/content/normalizeText";
import { footnoteAnchorOffset } from "../../src/reader/footnoteAnchors";

const reference: Block = { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" };
const prose: Block = {
  kind: "paragraph",
  content: [
    { text: "  Earlier 👩‍👩‍👧‍👦 prose  ", marks: [] },
    { text: "e\u0301", marks: [] },
  ],
};

function articleWith(block: Block) {
  return ArticleSchema.parse({
    id: "footnote-anchor",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Footnote navigation",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "footnote-anchor-v1",
    },
    blocks: [prose, block],
    footnotes: [
      { id: "fn-1", content: [{ text: "The note body.", marks: [] }] },
      { id: "fn-2", content: [{ text: "  ", marks: [] }] },
    ],
  });
}

describe("footnote anchor destinations", () => {
  it("resolves notes and top-level references in canonical graphemes", () => {
    const article = articleWith(reference);
    expect(footnoteAnchorOffset(article, "#fn-1")).toBe(footnoteRows(article)[0]!.start);
    expect(footnoteAnchorOffset(article, "#fn-ref-1")).toBe(
      articleGraphemeIndex(article).blockStartOffsets[1],
    );
  });

  it.each(["blockquote", "bulleted-list", "numbered-list"] as const)(
    "finds the precise nested destination in %s, including empty item separators",
    (kind) => {
      const children: Block[] = [prose, { kind: "blockquote", children: [prose, reference] }];
      const container: Block =
        kind === "blockquote"
          ? { kind, children }
          : kind === "numbered-list"
            ? {
                kind,
                start: 4,
                items: [{ content: [] }, { content: [prose] }, { content: children }],
              }
            : { kind, items: [{ content: [] }, { content: [prose] }, { content: children }] };
      const article = articleWith(container);
      const index = articleGraphemeIndex(article);
      const expected = index.clusters.indexOf("[");
      expect(expected).toBeGreaterThan(index.blockStartOffsets[1]!);
      expect(footnoteAnchorOffset(article, "#fn-ref-1")).toBe(expected);
      expect(index.clusters.slice(expected, expected + 3).join("")).toBe("[1]");
    },
  );

  it("does not invent destinations for missing references, unknown IDs, or empty notes", () => {
    const article = articleWith(reference);
    for (const href of ["#fn-2", "#fn-99", "#fn-ref-2", "#fn-ref-99", "#main", "#fn-1-extra"]) {
      expect(footnoteAnchorOffset(article, href)).toBeNull();
    }
  });
});
