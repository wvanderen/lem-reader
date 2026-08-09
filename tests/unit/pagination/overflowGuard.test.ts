// tests/unit/pagination/overflowGuard.test.ts
// Plan 04-07 Task 1 (TDD) — unit coverage for the post-render overflow guard.
//
// PAGE-03b no-clipping invariant: every rendered page fragment's content must
// fit within its content-box. Plan 04-06's pre-capture pipeline predicts
// heights from full-ArticleBody scrolling geometry; those heights don't always
// match rendered page-fragment heights inside .paginated-surface (paginated
// geometry, overflow:hidden). The guard runs AFTER the renderer mounts a page
// fragment and corrects any overflow by re-splitting against LIVE DOM truth.
//
// Behavior contracts under test (Plan 04-07 Task 1 <behavior>):
//   (a) refragmentOverflowingPage returns null when no child overflows.
//   (b) Atomic-block overflow moves the offending block AND any trailing
//       siblings on the same page to a new next page.
//   (c) Splitting-kind overflow re-reads live line boxes and chooses the
//       largest widow-legal line split whose before-slice fits.
//   (d) When a single atomic block alone exceeds the page box, the guard
//       returns [] (length 0) and emits dom-fallback.
//   (e) Termination: the guard returns [] when input pages.length is already
//       at PAGE_CEILING (defensive — never produces unbounded page counts).
//
// Layout truth: jsdom is NOT authoritative for layout. We stub HTMLElements
// with getBoundingClientRect + dataset.blockIndex and mock readLineBoxes for
// splitting-kind cases (Range.getClientRects returns [] in jsdom). The real
// cross-engine PAGE-03b proof lives in tests/e2e/pagination/no-overflow-
// invariant.spec.ts across chromium + firefox + webkit.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import type { LineBox } from "../../../src/measurement/types";
import type { DiagnosticEvent } from "../../../src/measurement/types";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { PageFragment } from "../../../src/pagination/types";

// Mock readLineBoxes — jsdom does not implement Range.getClientRects so the
// real implementation would return [] for any element. We expose a vi.fn so
// each splitting test can stub its own LineBox[] schedule. The mock factory
// preserves the real charOffsetToGrapheme + blockNormalizedText exports
// (those are pure JS and work in jsdom).
const readLineBoxesMock = vi.fn<
  (el: HTMLElement, fullText: string, signal: AbortSignal) => LineBox[]
>();
vi.mock("../../../src/pagination/lineBoxes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/pagination/lineBoxes")>();
  return {
    ...actual,
    readLineBoxes: (...args: Parameters<typeof actual.readLineBoxes>) =>
      readLineBoxesMock(...args),
  };
});

// Import the module under test AFTER vi.mock so it picks up the mock.
import { refragmentOverflowingPage } from "../../../src/pagination/overflowGuard";

// ── Article fixtures ────────────────────────────────────────────────────────

