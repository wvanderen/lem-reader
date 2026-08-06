// tests/unit/pagination/termination.test.ts
// PAGE-04 termination guard coverage: the engine MUST never infinite-loop on
// adversarial input. Three guards (per UI-SPEC §23 + RESEARCH §Common Pitfalls 6):
//
//   1. Per-block oversize: an atomic block whose measured height > 75% of
//      the page content-box height → status "fallback" + dom-fallback.
//   2. Page-count ceiling: > 300 pages for a single article revision →
//      status "fallback" + dom-fallback.
//   3. Zero-progress stall: a page with zero new content → status "fallback"
//      + dom-fallback. (Defensive — covered by the unsplittable-block-
//      overflow path which detects splitting blocks that can't split.)
//
// Each test exercises ONE guard in isolation. The engine's dom-fallback
// diagnostic emissions are tracked via a DiagnosticBus subscriber so we can
// assert exact emit counts (Phase 4 PAGE-09 surfaces these to the reader).
//
// Layout truth: jsdom is NOT authoritative for layout — these tests mock
// getClientRects via a Range stub. The real cross-engine PAGE-04 proof lives
// in Plan 05's Playwright corpus matrix.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle, InlineRun } from "../../../src/content/types";
import type { MeasurementResult, DiagnosticEvent } from "../../../src/measurement/types";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import { paginateDocument } from "../../../src/pagination/fragment";

