// Issue #235 — component contracts for footnote rendering in the windowed
// paginated path:
//
//   1. ArticleBody's MEASUREMENT projection (blockWindow with footnote
//      fields) renders the scope's canonical rows as ID-LESS
//      <li data-footnote-index> elements — measurable, chrome-free, and
//      unable to duplicate the visible page's fn-N ids. The windowed
//      projection's footnote-reference anchors also drop their fn-ref-N
//      ids/hrefs (single exposed identifier set — criterion 6).
//   2. PageFragmentView renders footnote ENTRIES as the same accessible
//      anatomy the scrolling body uses — section[aria-label="Footnotes"] >
//      ol > li#fn-N with the ↩ back-link to #fn-ref-N — with sliced runs at
//      the entry's intra-row range and NO data-block-index (capture
//      eligibility unchanged: footnote bodies stay unmarkable).
//
// jsdom-safe: geometry is never asserted; DOM shape, ids, and text are.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../src/content/render/BlockRenderer";
import { PageFragmentView } from "../../src/pagination/fragmentRenderer";
import type { Block, CanonicalArticle } from "../../src/content/types";
import type { PageFragment } from "../../src/pagination/types";
import { articleGraphemeIndex, footnoteRows, inlineText } from "../../src/content/normalizeText";

const footnotedArticle = (): CanonicalArticle => ({
  id: "footnote-render",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Footnote rendering",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "footnote-render-v1",
  },
  blocks: [
    {
      kind: "paragraph",
      content: [{ text: "A claim worth citing.[1]", marks: [] }],
    },
    { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
  ],
  footnotes: [
    {
      id: "fn-1",
      content: [
        { text: "The ledger is ", marks: [] },
        { text: "archived", marks: [{ type: "em" }] },
        {
          text: " in the north wing, with a long enough body to slice across a page boundary when the time comes.",
          marks: [],
        },
      ],
    },
  ],
});

describe("ArticleBody — windowed footnote measurement projection", () => {
  it("renders the scope's footnote rows as id-less data-footnote-index list items", () => {
    const article = footnotedArticle();
    const { container } = render(
      <ArticleBody
        article={article}
        highlights={[]}
        blockWindow={{
          startBlock: article.blocks.length,
          endBlock: article.blocks.length,
          startFootnote: 0,
          endFootnote: 1,
        }}
      />,
    );
    const section = container.querySelector('section[aria-label="Footnotes"]');
    expect(section).not.toBeNull();
    const items = container.querySelectorAll("li[data-footnote-index]");
    expect(items).toHaveLength(1);
    // No ids, no anchors: the measurement tree cannot duplicate the visible
    // page's identifiers or add targets to them.
    expect(items[0]!.id).toBe("");
    expect(items[0]!.querySelector("a")).toBeNull();
    // The rendered text is the row's canonical text — exactly what the
    // measurer normalizes and the engine splits against.
    expect(items[0]!.textContent).toBe(inlineText(article.footnotes[0]!.content));
  });

  it("keeps the scrolling footnotes section untouched (ids + back-links)", () => {
    const article = footnotedArticle();
    const { container } = render(<ArticleBody article={article} highlights={[]} />);
    const li = container.querySelector('section[aria-label="Footnotes"] li');
    expect(li?.id).toBe("fn-1");
    expect(container.querySelector('a[href="#fn-ref-1"]')).not.toBeNull();
    expect(container.querySelector("li[data-footnote-index]")).toBeNull();
  });

  it.each(["blockquote", "bulleted-list", "numbered-list"] as const)(
    "strips reference identifiers recursively inside %s measurement rows",
    (kind) => {
      const article = footnotedArticle();
      const children: Block[] = [
        article.blocks[0]!,
        {
          kind: "blockquote",
          children: [article.blocks[1]!],
        },
      ];
      const containerBlock: Block =
        kind === "blockquote"
          ? { kind, children }
          : kind === "numbered-list"
            ? { kind, start: 3, items: [{ content: children }] }
            : { kind, items: [{ content: children }] };
      const nested = { ...article, blocks: [containerBlock] };
      const hidden = render(<ArticleBody article={nested} highlights={[]} measurementProjection />);
      expect(hidden.container.querySelector('[id^="fn-ref-"]')).toBeNull();
      expect(hidden.container.querySelector('a[href="#fn-1"]')).toBeNull();
      expect(hidden.container.querySelector("sup")?.textContent).toBe("[1]");
      hidden.unmount();

      const visible = render(<ArticleBody article={nested} highlights={[]} />);
      expect(visible.container.querySelectorAll("#fn-ref-1")).toHaveLength(1);
    },
  );

  it("drops duplicate anchor ids in the measurement projection only", () => {
    const article = footnotedArticle();
    const windowed = { startBlock: 0, endBlock: article.blocks.length };
    const { container } = render(
      <ArticleBody
        article={article}
        highlights={[]}
        blockWindow={windowed}
        measurementProjection
      />,
    );
    // The visible page is the ONLY place fn-ref-1 may exist.
    expect(container.querySelector("#fn-ref-1")).toBeNull();
    // The marker text still renders — it is the block's canonical stream.
    const sup = container.querySelector("sup");
    expect(sup?.textContent).toBe("[1]");
  });
});

