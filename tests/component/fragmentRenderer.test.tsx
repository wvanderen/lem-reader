// tests/component/fragmentRenderer.test.tsx
// Component tests for the PageFragmentView renderer (D4-01 intra-block
// paragraph slicing — the load-bearing assertion for PAGE-03 exactly-once /
// no-duplication). The renderer MUST call splitParagraphRuns when a fragment
// carries a sub-block grapheme range and render only the intra-block run slice
// through BlockView. BOTH halves of a split inherit boundary-run marks
// verbatim (Pitfall 4 — a link run split mid-text becomes two link runs with
// the same href).
//
// The test fixture is a paragraph with 3 runs totaling exactly 100 graphemes
// (40 + 20 + 40), with the middle run carrying a link mark. Two fragments
// reference the same blockIndex with non-overlapping ranges [0,50) and
// [50,100); the split point (50) falls inside the link run, so BOTH slices
// must render an <a> with the same href. Their concatenated textContent
// equals the full paragraph text; they share ZERO characters of meaningful
// overlap (verified by sliding a 5-char window of A across B).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PageFragmentView } from "../../src/pagination/fragmentRenderer";
import type { CanonicalArticle } from "../../src/content/types";
import type { PageFragment } from "../../src/pagination/types";

const LINK_HREF = "https://example.com/passage";

/**
 * Fixture: 3 runs totaling 100 graphemes (40 + 20 + 40), middle run carries a
 * link mark. The split point 50 falls inside the link run (40 + 10 of 20).
 */
const articleWithLinkedParagraph = (): CanonicalArticle => ({
  id: "stub-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/posts/stub",
    title: "Stub Article",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    {
      kind: "paragraph",
      content: [
        { text: "A".repeat(40), marks: [] },
        {
          // 20-char link text with distinct first/second halves so a split
          // at the midpoint (offset 10 inside the run) yields two slices
          // whose rendered text does NOT overlap.
          text: "abcdefghij0123456789",
          marks: [{ type: "link", href: LINK_HREF }],
        },
        { text: "C".repeat(40), marks: [] },
      ],
    },
  ],
  footnotes: [],
});

const expectedFullText =
  "A".repeat(40) + "abcdefghij0123456789" + "C".repeat(40);

const fragmentFirstHalf = (): PageFragment => ({
  schemaVersion: 1,
  pageIndex: 0,
  blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 50 }],
});

const fragmentSecondHalf = (): PageFragment => ({
  schemaVersion: 1,
  pageIndex: 1,
  blocks: [{ blockIndex: 0, startGrapheme: 50, endGrapheme: 100 }],
});

const fragmentWhole = (): PageFragment => ({
  schemaVersion: 1,
  pageIndex: 0,
  blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 100 }],
});

/**
 * Assert no substring of length >= minLen in `a` appears in `b`. Used to prove
 * the two page fragments share ZERO characters of meaningful overlap (PAGE-03
 * no-duplication). The link run is split mid-text, so each half renders the
 * link mark; both <a> elements carry the same href (Pitfall 4) — that mark
 * inheritance is desired, not an overlap.
 */
function findOverlap(a: string, b: string, minLen = 5): string | null {
  for (let i = 0; i <= a.length - minLen; i++) {
    const sub = a.slice(i, i + minLen);
    if (b.includes(sub)) return sub;
  }
  return null;
}

