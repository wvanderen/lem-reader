// tests/unit/annotations/blockquote-highlight-render.test.tsx
// Phase 5 Plan 05-07 — RED test for the blockquote inline-<mark> gap
// (UAT Test 11 MAJOR: blockquote highlight renders no inline mark).
//
// Closes the diagnosed gap (.planning/debug/blockquote-highlight-no-inline-mark.md):
// a kind-based gate in BOTH render paths (BlockRenderer.ArticleBody +
// fragmentRenderer.PageFragmentView) limited inline <mark> overlay
// computation to paragraph + heading. Blockquote is a CONTAINER whose text
// lives in block.children; neither path computed per-child slices, and the
// blockquote BlockView recursion did not forward slices to children. This
// test proves the gap by asserting a mark RENDERS inside the blockquote in
// BOTH render paths (scrolling whole + paginated whole + paginated sliced),
// plus a zero-marks regression guard for the legacy no-highlights path.
//
// Semantic-only (React Testing Library, jsdom — NO layout assertions). The
// real-browser mark-rendering proof is Plan 05-07 Task 3's Playwright suite.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import { PageFragmentView } from "../../../src/pagination/fragmentRenderer";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import type { PageFragment } from "../../../src/pagination/types";

// ── Article fixture helpers (verbatim from highlight-overlay-render.test.tsx) ─

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

/** A blockquote wrapping a single child paragraph (the Thiel-quote shape). */
const blockquote = (children: Block[]): Block => ({
  kind: "blockquote",
  children,
});

const article = (blocks: Block[]): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
});

/** Build an ArticleBodyHighlight at the given D-05 article-global position. */
function makeEntry(
  id: string,
  start: number,
  end: number,
  hasNote = false,
): ArticleBodyHighlight {
  return {
    id,
    position: { start, end },
    hasNote,
    status: "confident",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("blockquote highlight rendering — inline <mark> in BOTH render paths (05-07)", () => {
  // Child paragraph text used by the scrolling + paginated whole-entry cases.
  // "Quoted passage text here." = 25 ASCII graphemes; "passage" sits at
  // article-global [7, 14) (block 0 starts at offset 0; the blockquote's
  // blockNormalizedText is its single child's text with no separator).
  const childText = "Quoted passage text here.";
  // splittingBlockGraphemeLength(blockquote) === splittingBlockGraphemeLength(child) === 25.
  const blockquoteLen = 25;

  it("SCROLLING: renders a <mark class='highlight'> inside the blockquote for a seeded highlight", () => {
    const art = article([blockquote([paragraph(childText)])]);
    // Highlight "passage" at article-global [7, 14).
    const hl = makeEntry("hl-scroll", 7, 14);
    const { container } = render(
      <ArticleBody article={art} highlights={[hl]} />,
    );

    // The mark must render INSIDE the blockquote (the diagnosed gap: today
    // InlineList receives no slices for the blockquote's child paragraph).
    const blockquoteEl = container.querySelector("blockquote");
    expect(blockquoteEl).not.toBeNull();
    const mark = blockquoteEl?.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl-scroll");
    expect(mark?.getAttribute("id")).toBe("hl-hl-scroll");
    expect(mark?.textContent).toContain("passage");
  });

  it("SCROLLING: renders zero <mark> when no highlights are provided (byte-unchanged legacy path)", () => {
    const art = article([blockquote([paragraph(childText)])]);
    const { container } = render(<ArticleBody article={art} highlights={[]} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(0);
  });

  it("PAGINATED whole entry: renders a <mark class='highlight'> for a whole-blockquote fragment entry", () => {
    const art = article([blockquote([paragraph(childText)])]);
    // Whole-blockquote entry: startGrapheme 0, endGrapheme = block length (25).
    const fragment: PageFragment = {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: blockquoteLen }],
    };
    const hl = makeEntry("hl-page", 7, 14);
    const { container } = render(
      <PageFragmentView
        fragment={fragment}
        pageIndex={0}
        article={art}
        lang="en"
        highlights={[hl]}
      />,
    );

    const section = container.querySelector("section.page-fragment");
    expect(section).not.toBeNull();
    const mark = section?.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl-page");
    expect(mark?.textContent).toContain("passage");
  });

  it("PAGINATED sliced entry: renders a <mark class='highlight'> on the visible slice of a child-paragraph split", () => {
    // 50-grapheme child: "P"*10 + "SLICEHERE" + "Q"*31. "SLICEHERE" sits at
    // article-global [10, 19). The fragment entry carves [10, 40) — a sub-
    // range that still contains "SLICEHERE" — so the blockquote's child
    // paragraph is sliced and the mark must land on the visible slice only.
    const longChild = "P".repeat(10) + "SLICEHERE" + "Q".repeat(31);
    const art = article([blockquote([paragraph(longChild)])]);
    const fragment: PageFragment = {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [{ blockIndex: 0, startGrapheme: 10, endGrapheme: 40 }],
    };
    const hl = makeEntry("hl-sliced", 10, 19);
    const { container } = render(
      <PageFragmentView
        fragment={fragment}
        pageIndex={0}
        article={art}
        lang="en"
        highlights={[hl]}
      />,
    );

    const section = container.querySelector("section.page-fragment");
    expect(section).not.toBeNull();
    const mark = section?.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl-sliced");
    // The visible slice of "SLICEHERE" is fully inside the entry → mark wraps it.
    expect(mark?.textContent).toContain("SLICEHERE");
  });
});
