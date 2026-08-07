// tests/unit/annotations/highlight-overlay-render.test.tsx
// Phase 5 Plan 05-02 Task 2 — component test for the <mark> overlay rendering.
//
// Semantic-only (React Testing Library, jsdom — NO layout assertions). Proves:
//   1. A seeded highlight renders a <mark class="highlight"> with the right
//      data-highlight-id, tabindex=0, aria-haspopup="dialog", and an
//      aria-label starting with "Highlight" (D5-15, UI-SPEC §Interaction 26).
//   2. A block with no highlights renders zero <mark> elements.
//   3. A link inside a highlighted range remains an <a> (D5-07 — a link stays
//      active inside a highlight; the Inline mark-wrapping loop is reused
//      unchanged inside the highlighted slice).
//   4. The .has-note modifier renders when the highlight has a note (D5-14).
//
// Layout truth (cross-fragment slicing D5-16, forced-colors restyle D5-15,
// real-browser selection capture D5-08) is Plan 05-05's Playwright suite.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import type { Block, CanonicalArticle } from "../../../src/content/types";

// ── Article fixture helpers ─────────────────────────────────────────────────

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

/** A paragraph with a link inside the highlighted range (D5-07 proof). */
const paragraphWithLink = (): Block => ({
  kind: "paragraph",
  content: [
    { text: "Before link ", marks: [] },
    {
      text: "link text",
      marks: [{ type: "link", href: "https://example.com/target" }],
    },
    { text: " after link.", marks: [] },
  ],
});

const article = (blocks: Block[]): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
});

/** Build an ArticleBodyHighlight at the given D-05 position. */
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

describe("highlight overlay rendering — <mark> into ArticleBody (D5-15)", () => {
  it("renders a <mark class='highlight'> for a seeded highlight", () => {
    // Article: "Hello world." (block 0, 12 graphemes) + separator + "Second
    // paragraph." (block 1). Highlight "world" at graphemes 6-11.
    const art = article([
      paragraph("Hello world."),
      paragraph("Second paragraph."),
    ]);
    const hl = makeEntry("hl-1", 6, 11);
    const { container } = render(
      <ArticleBody article={art} highlights={[hl]} />,
    );

    const mark = container.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl-1");
    expect(mark?.getAttribute("id")).toBe("hl-hl-1");
    expect(mark?.getAttribute("tabindex")).toBe("0");
    expect(mark?.getAttribute("aria-haspopup")).toBe("dialog");
    // aria-label starts with "Highlight" (UI-SPEC §Copywriting).
    expect(mark?.getAttribute("aria-label")?.startsWith("Highlight")).toBe(true);
    // The highlighted text is "world".
    expect(mark?.textContent).toContain("world");
  });

  it("renders zero <mark> when no highlights are provided", () => {
    const art = article([
      paragraph("Hello world."),
      paragraph("Second paragraph."),
    ]);
    const { container } = render(<ArticleBody article={art} highlights={[]} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(0);
  });

  it("renders zero <mark> when highlights prop is absent (legacy path)", () => {
    // Without a HighlightOverlayProvider, useOptionalHighlightOverlay returns
    // null → effectiveHighlights = [] → no marks. Byte-unchanged from pre-
    // Phase-5 behavior (the existing BlockRenderer component tests regress
    // nothing).
    const art = article([paragraph("Hello world.")]);
    const { container } = render(<ArticleBody article={art} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(0);
  });

  it("preserves a link inside a highlighted range (D5-07 — link stays active)", () => {
    // Paragraph: "Before link [link text] after link."
    // Highlight the entire block so the link falls inside the range.
    const block = paragraphWithLink();
    const art = article([block]);
    // The block normalized text is "Before link link text after link." —
    // 33 graphemes. Highlight [0, 33) covers everything.
    const hl = makeEntry("hl-link", 0, 33);
    const { container } = render(
      <ArticleBody article={art} highlights={[hl]} />,
    );

    const mark = container.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    // The <a> must still exist INSIDE the <mark> (D5-07 — a link stays active
    // inside a highlight; the Inline mark-wrapping loop is reused unchanged).
    const anchor = mark?.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("https://example.com/target");
    expect(anchor?.textContent).toContain("link text");
  });

  it("renders the .has-note modifier when the highlight has a note (D5-14)", () => {
    const art = article([paragraph("Hello world.")]);
    const hl = makeEntry("hl-note", 0, 5, true);
    const { container } = render(
      <ArticleBody article={art} highlights={[hl]} />,
    );

    const mark = container.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark?.classList.contains("has-note")).toBe(true);
    // aria-label includes "with note" (UI-SPEC §Copywriting).
    expect(mark?.getAttribute("aria-label")?.includes("with note")).toBe(true);
  });
});
