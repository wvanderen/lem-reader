// tests/component/BlockRenderer.test.tsx
// Per-kind native-element assertions for the recursive semantic renderer
// (DOC-02 reading order, DOC-06 unsupported disclosure). Queries use role /
// visible text / container.querySelector only — RTL convention. jsdom is NOT
// authoritative for layout, but native-element tag assertions ARE valid here
// (the renderer's contract is "emit native element X for block kind Y").
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockView, ArticleBody } from "../../src/content/render/BlockRenderer";
import type { Block, CanonicalArticle } from "../../src/content/types";

// ── Minimal block builders (typed against the frozen schema from Plan 01) ───

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, text: string): Block => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const blockquote = (children: Block[]): Block => ({
  kind: "blockquote",
  children,
});

const bulletedList = (items: string[]): Block => ({
  kind: "bulleted-list",
  items: items.map((text) => ({ content: [paragraph(text)] })),
});

const numberedList = (items: string[], start = 1): Block => ({
  kind: "numbered-list",
  start,
  items: items.map((text) => ({ content: [paragraph(text)] })),
});

const figure = (alt: string, src: string, caption?: string): Block => ({
  kind: "figure",
  alt,
  src,
  caption: caption ? [{ text: caption, marks: [] }] : [],
});

const codeBlock = (source: string, language?: string): Block => ({
  kind: "code-block",
  source,
  ...(language ? { language } : {}),
});

const footnoteRef = (n: number, marker: string): Block => ({
  kind: "footnote-reference",
  footnoteId: `fn-${n}`,
  marker,
});

const unsupported = (plainDescription: string, originalKind = "embedded-video"): Block => ({
  kind: "unsupported",
  originalKind,
  plainDescription,
});

const article = (blocks: Block[], footnotes: CanonicalArticle["footnotes"] = []): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes,
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("BlockView — per-kind native element (DOC-02)", () => {
  it("renders a level-1 heading as <h1>", () => {
    const { container } = render(<BlockView block={heading(1, "Title")} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
    expect(container.querySelector("h1")).not.toBeNull();
  });

  it("renders a level-3 heading as <h3>", () => {
    const { container } = render(<BlockView block={heading(3, "Subsection")} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Subsection");
    expect(container.querySelector("h3")).not.toBeNull();
  });

  it("renders a paragraph as <p>", () => {
    const { container } = render(<BlockView block={paragraph("Body text.")} />);
    expect(container.querySelector("p")).not.toBeNull();
    expect(container.querySelector("p")).toHaveTextContent("Body text.");
  });

  it("renders a blockquote as <blockquote>", () => {
    const { container } = render(
      <BlockView block={blockquote([paragraph("Quoted.")])} />,
    );
    const bq = container.querySelector("blockquote");
    expect(bq).not.toBeNull();
    expect(bq?.querySelector("p")).toHaveTextContent("Quoted.");
  });

  it("renders a bulleted-list as <ul> with <li> children", () => {
    const { container } = render(<BlockView block={bulletedList(["one", "two"])} />);
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    const items = ul?.querySelectorAll("li");
    expect(items?.length).toBe(2);
    expect(ul).toHaveTextContent("one");
    expect(ul).toHaveTextContent("two");
  });

  it("renders a numbered-list as <ol> with a matching start attribute", () => {
    const { container } = render(<BlockView block={numberedList(["a", "b"], 3)} />);
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    expect(ol?.getAttribute("start")).toBe("3");
    expect(ol?.querySelectorAll("li").length).toBe(2);
  });

  it("renders a figure with an <img alt> and <figcaption>", () => {
    const { container } = render(
      <BlockView block={figure("alt text", "https://example.com/i.png", "A caption")} />,
    );
    const fig = container.querySelector("figure");
    expect(fig).not.toBeNull();
    const img = fig?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("alt text");
    expect(img?.getAttribute("src")).toBe("https://example.com/i.png");
    expect(fig?.querySelector("figcaption")).toHaveTextContent("A caption");
  });

  it("renders a figure without a figcaption when caption is empty", () => {
    const { container } = render(
      <BlockView block={figure("alt", "https://example.com/i.png")} />,
    );
    expect(container.querySelector("figure")).not.toBeNull();
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("renders a code-block as <pre><code> with verbatim source (Pitfall 6)", () => {
    const source = 'const x = "hi";\nconsole.log(x);';
    const { container } = render(<BlockView block={codeBlock(source, "ts")} />);
    const code = container.querySelector("pre > code");
    expect(code).not.toBeNull();
    // Read raw textContent — toHaveTextContent normalizes whitespace and would
    // hide verbatim-preservation regressions (Pitfall 2 / D-05 code-block rule).
    expect(code?.textContent).toBe(source);
  });

  it("renders a footnote-reference as <sup><a id=fn-ref-N href=#fn-N> (Pitfall 4 fix)", () => {
    const { container } = render(<BlockView block={footnoteRef(1, "[1]")} />);
    const anchor = container.querySelector("sup > a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("id")).toBe("fn-ref-1");
    expect(anchor?.getAttribute("href")).toBe("#fn-1");
    expect(anchor).toHaveTextContent("[1]");
  });

  it("renders an unsupported block as an inline <details> disclosure (DOC-06)", () => {
    render(<BlockView block={unsupported("An embedded video near the third section")} />);
    // <details> exposes the implicit "group" role.
    expect(screen.getByRole("group")).not.toBeNull();
    expect(
      screen.getByText(/Some content from the original article isn't supported yet/),
    ).not.toBeNull();
    expect(screen.getByText("An embedded video near the third section")).not.toBeNull();
  });
});

describe("ArticleBody — footnotes region + reading order (DOC-02)", () => {
  it("renders a Footnotes region when the article has footnotes", () => {
    render(
      <ArticleBody
        article={article([paragraph("Body.")], [
          { id: "fn-1", content: [{ text: "A footnote body.", marks: [] }] },
        ])}
      />,
    );
    const region = screen.getByRole("region", { name: "Footnotes" });
    expect(region).not.toBeNull();
    const li = region.querySelector("ol > li#fn-1");
    expect(li).not.toBeNull();
    expect(li).toHaveTextContent("A footnote body.");
  });

  it("does NOT render a Footnotes region when the article has no footnotes", () => {
    render(<ArticleBody article={article([paragraph("Body.")])} />);
    expect(screen.queryByRole("region", { name: "Footnotes" })).toBeNull();
  });

  it("renders blocks in array order (DOM reading order == document order)", () => {
    const { container } = render(
      <ArticleBody
        article={article([heading(2, "First"), paragraph("Second"), blockquote([paragraph("Third")])])}
      />,
    );
    // The first three block-level children of the rendered fragment, in DOM
    // order, should be h2, p, blockquote.
    const topLevel = Array.from(container.children);
    expect(topLevel[0]?.tagName.toLowerCase()).toBe("h2");
    expect(topLevel[1]?.tagName.toLowerCase()).toBe("p");
    expect(topLevel[2]?.tagName.toLowerCase()).toBe("blockquote");
  });
});
