// tests/unit/jumpToOffset.test.ts
// Unit suite for the Issue #5 jumpToOffset module — the ONE home for the
// mode-aware passage-jump tail that ArticleView's four call sites (deep-link,
// restore, back-nav, TOC) previously re-implemented, plus the D4-07
// rAF + 120ms firefox-settle focus guard.
//
// Covered through the module's interface:
//   - PAGINATED branch: offset → fragmentContainingOffset → turnToPage; no
//     turn when the surface has no committed pages (call sites keep their
//     settle/focus discipline — the guard runs regardless).
//   - SCROLLING branch: offset → findScrollTarget → scrollIntoView with the
//     requested alignment ("start" default, "center" for highlight jumps);
//     overshoot clamps to the last block; empty blocks never scroll.
//   - End-landing (260908-oht): an endLanding-eligible offset at/past the
//     article total lands at the absolute document bottom via window.scrollTo,
//     never a block scroll.
//   - Settle guard: onSettled double-calls on the SAME closure — once after
//     the rAF tick, again after the 120ms belt-and-suspenders timeout.
//
// jsdom is sufficient: the module composes pure resolvers
// (fragmentContainingOffset / findScrollTarget / landingForRestore) with
// stubbed DOM verbs (turnToPage / scrollIntoView / window.scrollTo). Real
// scroll/layout behavior stays in the Playwright navigation e2e specs.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import type { PageFragment } from "../../src/pagination/types";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";
import {
  FOCUS_SETTLE_MS,
  jumpToOffset,
  settleFocus,
} from "../../src/reader/jumpToOffset";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "jump-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/jump",
    title: "Jump Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

const article = parseArticle({
  ...baseArticle,
  blocks: [
    { kind: "heading", level: 2, content: [{ text: "First section" }] },
    { kind: "paragraph", content: [{ text: "First paragraph body." }] },
    { kind: "heading", level: 2, content: [{ text: "Second section" }] },
    { kind: "paragraph", content: [{ text: "Second paragraph body." }] },
  ],
});

// Per-block normalized lengths: 13 / 21 / 14 / 22 graphemes, joined by a
// one-grapheme BLOCK_SEPARATOR. Block N's article-global start offset:
// 0 / 14 / 36 / 51. Total = 51 + 22 = 73.
const ARTICLE_TOTAL = 73;

/** HTMLElement stubs in document order mirroring the article blocks. */
function buildBlocks(): HTMLElement[] {
  return [
    makeBlock("First section", "heading", "h2"),
    makeBlock("First paragraph body."),
    makeBlock("Second section", "heading", "h2"),
    makeBlock("Second paragraph body."),
  ];
}

function makeBlock(
  text: string,
  kind?: string,
  tag: keyof HTMLElementTagNameMap = "p",
): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  el.scrollIntoView = vi.fn();
  return el;
}

/** A minimal PageFragment whose first slice starts blockIndex at grapheme 0 —
 * fragmentContainingOffset only reads the FIRST entry's blockIndex +
 * startGrapheme through pageStartGlobalOffset. */
function pageAt(pageIndex: number, blockIndex: number): PageFragment {
  return {
    schemaVersion: 1,
    pageIndex,
    blocks: [{ blockIndex, startGrapheme: 0, endGrapheme: 0 }],
  };
}

/** Two committed pages: page 0 starts at block 0 (offset 0), page 1 starts at
 * block 2 (offset 36). */
const TWO_PAGES: PageFragment[] = [pageAt(0, 0), pageAt(1, 2)];