describe("PageFragmentView — D4-01 intra-block paragraph slicing", () => {
  it("renders a section.page-fragment via BlockView (reuses, does not fork)", () => {
    const { container } = render(
      <PageFragmentView
        fragment={fragmentWhole()}
        pageIndex={0}
        article={articleWithLinkedParagraph()}
        lang="en"
      />,
    );
    const section = container.querySelector("section.page-fragment");
    expect(section).not.toBeNull();
    // BlockView renders paragraphs as <p> (DOC-02) — not a parallel tag.
    expect(section?.querySelector("p")).not.toBeNull();
  });

  it("carries aria-label=`Page {N+1}` derived from pageIndex", () => {
    const { container } = render(
      <PageFragmentView
        fragment={fragmentWhole()}
        pageIndex={3}
        article={articleWithLinkedParagraph()}
        lang="en"
      />,
    );
    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe(
      "Page 4",
    );
  });

  it("the concatenated text of the two halves equals the full paragraph text (PAGE-03 exactly-once)", () => {
    const article = articleWithLinkedParagraph();
    const { container: containerA } = render(
      <PageFragmentView
        fragment={fragmentFirstHalf()}
        pageIndex={0}
        article={article}
        lang="en"
      />,
    );
    const { container: containerB } = render(
      <PageFragmentView
        fragment={fragmentSecondHalf()}
        pageIndex={1}
        article={article}
        lang="en"
      />,
    );
    const textA = containerA.querySelector(".page-fragment")?.textContent ?? "";
    const textB = containerB.querySelector(".page-fragment")?.textContent ?? "";
    expect(textA + textB).toBe(expectedFullText);
  });

  it("the two halves share ZERO characters of meaningful overlap (PAGE-03 no-duplication)", () => {
    const article = articleWithLinkedParagraph();
    const { container: containerA } = render(
      <PageFragmentView
        fragment={fragmentFirstHalf()}
        pageIndex={0}
        article={article}
        lang="en"
      />,
    );
    const { container: containerB } = render(
      <PageFragmentView
        fragment={fragmentSecondHalf()}
        pageIndex={1}
        article={article}
        lang="en"
      />,
    );
    const textA = containerA.querySelector(".page-fragment")?.textContent ?? "";
    const textB = containerB.querySelector(".page-fragment")?.textContent ?? "";
    const overlap = findOverlap(textA, textB, 5);
    expect(overlap).toBeNull();
  });

  it("BOTH halves render an <a> carrying the same href when the split lands inside a link run (Pitfall 4)", () => {
    const article = articleWithLinkedParagraph();
    const { container: containerA } = render(
      <PageFragmentView
        fragment={fragmentFirstHalf()}
        pageIndex={0}
        article={article}
        lang="en"
      />,
    );
    const { container: containerB } = render(
      <PageFragmentView
        fragment={fragmentSecondHalf()}
        pageIndex={1}
        article={article}
        lang="en"
      />,
    );
    const linkA = containerA.querySelector(".page-fragment a");
    const linkB = containerB.querySelector(".page-fragment a");
    expect(linkA).not.toBeNull();
    expect(linkB).not.toBeNull();
    expect(linkA?.getAttribute("href")).toBe(LINK_HREF);
    expect(linkB?.getAttribute("href")).toBe(LINK_HREF);
  });

  it("a whole-block fragment (start=0, end=blockLen) renders the identical text to the two halves concatenated", () => {
    const article = articleWithLinkedParagraph();
    const { container } = render(
      <PageFragmentView
        fragment={fragmentWhole()}
        pageIndex={0}
        article={article}
        lang="en"
      />,
    );
    const text = container.querySelector(".page-fragment")?.textContent ?? "";
    expect(text).toBe(expectedFullText);
    // The whole-block fragment renders exactly one <a> (the full link run).
    const links = container.querySelectorAll(".page-fragment a");
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("href")).toBe(LINK_HREF);
  });

  it("atomic kinds (heading) are rendered whole via BlockView even when the fragment entry carries a sub-range (D4-02)", () => {
    // Defensive: the engine never emits sub-ranges for atomic kinds, but the
    // renderer short-circuits them anyway. Construct a fixture where the
    // fragment entry pretends to slice a heading — the renderer should
    // render the WHOLE heading, not attempt to slice it.
    const article: CanonicalArticle = {
      id: "stub",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/x",
        title: "Stub",
        retrievedAt: "2026-08-06T00:00:00Z",
        originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      blocks: [
        {
          kind: "heading",
          level: 2,
          content: [{ text: "Whole heading text", marks: [] }],
        },
      ],
      footnotes: [],
    };
    const fragment: PageFragment = {
      schemaVersion: 1,
      pageIndex: 0,
      blocks: [{ blockIndex: 0, startGrapheme: 5, endGrapheme: 10 }],
    };
    const { container } = render(
      <PageFragmentView fragment={fragment} pageIndex={0} article={article} lang="en" />,
    );
    // The whole heading is rendered — NOT a 5-grapheme slice.
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe("Whole heading text");
  });
});
