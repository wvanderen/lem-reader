// tests/unit/TocPanel.test.tsx
// Phase 18 Plan 18-02 Task 1 — RTL component suite for the non-modal TOC
// panel (ORNT-01 labeled contract, ORNT-04 semantic list, D18-01/12/13).
//
// Semantic component glue ONLY (React Testing Library, jsdom — the STACK
// rule: layout truth stays in Playwright, Plan 18-04). Proves:
//   1. The panel renders an h2 "Contents" title + a nav with aria-label
//      "Table of contents" (the ORNT-01 labeled contract).
//   2. The first entry is the synthetic "Top of article" link; duplicate
//      heading texts render as two identical-text links (D18-11).
//   3. Skipped levels (h2→h5) nest deeper via nested ul structure with NO
//      intermediate li (D18-10).
//   4. Exactly one entry carries aria-current with token "true" (never
//      "page"); with no body heading current the Top entry carries it
//      (D18-12).
//   5. The shared sectionSpy's current heading maps to its entry via
//      data-block-index (the h2-h6 selector parameterization).
//   6. A headingless article renders ONLY [Top] + the honest note
//      "This article has no headings." below the title (D18-13).
//   7. Entry activation (click AND Enter) calls onActivate with the entry
//      and preventDefaults the event (link semantics without router side
//      effects — Pitfall 4).
//   8. Escape routes through the panel element's hidePopover (popover
//      "manual" gets no native Esc — the only hand-rolled key handling).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import type { TocEntry } from "../../src/content/toc";
import { TocPanel } from "../../src/reader/TocPanel";

// ── Fixture helpers (toc.test.ts shape: Zod-at-the-boundary) ─────────────────

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "toc-panel-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/toc-panel",
    title: "TOC Panel Test",
    retrievedAt: "2026-08-30T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

const para = (text: string) => ({
  kind: "paragraph",
  content: [{ text }],
});

const heading = (level: number, text: string) => ({
  kind: "heading",
  level,
  content: [{ text }],
});

/** The default mount: a well-formed article, articleEl null (no spy), panel
 *  VISIBLE for role queries — jsdom 30 applies the UA popover rule
 *  ([popover] → display:none when not open) but does NOT implement
 *  showPopover/hidePopover, so the suite lifts the surface with an inline
 *  display override (inline beats UA in the cascade; test-only — the real
 *  open/close lifecycle is the parent seam + Playwright, Plan 18-04). */
function mountPanel(
  article: CanonicalArticle,
  overrides: Partial<Parameters<typeof TocPanel>[0]> = {},
) {
  const onActivate = vi.fn();
  const utils = render(
    <TocPanel
      article={article}
      articleEl={null}
      open={false}
      onActivate={onActivate}
      {...overrides}
    />,
  );
  const panel = utils.container.querySelector(".toc-panel") as HTMLElement;
  if (panel) panel.style.display = "block";
  return { onActivate, ...utils };
}

// ── 1 + 2: labeled contract + Top first + duplicates AS-IS ───────────────────

describe("TocPanel: labeling + entry honesty (ORNT-01, D18-09/11)", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      para("Intro paragraph."),
      heading(2, "Alpha section"),
      para("Body one."),
      heading(2, "Duplicate heading"),
      para("Body two."),
      heading(2, "Duplicate heading"),
      para("Body three."),
    ],
  });

  it("renders an h2 'Contents' title and a nav with aria-label 'Table of contents'", () => {
    mountPanel(article);
    expect(
      screen.getByRole("heading", { level: 2, name: "Contents" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Table of contents" }),
    ).toBeVisible();
  });

  it("renders the first entry as a 'Top of article' link", () => {
    mountPanel(article);
    const nav = screen.getByRole("navigation", { name: "Table of contents" });
    const links = within(nav).getAllByRole("link");
    expect(links[0]!.textContent).toBe("Top of article");
  });

  it("renders duplicate heading texts as two identical-text links (D18-11)", () => {
    mountPanel(article);
    const duplicates = screen.getAllByRole("link", {
      name: "Duplicate heading",
    });
    expect(duplicates).toHaveLength(2);
    // Identical text, no "(2 of 2)" suffixes, no parent prefixes.
    expect(duplicates[0]!.textContent).toBe("Duplicate heading");
    expect(duplicates[1]!.textContent).toBe("Duplicate heading");
  });
});

// ── 3: skipped levels nest deeper, no invented li (D18-10) ──────────────────