function fakeSurface(pages: PageFragment[] | null): {
  surface: PaginatedSurfaceHandle;
  turnToPage: ReturnType<typeof vi.fn>;
} {
  const turnToPage = vi.fn();
  const surface = {
    turnToPage,
    getPages: () => pages,
  } as unknown as PaginatedSurfaceHandle;
  return { surface, turnToPage };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── PAGINATED branch ─────────────────────────────────────────────────────────

describe("jumpToOffset — paginated branch", () => {
  it("turns to the page containing the offset", () => {
    const { surface, turnToPage } = fakeSurface(TWO_PAGES);
    // Offset 40 falls in page 1's range [36, ∞).
    jumpToOffset(article, 40, { mode: "paginated", surface, blocks: [] });
    expect(turnToPage).toHaveBeenCalledTimes(1);
    expect(turnToPage).toHaveBeenCalledWith(1);
  });

  it("lands page 0 for an offset inside the first page's range", () => {
    const { surface, turnToPage } = fakeSurface(TWO_PAGES);
    jumpToOffset(article, 10, { mode: "paginated", surface, blocks: [] });
    expect(turnToPage).toHaveBeenCalledWith(0);
  });

  it("never turns when no pages are committed (calm no-op)", () => {
    const { surface, turnToPage } = fakeSurface(null);
    jumpToOffset(article, 40, { mode: "paginated", surface, blocks: [] });
    expect(turnToPage).not.toHaveBeenCalled();
  });

  it("never turns when the pages array is empty (calm no-op)", () => {
    const { surface, turnToPage } = fakeSurface([]);
    jumpToOffset(article, 40, { mode: "paginated", surface, blocks: [] });
    expect(turnToPage).not.toHaveBeenCalled();
  });
});

// ── SCROLLING branch ─────────────────────────────────────────────────────────

describe("jumpToOffset — scrolling branch", () => {
  it("scrolls the containing block into view, aligned to start by default", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, 20, {
      mode: "scrolling",
      surface: null,
      blocks,
    });
    // Offset 20 ∈ block 1's [14, 36).
    expect(blocks[1]!.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(blocks[1]!.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(blocks[0]!.scrollIntoView).not.toHaveBeenCalled();
  });

  it("honors the block alignment option (center — the highlight-jump tail)", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, 20, {
      mode: "scrolling",
      surface: null,
      blocks,
      scrollAlignment: "center",
    });
    expect(blocks[1]!.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("clamps an overshooting offset to the last block (never null)", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, 10_000, {
      mode: "scrolling",
      surface: null,
      blocks,
    });
    expect(blocks[3]!.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("never scrolls when the blocks array is empty", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, 0, { mode: "scrolling", surface: null, blocks: [] });
    for (const el of blocks) {
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    }
  });
});

// ── End-landing (260908-oht — restore / mode-swap offsets at the end) ────────

describe("jumpToOffset — end landing", () => {
  it("lands an at-total offset at the absolute document bottom", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, ARTICLE_TOTAL, {
      mode: "scrolling",
      surface: null,
      blocks,
      endLanding: true,
    });
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenCalledWith(
      0,
      document.documentElement.scrollHeight,
    );
    for (const el of blocks) {
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    }
  });

  it("lands a past-total offset (corpus changed) at the bottom too", () => {
    jumpToOffset(article, 10_000, {
      mode: "scrolling",
      surface: null,
      blocks: buildBlocks(),
      endLanding: true,
    });
    expect(window.scrollTo).toHaveBeenCalledWith(
      0,
      document.documentElement.scrollHeight,
    );
  });

  it("keeps a mid-article offset on the normal passage path", () => {
    const blocks = buildBlocks();
    jumpToOffset(article, 20, {
      mode: "scrolling",
      surface: null,
      blocks,
      endLanding: true,
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(blocks[1]!.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("ignores the end landing unless the caller opts in (jump tails stay put)", () => {
    const blocks = buildBlocks();
    // An at-total offset through the highlight/TOC tails scrolls to its
    // passage — the re-pinning end-landing is restore/mode-swap only.
    jumpToOffset(article, ARTICLE_TOTAL, {
      mode: "scrolling",
      surface: null,
      blocks,
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(blocks[3]!.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not consult the end landing in paginated mode", () => {
    const { surface, turnToPage } = fakeSurface(TWO_PAGES);
    // The offset resolves through fragmentContainingOffset regardless.
    jumpToOffset(article, ARTICLE_TOTAL, {
      mode: "paginated",
      surface,
      blocks: [],
      endLanding: true,
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(turnToPage).toHaveBeenCalledWith(1); // clamp to last page
  });
});

// ── Settle guard (D4-07 firefox-settle double-call) ──────────────────────────

describe("jumpToOffset — settle/focus guard", () => {
  it("double-calls onSettled on the same closure: rAF tick + 120ms", () => {
    const { surface } = fakeSurface(TWO_PAGES);
    const onSettled = vi.fn();
    jumpToOffset(article, 40, {
      mode: "paginated",
      surface,
      blocks: [],
      onSettled,
    });
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16); // the rAF tick
    expect(onSettled).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FOCUS_SETTLE_MS - 16 + 1);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("runs the guard even when the paginated no-op path fires (back-nav parity)", () => {
    // handleNavigateBack focuses the <mark> even when the surface has no
    // committed pages — the discipline belongs to the jump, not the turn.
    const { surface } = fakeSurface(null);
    const onSettled = vi.fn();
    jumpToOffset(article, 40, {
      mode: "paginated",
      surface,
      blocks: [],
      onSettled,
    });
    vi.advanceTimersByTime(200);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("runs the guard after an end landing too", () => {
    const onSettled = vi.fn();
    jumpToOffset(article, ARTICLE_TOTAL, {
      mode: "scrolling",
      surface: null,
      blocks: buildBlocks(),
      endLanding: true,
      onSettled,
    });
    vi.advanceTimersByTime(200);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("exports settleFocus as the standalone discipline (TOC-top tail)", () => {
    const fn = vi.fn();
    settleFocus(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(121);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