const baseArticle = {
  id: "overflow-guard-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/guard",
    title: "Guard Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function parseArticle(blocks: unknown[]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

/** Article with N paragraphs of distinct text (each paragraph = 1 block). */
function articleWithParagraphs(texts: string[]): CanonicalArticle {
  return parseArticle(
    texts.map((t) => ({ kind: "paragraph", content: [{ text: t }] })),
  );
}

/** Article with N atomic figures (height-only — content irrelevant to guard). */
function articleWithFigures(n: number): CanonicalArticle {
  const figures = [];
  for (let i = 0; i < n; i++) {
    figures.push({
      kind: "figure",
      alt: `figure ${i}`,
      src: "https://example.com/img.png",
      caption: [{ text: "cap" }],
    });
  }
  return parseArticle(figures);
}

// ── Live-DOM stubs ──────────────────────────────────────────────────────────

interface StubChild {
  blockIndex: number;
  top: number;
  bottom: number;
  height?: number;
  /** Optional textContent — required for splitting-kind cases so
   * blockNormalizedText(childEl) yields the slice text the line boxes index. */
  text?: string;
}

/**
 * Build a synthetic fragment HTMLElement whose `children` are real jsdom DOM
 * nodes carrying dataset.blockIndex and a stub getBoundingClientRect. The
 * fragment's own getBoundingClientRect returns top: 0 so child.bottom values
 * are already fragment-relative.
 */
function makeFragmentEl(children: StubChild[]): HTMLElement {
  const fragment = document.createElement("section");
  fragment.className = "page-fragment";
  fragment.getBoundingClientRect = () =>
    stubRect({ top: 0, bottom: 0, height: 0 });
  for (const c of children) {
    const child = document.createElement("div");
    child.setAttribute("data-block-index", String(c.blockIndex));
    if (c.text !== undefined) child.textContent = c.text;
    const height = c.height ?? Math.max(0, c.bottom - c.top);
    child.getBoundingClientRect = () =>
      stubRect({ top: c.top, bottom: c.bottom, height });
    fragment.appendChild(child);
  }
  return fragment as unknown as HTMLElement;
}

function stubRect(r: {
  top: number;
  bottom: number;
  height: number;
}): DOMRect {
  return {
    top: r.top,
    bottom: r.bottom,
    left: 0,
    right: 0,
    width: 0,
    height: r.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Build N uniform line boxes of the given text (each `charsPerLine` wide). */
function uniformLineBoxes(
  textLength: number,
  charsPerLine: number,
  lineHeight = 20,
): LineBox[] {
  if (textLength === 0) return [];
  const count = Math.max(1, Math.ceil(textLength / charsPerLine));
  const boxes: LineBox[] = [];
  for (let i = 0; i < count; i++) {
    boxes.push({
      charOffset: i * charsPerLine,
      topPx: i * lineHeight,
      bottomPx: i * lineHeight + lineHeight - 2,
    });
  }
  return boxes;
}

function trackingBus(): { bus: DiagnosticBus; events: DiagnosticEvent[] } {
  const bus = new DiagnosticBus();
  const events: DiagnosticEvent[] = [];
  bus.subscribe((e) => events.push(e));
  return { bus, events };
}

function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Build a PageFragment with N atomic whole-block entries [0..n). */
function wholeBlockPage(pageIndex: number, n: number): PageFragment {
  return {
    schemaVersion: 1,
    pageIndex,
    blocks: Array.from({ length: n }, (_, i) => ({
      blockIndex: i,
      startGrapheme: 0,
      endGrapheme: 3,
    })),
  };
}

beforeEach(() => {
  readLineBoxesMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── (a) no-overflow pass-through ────────────────────────────────────────────

describe("refragmentOverflowingPage — no-overflow pass-through", () => {
  it("returns null when no child bottom exceeds pageBox + tolerance", () => {
    const article = articleWithFigures(2);
    const pages: PageFragment[] = [wholeBlockPage(0, 2)];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 100 },
      { blockIndex: 1, top: 100, bottom: 200 },
    ]);
    const { bus, events } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).toBeNull();
    expect(events).toEqual([]);
    expect(readLineBoxesMock).not.toHaveBeenCalled();
  });

  it("returns null when child bottom exactly equals pageBox + tolerance (boundary)", () => {
    const article = articleWithFigures(1);
    const pages: PageFragment[] = [wholeBlockPage(0, 1)];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 302 },
    ]);
    const { bus } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).toBeNull();
  });
});

// ── (b) atomic-block overflow → move offending + trailing siblings ─────────

describe("refragmentOverflowingPage — atomic-block overflow", () => {
  it("moves offending atomic block + trailing siblings to a new next page", () => {
    const article = articleWithFigures(3);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 2, startGrapheme: 0, endGrapheme: 3 },
        ],
      },
    ];
    // children: A fits (100), B fits (200), C overflows at bottom 350 > 300+2.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 100 },
      { blockIndex: 1, top: 100, bottom: 200 },
      { blockIndex: 2, top: 200, bottom: 350 },
    ]);
    const { bus, events } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveLength(0);
    expect(events).toEqual([]); // no fallback
    // 2 pages: original (A, B) + new (C).
    expect(result!).toHaveLength(2);
    expect(result![0]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 3 },
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 3 },
    ]);
    expect(result![1]!.blocks).toEqual([
      { blockIndex: 2, startGrapheme: 0, endGrapheme: 3 },
    ]);
    // pageIndex fields are renumbered 0..length-1.
    expect(result!.map((p) => p.pageIndex)).toEqual([0, 1]);
  });

  it("preserves earlier + later pages around the overflowing page", () => {
    const article = articleWithFigures(5);
    // 3 pages: P0=[A,B] (ok), P1=[C,D] (D overflows), P2=[E] (ok).
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 3 },
        ],
      },
      {
        schemaVersion: 1,
        pageIndex: 1,
        blocks: [
          { blockIndex: 2, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 3, startGrapheme: 0, endGrapheme: 3 },
        ],
      },
      {
        schemaVersion: 1,
        pageIndex: 2,
        blocks: [{ blockIndex: 4, startGrapheme: 0, endGrapheme: 3 }],
      },
    ];
    // P1's children: C fits, D overflows.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 2, top: 0, bottom: 100 },
      { blockIndex: 3, top: 100, bottom: 350 },
    ]);
    const { bus } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 1,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    // 4 pages: P0 (unchanged) + split P1 + new P2 (D) + original P2 (E, now P3).
    expect(result!).toHaveLength(4);
    expect(result![0]!.blocks.map((b) => b.blockIndex)).toEqual([0, 1]);
    expect(result![1]!.blocks.map((b) => b.blockIndex)).toEqual([2]);
    expect(result![2]!.blocks.map((b) => b.blockIndex)).toEqual([3]);
    expect(result![3]!.blocks.map((b) => b.blockIndex)).toEqual([4]);
    expect(result!.map((p) => p.pageIndex)).toEqual([0, 1, 2, 3]);
  });
});