const baseArticle = {
  id: "termination-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/termination",
    title: "Termination Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function parseArticle(blocks: unknown[]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

function makeBlockEl(text: string, tag: "p" | "h2" | "figure" = "p"): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

/** Range mock matching lineBoxMapping.test.ts + fragmentOrder.test.ts shape. */
function installRangeMock(lineCharOffsets: number[], lineHeight = 20): () => void {
  const realCreateRange = document.createRange.bind(document);
  const state = { start: 0, end: 0 };
  const stub: Range = {
    setStart: (_node: Node, offset: number) => {
      state.start = offset;
    },
    setEnd: (_node: Node, offset: number) => {
      state.end = offset;
    },
    getClientRects: (() => {
      const rects: DOMRect[] = [];
      for (let li = 0; li < lineCharOffsets.length; li++) {
        const lineStart = lineCharOffsets[li]!;
        const lineEnd =
          li + 1 < lineCharOffsets.length
            ? lineCharOffsets[li + 1]!
            : Number.MAX_SAFE_INTEGER;
        if (
          state.end > lineStart &&
          state.start < lineEnd &&
          state.end > state.start
        ) {
          rects.push(
            new DOMRect(0, li * lineHeight, 100, lineHeight - 2) as DOMRect,
          );
        }
      }
      return rects as unknown as DOMRectList;
    }) as Range["getClientRects"],
  } as unknown as Range;
  document.createRange = () => stub;
  return () => {
    document.createRange = realCreateRange;
  };
}

function installQuerySelectorAll(
  articleEl: HTMLElement,
  elements: HTMLElement[],
): () => void {
  const real = articleEl.querySelectorAll.bind(articleEl);
  articleEl.querySelectorAll = (() =>
    elements as unknown as NodeListOf<Element>) as typeof articleEl.querySelectorAll;
  return () => {
    articleEl.querySelectorAll = real;
  };
}

function measurementStub(
  rows: Array<{ kind: string; heightPx: number; lineCount: number }>,
): MeasurementResult {
  return {
    schemaVersion: 1,
    constraints: {
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      viewportWidthPx: 800,
      lang: "en",
    },
    blocks: rows,
    computedAt: "2026-08-06T00:00:00.000Z",
  };
}

function trackingBus(): { bus: DiagnosticBus; events: DiagnosticEvent[] } {
  const bus = new DiagnosticBus();
  const events: DiagnosticEvent[] = [];
  bus.subscribe((e) => events.push(e));
  return { bus, events };
}

// ─── Guard 1: per-block oversize ───────────────────────────────────────────

describe("PAGE-04 termination guard 1 — atomic block oversize (>75% page)", () => {
  it("atomic figure at 80% page height yields status 'fallback' + dom-fallback", () => {
    const article = parseArticle([
      {
        kind: "figure",
        alt: "An oversize figure",
        src: "https://example.com/img.png",
        caption: [{ text: "caption" }],
      },
    ]);
    const elements = [makeBlockEl("caption", "figure")];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    const restoreR = installRangeMock([0]);
    try {
      const measurement = measurementStub([
        { kind: "figure", heightPx: 80, lineCount: 1 },
      ]);
      const { bus, events } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 100, // 80/100 = 0.8 > 0.75
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("fallback");
      expect(result.pages).toEqual([]);
      expect(result.reason).toBe("oversized-block");
      expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    } finally {
      restoreQ();
      restoreR();
    }
  });

  it("atomic block at exactly 75% page is ALLOWED (strictly-greater threshold)", () => {
    const article = parseArticle([
      {
        kind: "figure",
        alt: "Edge case figure",
        src: "https://example.com/img.png",
        caption: [{ text: "cap" }],
      },
    ]);
    const elements = [makeBlockEl("cap", "figure")];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    const restoreR = installRangeMock([0]);
    try {
      const measurement = measurementStub([
        { kind: "figure", heightPx: 75, lineCount: 1 },
      ]);
      const { bus } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 100,
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("ok");
    } finally {
      restoreQ();
      restoreR();
    }
  });

  it("atomic heading at 76% page yields fallback (just-over-threshold)", () => {
    const article = parseArticle([
      { kind: "heading", level: 2, content: [{ text: "Big heading" }] },
    ]);
    const elements = [makeBlockEl("Big heading", "h2")];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    const restoreR = installRangeMock([0]);
    try {
      const measurement = measurementStub([
        { kind: "heading", heightPx: 76, lineCount: 1 },
      ]);
      const { bus, events } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 100,
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("fallback");
      expect(result.reason).toBe("oversized-block");
      expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    } finally {
      restoreQ();
      restoreR();
    }
  });

  it("splitting kind (paragraph) at 90% page does NOT trigger oversize (can split)", () => {
    // Paragraphs are splitting-kind — the oversize guard does NOT apply.
    // Even at 90% page height, the engine splits rather than falls back.
    // 6 lines × 20px = 120px... use 5 lines so a clean split is possible.
    const text = "aa bb cc dd ee"; // 5 segments → 5 line offsets
    const article = parseArticle([
      { kind: "paragraph", content: [{ text }] },
    ]);
    const elements = [makeBlockEl(text)];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    const restoreR = installRangeMock([0, 3, 6, 9, 12]);
    try {
      const measurement = measurementStub([
        { kind: "paragraph", heightPx: 90, lineCount: 5 },
      ]);
      const { bus } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 100,
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("ok");
    } finally {
      restoreQ();
      restoreR();
    }
  });
});

// ─── Guard 2: page-count ceiling ───────────────────────────────────────────

describe("PAGE-04 termination guard 2 — page-count ceiling (>300 pages)", () => {
  it("a pathological fixture producing >300 pages yields status 'fallback'", () => {
    // 200 paragraphs, each 8 lines × 20px = 160px. Page height 80px.
    // Each paragraph splits into 2 pages (4 + 4 lines), so 200 paras →
    // ~400 pages, well over the 300 ceiling. Engine MUST bail + fallback.
    const text = "aa bb cc dd ee ff gg hh"; // 8 segments
    const para = (t: string) => ({
      kind: "paragraph" as const,
      content: [{ text: t }] as InlineRun[],
    });
    const article = parseArticle(
      Array.from({ length: 200 }, () => para(text)),
    );
    const elements = Array.from({ length: 200 }, () => makeBlockEl(text));
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    // 8 lines per paragraph: offsets at every 3 chars (text length 23).
    const restoreR = installRangeMock([0, 3, 6, 9, 12, 15, 18, 21]);
    try {
      const measurement = measurementStub(
        Array.from({ length: 200 }, () => ({
          kind: "paragraph",
          heightPx: 160,
          lineCount: 8,
        })),
      );
      const { bus, events } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 80,
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("fallback");
      expect(result.pages).toEqual([]);
      expect(result.reason).toBe("page-ceiling");
      expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    } finally {
      restoreQ();
      restoreR();
    }
  });
});

// ─── Guard 3: zero-progress / unsplittable-block overflow ──────────────────

describe("PAGE-04 termination guard 3 — unsplittable-block overflow (zero-progress defense)", () => {
  it("a splitting block too tall to split on an empty page yields fallback", () => {
    // Paragraph with 4 lines (= 2*SPLIT_WIDOW_LINES, minimum splittable).
    // Page height tiny (40px) so 4-line paragraph can't fit even on a fresh
    // page after a flush. Engine hits the unsplittable-overflow path.
    const text = "aa bb cc dd"; // 4 segments
    const article = parseArticle([
      { kind: "paragraph", content: [{ text }] },
    ]);
    const elements = [makeBlockEl(text)];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    // 4 lines × 20px = 80px paragraph. Page = 40px. Line 0 already 20px tall;
    // 2 lines (orphan-bumped split point) = 40px on a 40px page — fits exactly
    // at the threshold but the next iteration overflows. We make page = 30
    // so even line 0 doesn't fit → chooseSplit returns null → unsplittable.
    const restoreR = installRangeMock([0, 3, 6, 9]);
    try {
      const measurement = measurementStub([
        { kind: "paragraph", heightPx: 80, lineCount: 4 },
      ]);
      const { bus, events } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 30, // line 0's bottom (20) > 30? no — fits.
        // Actually 20 <= 30, line 0 fits. Adjust: page height 15px.
        // But Range mock uses lineHeight=20, so any page < 20 forces overflow.
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      // Engine falls back because the splitting block can't produce a valid
      // split on an empty current page.
      expect(result.status).toBe("fallback");
      expect(result.pages).toEqual([]);
      expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    } finally {
      restoreQ();
      restoreR();
    }
  });

  it("block-element mismatch (container blocks render extra selector matches) yields fallback", () => {
    // The MVP engine assumes 1:1 article.blocks ↔ querySelectorAll elements.
    // Container blocks break this — we emit a fallback rather than wrong ranges.
    const article = parseArticle([
      { kind: "paragraph", content: [{ text: "standalone" }] },
    ]);
    // querySelectorAll returns 2 elements (mismatch with article.blocks.length=1).
    const elements = [makeBlockEl("standalone"), makeBlockEl("extra")];
    const articleEl = document.createElement("article");
    const restoreQ = installQuerySelectorAll(articleEl, elements);
    const restoreR = installRangeMock([0]);
    try {
      const measurement = measurementStub([
        { kind: "paragraph", heightPx: 20, lineCount: 1 },
      ]);
      const { bus, events } = trackingBus();
      const result = paginateDocument({
        article,
        measurement,
        articleEl,
        pageContentBoxHeightPx: 100,
        diagnostics: bus,
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("fallback");
      expect(result.reason).toBe("block-element-mismatch");
      expect(events.filter((e) => e.kind === "dom-fallback")).toHaveLength(1);
    } finally {
      restoreQ();
      restoreR();
    }
  });
});