describe("TocPanel: skipped-level nesting (D18-10)", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      heading(2, "Outer"),
      para("Outer body."),
      heading(5, "Skipped deep heading"),
      para("Deep body."),
    ],
  });

  it("nests an h5-after-h2 skip inside a deeper nested ul with no intermediate li", () => {
    mountPanel(article);
    const outerLi = screen.getByRole("link", { name: "Outer" }).closest("li");
    expect(outerLi).not.toBeNull();
    // The h2's li opens exactly ONE child ul (the skip adds depth, never
    // invented intermediate entries — D18-10)…
    const nested = outerLi!.querySelector(":scope > ul");
    expect(nested).not.toBeNull();
    // …whose direct li children are exactly the h5 entry — no intermediates.
    const nestedLis = nested!.querySelectorAll(":scope > li");
    expect(nestedLis).toHaveLength(1);
    expect(nestedLis[0]!.textContent).toContain("Skipped deep heading");
    // The h5's li carries its true depth (2 — the indent hook): visibly
    // deeper than a direct h3 child (depth 1) would sit.
    const deepLi = screen
      .getByRole("link", { name: "Skipped deep heading" })
      .closest("li");
    expect(deepLi!.getAttribute("data-depth")).toBe("2");
    expect(deepLi!.closest("ul")).toBe(nested);
  });
});

// ── 4 + 5: aria-current discipline + spy mapping (D18-12) ───────────────────

describe("TocPanel: aria-current (D18-12)", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      para("Intro paragraph."),
      heading(2, "Alpha section"),
      para("Body one."),
      heading(3, "Beta sub"),
      para("Body two."),
    ],
  });

  it("carries exactly one aria-current='true' entry; Top carries it when no body heading is current", () => {
    const { container } = mountPanel(article);
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toBe("Top of article");
    // Token discipline: "true", never "page" (that is the shell-nav's
    // other-page token).
    expect(current[0]!.getAttribute("aria-current")).toBe("true");
  });

  it("maps the sectionSpy current heading to its entry via data-block-index", () => {
    vi.useFakeTimers();
    try {
      // A live article element with rendered headings carrying
      // data-block-index (the rendered-DOM contract). jsdom rects are all 0,
      // so detect() marks every heading "passed" and the LAST heading
      // becomes current — Beta sub (block index 3).
      const articleEl = document.createElement("article");
      const alpha = document.createElement("h2");
      alpha.dataset.blockIndex = "1";
      alpha.textContent = "Alpha section";
      const beta = document.createElement("h3");
      beta.dataset.blockIndex = "3";
      beta.textContent = "Beta sub";
      articleEl.append(alpha, beta);
      document.body.append(articleEl);

      const { container } = mountPanel(article, { articleEl });
      // Scroll triggers the spy's rAF-throttled fallback → detect → the
      // 250ms debounced notify.
      fireEvent.scroll(window);
      act(() => {
        vi.advanceTimersByTime(300);
      });

      const current = container.querySelectorAll('[aria-current="true"]');
      expect(current).toHaveLength(1);
      expect(current[0]!.textContent).toBe("Beta sub");
      // Top no longer carries it once a body heading is current.
      expect(current[0]!.textContent).not.toBe("Top of article");

      articleEl.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 6: headingless honesty (D18-13) ─────────────────────────────────────────

describe("TocPanel: headingless state (D18-13)", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [para("A single unstructured paragraph.")],
  });

  it("renders the note 'This article has no headings.' below the title with only the Top entry", () => {
    mountPanel(article);
    const note = screen.getByText("This article has no headings.");
    expect(note).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Table of contents" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.textContent).toBe("Top of article");
  });
});

// ── 7: activation interception (Pitfall 4) ──────────────────────────────────

describe("TocPanel: entry activation", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      para("Intro paragraph."),
      heading(2, "Alpha section"),
      para("Body one."),
    ],
  });

  it("click calls onActivate with the entry and preventDefaults", () => {
    const { onActivate } = mountPanel(article);
    const link = screen.getByRole("link", { name: "Alpha section" });
    const clickEvent = fireEvent.click(link);
    // fireEvent returns false when preventDefault was called.
    expect(clickEvent).toBe(false);
    expect(onActivate).toHaveBeenCalledTimes(1);
    const entry = onActivate.mock.calls[0]![0] as TocEntry;
    expect(entry.text).toBe("Alpha section");
    expect(entry.blockIndex).toBe(1);
  });

  it("Enter calls onActivate with the entry and preventDefaults (no router re-parse)", () => {
    const { onActivate } = mountPanel(article);
    const link = screen.getByRole("link", { name: "Alpha section" });
    const keyEvent = fireEvent.keyDown(link, { key: "Enter" });
    expect(keyEvent).toBe(false);
    expect(onActivate).toHaveBeenCalledTimes(1);
    const entry = onActivate.mock.calls[0]![0] as TocEntry;
    expect(entry.text).toBe("Alpha section");
  });
});

// ── 8: manual Esc (popover="manual" gets no native Esc) ─────────────────────

describe("TocPanel: Escape routing", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [para("Only a paragraph.")],
  });

  it("Escape keydown calls hidePopover on the panel element", () => {
    mountPanel(article);
    const panel = document.querySelector(".toc-panel") as HTMLElement & {
      hidePopover: () => void;
    };
    expect(panel).not.toBeNull();
    const hidePopover = vi.fn();
    panel.hidePopover = hidePopover;
    const keyEvent = fireEvent.keyDown(panel, { key: "Escape" });
    expect(keyEvent).toBe(false);
    expect(hidePopover).toHaveBeenCalledTimes(1);
  });});

afterEach(() => {
  document.body.innerHTML = "";
});