// ── (c) splitting-kind overflow → re-split at widow-legal line ──────────────

describe("refragmentOverflowingPage — splitting-kind overflow", () => {
  it("accounts for content already above an overflowing paragraph", () => {
    const firstText = "first";
    const secondText = "01234567890123456789012345678901234567890123456789";
    const article = articleWithParagraphs([firstText, secondText]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 5 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 50 },
        ],
      },
    ];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 100, text: firstText },
      { blockIndex: 1, top: 100, bottom: 200, text: secondText },
    ]);
    readLineBoxesMock.mockReturnValue(
      uniformLineBoxes(50, 10, 20).map((box) => ({
        ...box,
        topPx: box.topPx + 100,
        bottomPx: box.bottomPx + 100,
      })),
    );
    const { bus } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 150,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result?.[0]?.blocks[1]).toEqual({
      blockIndex: 1,
      startGrapheme: 0,
      endGrapheme: 20,
    });
  });

  it("re-splits a paragraph at the largest widow-legal line whose before-slice fits", () => {
    // Paragraph: 5 lines × 20px = 100px tall, charOffset 0..49.
    // pageBox: 50px (≈2 lines fit before widow). Expected split: line 2.
    const paragraphText =
      "01234567890123456789012345678901234567890123456789";
    const article = articleWithParagraphs([paragraphText]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 50 }],
      },
    ];
    // The paragraph child overflows: bottom 250 > pageBox 50.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 250, text: paragraphText },
    ]);
    // Provide 5 uniform line boxes (10 chars / line × 5 lines = 50 chars).
    // Each line 20px tall. With SPLIT_WIDOW_LINES=2 + 5 lines:
    //   k=3 → adjusted=3 → before-slice = lines[0..3), bottom = 3*20-2=58 > 50
    //   k=2 → adjusted=2 → before-slice = lines[0..2), bottom = 2*20-2=38 ≤ 50 ✓
    // So chosen splitIdx = 2 → charOffset 20 → grapheme offset 20.
    readLineBoxesMock.mockReturnValue(
      uniformLineBoxes(50, 10, 20),
    );

    const { bus, events } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 50,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveLength(0);
    expect(events).toEqual([]); // no fallback
    expect(result!).toHaveLength(2);
    // Current page: [0, 20) graphemes of paragraph block 0.
    expect(result![0]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 20 },
    ]);
    // Next page: [20, 50) graphemes of paragraph block 0.
    expect(result![1]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 20, endGrapheme: 50 },
    ]);
    expect(readLineBoxesMock).toHaveBeenCalledOnce();
  });

  it("moves the splitting block whole to next page when it has too few lines to split (< 2 * SPLIT_WIDOW_LINES)", () => {
    const article = articleWithParagraphs(["short", "next"]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 5 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 4 },
        ],
      },
    ];
    // Block 0 (short) fits at top, block 1 (next) overflows.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 100 },
      { blockIndex: 1, top: 100, bottom: 350 },
    ]);
    // Only 1 line box → cannot split under the 2/2 rule.
    readLineBoxesMock.mockReturnValue([
      { charOffset: 0, topPx: 0, bottomPx: 200 },
    ]);

    const { bus, events } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    expect(events).toEqual([]);
    expect(result!).toHaveLength(2);
    // Page 0: just block 0.
    expect(result![0]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 5 },
    ]);
    // Page 1: just block 1.
    expect(result![1]!.blocks).toEqual([
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 4 },
    ]);
  });

  it("preserves trailing sibling blocks when re-splitting", () => {
    // Two paragraphs on page 0; P0 overflows and gets split; P1 trails.
    const paragraphText =
      "01234567890123456789012345678901234567890123456789";
    const article = articleWithParagraphs([paragraphText, "next"]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 50 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 4 },
        ],
      },
    ];
    // child 0 (paragraph 0): bottom 250 overflows pageBox 50.
    // child 1 (paragraph 1): trailing sibling.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 250, text: paragraphText },
      { blockIndex: 1, top: 250, bottom: 260, text: "next" },
    ]);
    readLineBoxesMockReturnValue(
      // 5 lines × 10 chars / line × 20px = paragraph 0.
      uniformLineBoxes(50, 10, 20),
    );

    const { bus } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 50,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    // Page 0: [0,20) of paragraph 0.
    expect(result![0]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 20 },
    ]);
    // Page 1: [20,50) of paragraph 0 + whole paragraph 1.
    expect(result![1]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 20, endGrapheme: 50 },
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 4 },
    ]);
  });
});

