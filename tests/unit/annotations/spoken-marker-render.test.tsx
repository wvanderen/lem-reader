// tests/unit/annotations/spoken-marker-render.test.tsx
// Issue #42 — the synthetic spoken-word marker's rendering contract, in BOTH
// render twins (RTL/jsdom — semantic glue only; the real-browser follow
// behaviors are the Playwright suite).
//
// What is pinned here:
//   1. The spoken range renders through the SAME unified slicer plumbing as
//      annotation highlights, but branches into a DISTINCT anatomy:
//      <mark class="spoken-word" aria-hidden="true"> — no tabIndex, no
//      aria-label, no data-highlight-id, no DOM id. Per-word updates never
//      enter the accessibility tree; focus never moves; the annotation
//      popover can never target it.
//   2. Annotation marks in the SAME render are untouched (focusable,
//      labelled, data-highlight-id intact).
//   3. The paginated twin translates the article-global spoken range into
//      entry-local coordinates like any highlight (split-block behavior).
//   4. The code-block case carries the same aria-hidden anatomy.
//   5. Null/absent spokenRange renders byte-unchanged (regression guard).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import { PageFragmentView } from "../../../src/pagination/fragmentRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import type { PageFragment } from "../../../src/pagination/types";
import type { GraphemeRange } from "../../../src/annotations/unifiedHighlightSlicer";

afterEach(cleanup);

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
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

const annotation = (id: string, start: number, end: number): ArticleBodyHighlight => ({
  id,
  position: { start, end },
  hasNote: false,
  status: "confident",
});

// "Spoken word here." — ASCII → 1 grapheme per char; "word" at [7, 11).
const TEXT = "Spoken word here.";
const WORD: GraphemeRange = { start: 7, end: 11 };

describe("spoken-word marker — scrolling twin (ArticleBody)", () => {
  it("renders an aria-hidden, non-focusable mark; annotation marks stay untouched", () => {
    const art = article([paragraph(TEXT)]);
    const { container } = render(
      <ArticleBody
        article={art}
        highlights={[annotation("hl-1", 0, 6)]}
        spokenRange={WORD}
      />,
    );

    const spoken = container.querySelector("mark.spoken-word");
    expect(spoken).not.toBeNull();
    expect(spoken!.getAttribute("aria-hidden")).toBe("true");
    expect(spoken!.getAttribute("tabindex")).toBeNull();
    expect(spoken!.getAttribute("aria-label")).toBeNull();
    expect(spoken!.getAttribute("aria-haspopup")).toBeNull();
    expect(spoken!.getAttribute("data-highlight-id")).toBeNull();
    expect(spoken!.getAttribute("id")).toBeNull();
    // Boundary whitespace rides with the piece (the splitParagraphRuns
    // philosophy) — the mark's norm content is exactly "word".
    expect(spoken!.textContent!.trim()).toBe("word");

    // The annotation mark in the SAME render keeps the full anatomy.
    const annotationMark = container.querySelector("mark.highlight");
    expect(annotationMark).not.toBeNull();
    expect(annotationMark!.getAttribute("data-highlight-id")).toBe("hl-1");
    expect(annotationMark!.getAttribute("tabindex")).toBe("0");
    expect(annotationMark!.getAttribute("aria-hidden")).toBeNull();
  });

  it("spoken range riding the context path (no explicit highlights) also renders", () => {
    const art = article([paragraph(TEXT)]);
    const { container } = render(<ArticleBody article={art} spokenRange={WORD} />);
    const spoken = container.querySelector("mark.spoken-word");
    expect(spoken).not.toBeNull();
    expect(spoken!.textContent).toBe("word");
  });

  it("absent/null spokenRange renders no spoken mark (regression guard)", () => {
    const art = article([paragraph(TEXT)]);
    const { container } = render(<ArticleBody article={art} spokenRange={null} />);
    expect(container.querySelector("mark.spoken-word")).toBeNull();
    const plain = render(<ArticleBody article={art} />);
    expect(plain.container.querySelector("mark.spoken-word")).toBeNull();
  });
});

describe("spoken-word marker — paginated twin (PageFragmentView)", () => {
  const fragment = (start: number, end: number): PageFragment => ({
    schemaVersion: 1,
    pageIndex: 0,
    blocks: [{ blockIndex: 0, startGrapheme: start, endGrapheme: end }],
  });

  it("translates the article-global spoken range into the entry-local mark", () => {
    const art = article([paragraph(TEXT)]);
    // Entry covers the second half of the block [6, 17); the spoken word
    // [7, 11) intersects it.
    const { container } = render(
      <PageFragmentView
        fragment={fragment(6, 17)}
        pageIndex={0}
        article={art}
        lang="en"
        spokenRange={WORD}
      />,
    );
    const spoken = container.querySelector("mark.spoken-word");
    expect(spoken).not.toBeNull();
    expect(spoken!.getAttribute("aria-hidden")).toBe("true");
    expect(spoken!.getAttribute("tabindex")).toBeNull();
    expect(spoken!.textContent!.trim()).toBe("word");
  });

  it("a spoken range crossing the page seam renders on EACH containing fragment", () => {
    const art = article([paragraph(TEXT)]);
    const first = render(
      <PageFragmentView
        fragment={fragment(0, 9)}
        pageIndex={0}
        article={art}
        lang="en"
        spokenRange={WORD}
      />,
    );
    // The seam at grapheme 9 splits "word" [7, 11): "wo" on page 1.
    expect(first.container.querySelector("mark.spoken-word")?.textContent).toBe("wo");
    cleanup();
    const second = render(
      <PageFragmentView
        fragment={fragment(9, 17)}
        pageIndex={1}
        article={art}
        lang="en"
        spokenRange={WORD}
      />,
    );
    // …and "rd" on page 2 (no silent gap at the page turn).
    expect(second.container.querySelector("mark.spoken-word")?.textContent).toBe("rd");
  });

  it("no spoken mark when the range lies outside the mounted page", () => {
    const art = article([paragraph(TEXT), paragraph("Second block text.")]);
    const { container } = render(
      <PageFragmentView
        fragment={fragment(0, 17)}
        pageIndex={0}
        article={art}
        lang="en"
        spokenRange={{ start: 20, end: 24 }}
      />,
    );
    expect(container.querySelector("mark.spoken-word")).toBeNull();
  });
});

describe("spoken-word marker — code-block case", () => {
  it("renders the aria-hidden anatomy inside <pre><code>", () => {
    const code: Block = { kind: "code-block", source: "const x = 1;\nconst y = 2;" };
    const art = article([code]);
    // "y" on line 2 — source grapheme 19 (verbatim code: whitespace IS the
    // stream) → article-global [19, 20).
    const { container } = render(
      <ArticleBody article={art} spokenRange={{ start: 19, end: 20 }} />,
    );
    const spoken = container.querySelectorAll("mark.spoken-word");
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(spoken[0]!.getAttribute("tabindex")).toBeNull();
    expect(spoken[0]!.textContent).toBe("y");
  });
});