describe("PageFragmentView — footnote entries", () => {
  const fragment = (article: CanonicalArticle): PageFragment => {
    const row = footnoteRows(article)[0]!;
    return {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [
        {
          blockIndex: article.blocks.length,
          footnoteIndex: row.index,
          startGrapheme: 0,
          endGrapheme: row.length,
        },
      ],
    };
  };

  it("renders the scrolling anatomy — ids, back-links, one accessible region", () => {
    const article = footnotedArticle();
    const { container } = render(
      <PageFragmentView fragment={fragment(article)} pageIndex={0} article={article} lang="en" />,
    );
    const li = container.querySelector('section[aria-label="Footnotes"] li#fn-1');
    expect(li).not.toBeNull();
    expect(li?.getAttribute("tabindex")).toBe("-1");
    const back = li?.querySelector('a[href="#fn-ref-1"]');
    expect(back?.getAttribute("aria-label")).toBe("Return to reference 1");
    // Capture ineligibility: footnote rows never carry the capture binding.
    expect(li?.hasAttribute("data-block-index")).toBe(false);
    expect(li?.getAttribute("data-footnote-index")).toBe("0");
    // The row's full canonical text renders through the content wrapper.
    expect(li?.querySelector("[data-footnote-content]")?.textContent).toBe(
      inlineText(article.footnotes[0]!.content),
    );
  });

  it("renders only the entry's intra-row slice (PAGE-03 exactly-once)", () => {
    const article = footnotedArticle();
    const row = footnoteRows(article)[0]!;
    const text = articleGraphemeIndex(article).clusters;
    const half = Math.floor(row.length / 2);
    const firstHalf: PageFragment = {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [
        {
          blockIndex: article.blocks.length,
          footnoteIndex: 0,
          startGrapheme: 0,
          endGrapheme: half,
        },
      ],
    };
    const secondHalf: PageFragment = {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [
        {
          blockIndex: article.blocks.length,
          footnoteIndex: 0,
          startGrapheme: half,
          endGrapheme: row.length,
        },
      ],
    };
    const a = render(
      <PageFragmentView fragment={firstHalf} pageIndex={0} article={article} lang="en" />,
    );
    const b = render(
      <PageFragmentView fragment={secondHalf} pageIndex={0} article={article} lang="en" />,
    ).container;
    const aText = a.container.querySelector("[data-footnote-content]")!.textContent ?? "";
    const bText = b.querySelector("[data-footnote-content]")!.textContent ?? "";
    // Both slices concatenate to the canonical row text (edge separators
    // render in no run piece); neither duplicates the other's span.
    expect((aText + bText).replace(/\s+/g, " ").trim()).toBe(
      text
        .slice(row.start, row.start + row.length)
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    );
    a.unmount();
  });
});