// ── (d) single atomic block too tall → dom-fallback ────────────────────────

describe("refragmentOverflowingPage — dom-fallback", () => {
  it("returns [] + emits dom-fallback when a single atomic block alone exceeds pageBox", () => {
    const article = articleWithFigures(1);
    const pages: PageFragment[] = [wholeBlockPage(0, 1)];
    // Block alone is taller than the page box.
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 500, height: 500 },
    ]);
    const { bus, events } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).toEqual([]);
    expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
  });

  it("emits dom-fallback when a splitting block alone is unsplittable AND alone on the page", () => {
    const article = articleWithParagraphs(["ab"]); // 2 chars, 1 line — too short
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 2 }],
      },
    ];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 500, height: 500 },
    ]);
    // 1 line — cannot split under 2/2 rule.
    readLineBoxesMock.mockReturnValue([
      { charOffset: 0, topPx: 0, bottomPx: 500 },
    ]);

    const { bus, events } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).toEqual([]);
    expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
  });
});

// ── (e) termination ceiling ─────────────────────────────────────────────────

describe("refragmentOverflowingPage — termination ceiling", () => {
  it("emits dom-fallback when input pages.length >= PAGE_CEILING (300)", () => {
    const article = articleWithFigures(1);
    // Build 300 pages (the ceiling).
    const pages: PageFragment[] = Array.from({ length: 300 }, (_, i) => ({
      schemaVersion: 1 as const,
      pageIndex: i,
      blocks: [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 3 }],
    }));
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 500, height: 500 },
    ]);
    const { bus, events } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).toEqual([]);
    expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    // The guard must NOT walk children when the ceiling is already hit —
    // short-circuit before any DOM measurement.
    expect(readLineBoxesMock).not.toHaveBeenCalled();
  });

  it("respects abort signal (returns null when signal is aborted)", () => {
    const article = articleWithFigures(1);
    const pages: PageFragment[] = [wholeBlockPage(0, 1)];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 200 },
    ]);
    const { bus, events } = trackingBus();
    const controller = new AbortController();
    controller.abort();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: controller.signal,
    });

    expect(result).toBeNull();
    expect(events).toEqual([]);
  });
});

// ── PAGE-03 invariants preserved ────────────────────────────────────────────

