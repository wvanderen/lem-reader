// Issue #234 — the windowed measurement projection renders CONTAINER
// boundary blocks as bounded slices.
//
// A giant list or quotation continuation window carries intra-block slice
// bounds on its boundary blocks. The hidden measurement body must render
// ONLY that slice — bounded before layout, including inside one large list
// item or quoted passage — never the whole container. Semantic-only (React
// Testing Library, jsdom — jsdom is NOT authoritative for layout; the
// paginated twin is covered by the pagination + browser suites).
//
// The numbering rule is user-visible here: a continuation window opening
// mid-numbered-list projects the boundary list with <ol start> at the FIRST
// RENDERED ITEM's original ordinal, exactly as the visible page fragments
// will (the ONE shared resolveBlockSlice primitive).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import type { BlockWindow } from "../../../src/pagination/blockWindow";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const article = (blocks: Block[]): CanonicalArticle => ({
  id: "projection-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Projection Article",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
});

const numberedList = (items: string[], start = 1): Block => ({
  kind: "numbered-list",
  items: items.map((text) => ({ content: [paragraph(text)] })),
  start,
});

const blockquote = (children: Block[]): Block => ({ kind: "blockquote", children });

describe("window projection — container boundary blocks", () => {
  const item = (n: number) => `Point ${n} of the ordered argument.`;
  const items = Array.from({ length: 8 }, (_, n) => item(n));
  const fixture = article([
    { kind: "heading", level: 2, content: [{ text: "Heading", marks: [] }] },
    numberedList(items, 5),
    paragraph("A calm closing passage."),
  ]);
  const perItem = Math.ceil(articleGraphemeIndex(fixture).perBlockLengths[1]! / items.length);
  const window: BlockWindow = {
    startBlock: 1,
    endBlock: 3,
    startGrapheme: 2 * perItem, // opens exactly at the third item
  };

  it("projects a numbered list tail with continued numbering and no skipped-item text", () => {
    const { container, unmount } = render(<ArticleBody article={fixture} blockWindow={window} />);
    const list = container.querySelector("ol");
    expect(list).not.toBeNull();
    // The first rendered item is the ORIGINAL third one: numbering continues.
    expect(list).toHaveAttribute("start", "7");
    const rendered = container.querySelectorAll("ol > li");
    expect(rendered).toHaveLength(6);
    expect(rendered[0]!.textContent).toContain("Point 2");
    // The skipped items' text renders nowhere in the projection.
    expect(container.textContent).not.toContain("Point 1");
    expect(container.textContent).not.toContain("Point 0");
    // Later blocks of the window still render (the closing passage).
    expect(container.textContent).toContain("A calm closing passage.");
    unmount();
  });

  it("projects a quoted tail through the quotation's own semantics", () => {
    const quoteFixture = article([
      {
        kind: "heading",
        level: 2,
        content: [{ text: "Heading", marks: [] }],
      },
      blockquote([
        paragraph("Outer opening passage."),
        blockquote([paragraph("Inner witness passage.")]),
        paragraph("Outer closing passage."),
      ]),
      paragraph("A calm closing passage."),
    ]);
    const lengths = articleGraphemeIndex(quoteFixture).perBlockLengths;
    // Cut after "Inner " inside the nested witness (mid-child): the nested
    // quote survives with the rest of its text.
    const cut = 22 + 1 + 6;
    const { container, unmount } = render(
      <ArticleBody
        article={quoteFixture}
        blockWindow={{ startBlock: 1, endBlock: 3, startGrapheme: cut }}
      />,
    );
    // The projection is still a quotation (one outer blockquote), and the
    // omitted opening passage renders nowhere.
    expect(container.querySelectorAll("blockquote")).toHaveLength(2); // outer + nested
    expect(container.textContent).not.toContain("Outer opening");
    expect(container.textContent).toContain("witness passage.");
    void lengths;
    unmount();
  });

  it("renders whole containers untouched for a block-aligned window", () => {
    const { container, unmount } = render(
      <ArticleBody article={fixture} blockWindow={{ startBlock: 1, endBlock: 2 }} />,
    );
    // Whole-range projections return the source block: the full list, with
    // the fixture's original start and every item.
    const list = container.querySelector("ol");
    expect(list).toHaveAttribute("start", "5");
    expect(container.querySelectorAll("ol > li")).toHaveLength(8);
    unmount();
  });
});