describe("refragmentOverflowingPage — PAGE-03 invariants preserved", () => {
  it("guard's correction strictly subdivides the offending page (union of source ranges unchanged)", () => {
    // Article with 3 atomic blocks each contributing 3 graphemes.
    const article = articleWithFigures(3);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 3 },
          { blockIndex: 2, startGrapheme: 0, endGrapheme: 3 },
        ],
      },
    ];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 100 },
      { blockIndex: 1, top: 100, bottom: 200 },
      { blockIndex: 2, top: 200, bottom: 350 },
    ]);
    const { bus } = trackingBus();

    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 300,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    // The concatenation of all result page entries' blockIndex/start/end
    // must equal the original input (no block dropped, no entry duplicated).
    const originalEntries = pages[0]!.blocks.map((b) => `${b.blockIndex}:${b.startGrapheme}-${b.endGrapheme}`);
    const resultEntries = result!
      .flatMap((p) => p.blocks)
      .map((b) => `${b.blockIndex}:${b.startGrapheme}-${b.endGrapheme}`);
    expect(resultEntries).toEqual(originalEntries);
  });

  it("never produces an empty slice when the chosen split lands at the slice boundary (defensive guard)", () => {
    // Simulate a coordinate mismatch: entry says endGrapheme=10 but the live
    // DOM reports the full 50 chars (e.g. React hasn't re-rendered the sliced
    // block yet, OR the block has multi-byte UTF-16 chars whose grapheme vs
    // UTF-16 lengths diverge from the line-box walk's coordinate).
    //
    // chooseLargestWidowLegalSplit walks k from 4 down. For k=3 (adjusted=3),
    // charOffset=30 → sliceSplitGrapheme=30. sliceLen=10. clampedSplit=10
    // =sliceLen → defensive guard triggers. entriesBefore.length===0 AND
    // offendingHeight(250) > pageBox(60)+tolerance(2)=62 → emit fallback.
    // This is the correct behavior: the block alone is too tall to fit on a
    // fresh page, so refragmentation cannot resolve → dom-fallback.
    const article = articleWithParagraphs([
      "01234567890123456789012345678901234567890123456789",
      "next",
    ]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 10 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 4 },
        ],
      },
    ];
    const fragmentEl = makeFragmentEl([
      {
        blockIndex: 0,
        top: 0,
        bottom: 250,
        text: "01234567890123456789012345678901234567890123456789",
      },
      { blockIndex: 1, top: 250, bottom: 270, text: "next" },
    ]);
    readLineBoxesMock.mockReturnValue(uniformLineBoxes(50, 10, 20));

    const { bus, events } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 60,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    // Defensive guard triggered: no correction possible (block alone too
    // tall). Emit fallback so PAGE-03a coverage invariant is NOT violated
    // by an empty slice.
    expect(result).toEqual([]);
    expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
  });

  it("defensive guard moves block whole to next page when entriesBefore is non-empty", () => {
    // Same coordinate mismatch as above, but with a leading block that fits.
    // entriesBefore.length > 0 → defensive guard moves the offending block
    // whole to the next page (no fallback emission).
    const article = articleWithParagraphs([
      "lead",
      "01234567890123456789012345678901234567890123456789",
    ]);
    const pages: PageFragment[] = [
      {
        schemaVersion: 1,
        pageIndex: 0,
        blocks: [
          { blockIndex: 0, startGrapheme: 0, endGrapheme: 4 },
          { blockIndex: 1, startGrapheme: 0, endGrapheme: 10 },
        ],
      },
    ];
    const fragmentEl = makeFragmentEl([
      { blockIndex: 0, top: 0, bottom: 30, text: "lead" },
      {
        blockIndex: 1,
        top: 30,
        bottom: 80,
        height: 50,
        text: "01234567890123456789012345678901234567890123456789",
      },
    ]);
    readLineBoxesMock.mockReturnValue(uniformLineBoxes(50, 10, 20));

    const { bus, events } = trackingBus();
    const result = refragmentOverflowingPage({
      article,
      pages,
      overflowingPageIndex: 0,
      fragmentEl,
      pageContentBoxHeightPx: 60,
      tolerance: 2,
      diagnostics: bus,
      signal: freshSignal(),
    });

    expect(result).not.toBeNull();
    expect(events).toEqual([]); // no fallback — moved whole
    // Verify NO empty slices.
    for (const page of result!) {
      for (const entry of page.blocks) {
        expect(entry.endGrapheme, "no empty slices").toBeGreaterThan(
          entry.startGrapheme,
        );
      }
    }
    // 2 pages: lead block on P0, offending block whole on P1.
    expect(result!).toHaveLength(2);
    expect(result![0]!.blocks).toEqual([
      { blockIndex: 0, startGrapheme: 0, endGrapheme: 4 },
    ]);
    expect(result![1]!.blocks).toEqual([
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 10 },
    ]);
  });
});

// Helper to set mock return value with reset safety.
function readLineBoxesMockReturnValue(boxes: LineBox[]): void {
  readLineBoxesMock.mockReturnValue(boxes);
}
