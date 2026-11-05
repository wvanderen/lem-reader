// tests/component/PaginatedSurface.test.tsx
// Component tests for the paginated-mode surface (Pattern 5 single content
// tree + PAGE-02 pointer turn + D4-08 disabled-state). The pagination engine
// (paginateDocument) is mocked so the test asserts COMPONENT behavior in
// isolation — real PAGE-03 exactly-once/no-clipping proofs run in Plan 04-05's
// Playwright corpus matrix (jsdom is not authoritative for layout).
//
// Issue #10 — the surface measures its own geometry. Tests no longer inject
// heights: a controllable ResizeObserver mock (below) replaces setup.ts's
// never-firing stub and delivers the initial observation, exactly as a real
// browser delivers one per observed box.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createRef, useEffect } from "react";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the engine module, then drive it via the mock.
vi.mock("../../src/pagination/fragment", () => ({
  paginateDocument: vi.fn(),
}));

import { PaginatedSurface } from "../../src/reader/PaginatedSurface";
import { paginateDocument } from "../../src/pagination/fragment";
import { pageAnchorOffset, pageStartGlobalOffset } from "../../src/pagination/anchor";
import { articleGraphemeIndex, graphemeLength } from "../../src/content/normalizeText";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import type { CanonicalArticle } from "../../src/content/types";
import type { MeasurementResult } from "../../src/measurement/types";
import type { PageFragment } from "../../src/pagination/types";
import * as overflowGuard from "../../src/pagination/overflowGuard";
import {
  readPaginationTrail,
  resetPaginationTrailForTests,
} from "../../src/reader/paginationTrail";

const paginateMock = vi.mocked(paginateDocument);

// ── Controllable ResizeObserver mock (Issue #10 geometry ownership) ─────────
// setup.ts installs a never-firing RO stub so ArticleView mounts don't crash;
// the surface's geometry effect needs DELIVERIES. The mock fires the initial
// observation on observe() (the real RO contract) with `roHeight`, and tests
// can drive later resizes via instance.fire(). Stubbed for this file's whole
// run (each test file gets a fresh environment, so setup.ts's stub is not
// affected elsewhere).
let roHeight: number;
const roInstances: ResizeObserverMock[] = [];

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    roInstances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
    this.fire(roHeight);
  }
  unobserve(target: Element) {
    this.observed = this.observed.filter((el) => el !== target);
  }
  disconnect() {
    this.observed = [];
  }
  /** Simulate a box resize: one entry per observed target, as a real RO fires. */
  fire(height: number) {
    const entries = this.observed.map(
      (target) =>
        ({
          target,
          contentRect: { width: 1024, height },
        }) as unknown as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

const article: CanonicalArticle = {
  id: "stub-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/posts/stub",
    title: "Stub Article",
    retrievedAt: "2026-08-06T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "First page content.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Second page content.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Third page content.", marks: [] }] },
  ],
  footnotes: [],
};

const trustedView: MeasurementResult = {
  schemaVersion: 2,
  constraints: {
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    viewportWidthPx: 1024,
    lang: "en",
  },
  blocks: [
    { kind: "paragraph", heightPx: 600, lineCount: 10, lineBoxes: [] },
    { kind: "paragraph", heightPx: 600, lineCount: 10, lineBoxes: [] },
    { kind: "paragraph", heightPx: 600, lineCount: 10, lineBoxes: [] },
  ],
  computedAt: "2026-08-06T00:00:00.000Z",
};

/** Build N synthetic page fragments each referencing a distinct blockIndex. */
function makePages(n: number): PageFragment[] {
  return Array.from({ length: n }, (_, i) => ({
    schemaVersion: 1 as const,
    pageIndex: i,
    blocks: [
      {
        blockIndex: i,
        startGrapheme: 0,
        endGrapheme: articleGraphemeIndex(article).perBlockLengths[i]!,
      },
    ],
  }));
}

beforeEach(() => {
  paginateMock.mockReset();
  roHeight = 600;
  roInstances.length = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

/**
 * The surface's DOM contract (Issue #10): it renders inside a .page-viewport
 * within the shared articleEl, and it discovers that box itself — the test
 * provides the shell, never a height.
 */
function makeArticleEl(): HTMLElement {
  const articleEl = document.createElement("article");
  const pageViewport = document.createElement("div");
  pageViewport.className = "page-viewport";
  articleEl.appendChild(pageViewport);
  return articleEl;
}

function renderSurface(onAnchorChange?: (offset: number) => void) {
  const diagnostics = new DiagnosticBus();
  return render(
    <PaginatedSurface
      article={article}
      trustedView={trustedView}
      articleEl={makeArticleEl()}
      diagnostics={diagnostics}
      onAnchorChange={onAnchorChange}
    />,
  );
}

describe("PaginatedSurface — single content tree + pointer turn", () => {
  it("retains the precise passage across successive geometry and measurement passes", () => {
    const handle = createRef<PaginatedSurfaceHandle>();
    const precise = articleGraphemeIndex(article).blockStartOffsets[1]! + 10;
    const layout = (split: number): PageFragment[] => {
      const pages = makePages(3);
      pages[0]!.blocks.push({ blockIndex: 1, startGrapheme: 0, endGrapheme: split });
      pages[1]!.blocks[0]!.startGrapheme = split;
      return pages;
    };
    paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: makePages(3) });
    render(
      <PaginatedSurface
        ref={handle}
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={new DiagnosticBus()}
        initialAnchorOffset={precise}
      />,
    );
    expect(handle.current!.getState()!.page).toBe(2);
    for (const split of [7, 9]) {
      paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: layout(split) });
      act(() => roInstances.forEach((observer) => observer.fire(600 - split)));
      expect(handle.current!.getState()!.page).toBe(2);
    }
  });

  it("reports navigation intent synchronously and distinguishes later layout reports", () => {
    const handle = createRef<PaginatedSurfaceHandle>();
    const onAnchorChange = vi.fn();
    paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: makePages(3) });
    render(
      <PaginatedSurface
        ref={handle}
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={new DiagnosticBus()}
        onAnchorChange={onAnchorChange}
      />,
    );
    onAnchorChange.mockClear();
    act(() => {
      handle.current!.turn("next");
      // This is delivered before React commits, so completion arriving later
      // cannot be overwritten by a delayed navigation notification.
      expect(onAnchorChange).toHaveBeenLastCalledWith(
        pageAnchorOffset(article, makePages(3), 1),
        "navigation",
      );
    });
    expect(onAnchorChange).toHaveBeenCalledTimes(1);
    paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: makePages(3) });
    act(() => roInstances.forEach((observer) => observer.fire(590)));
    expect(onAnchorChange).toHaveBeenLastCalledWith(
      pageAnchorOffset(article, makePages(3), 1),
      "layout",
    );
  });

  it("renders exactly one .page-fragment section (A11Y-03 single content tree)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const { container } = renderSurface();
    const sections = container.querySelectorAll(".page-fragment");
    expect(sections.length).toBe(1);
    expect(sections[0]?.getAttribute("aria-label")).toBe("Page 1");
  });

  it("clicking Next advances the aria-label from 'Page 1' to 'Page 2'", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    expect(screen.getByRole("region", { name: "Page 1" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("region", { name: "Page 2" })).not.toBeNull();
  });

  it("clicking Previous retreats from page 2 back to page 1", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByRole("region", { name: "Page 1" })).not.toBeNull();
  });

  it("an imperative turn during a source swap uses the new pages and index together", () => {
    const ref = createRef<PaginatedSurfaceHandle>();
    const articleEl = makeArticleEl();
    const diagnostics = new DiagnosticBus();
    const nextView: MeasurementResult = {
      ...trustedView,
      scope: { articleId: article.id, revision: 1, startBlock: 1, endBlock: 3 },
    };
    paginateMock.mockImplementation(({ measurement }) => ({
      schemaVersion: 1,
      status: "ok",
      pages: measurement.scope
        ? makePages(3)
            .slice(1)
            .map((p, i) => ({ ...p, pageIndex: i }))
        : makePages(3),
    }));
    function Host({ view }: { view: MeasurementResult }) {
      // Child effects queue the new source pages before this effect turns.
      // React has not committed those pages yet; the handle must nonetheless
      // read a coherent pair, never old pages + a new index or vice versa.
      useEffect(() => {
        if (view === nextView) ref.current?.turn("next");
      }, [view]);
      return (
        <PaginatedSurface
          ref={ref}
          article={article}
          trustedView={view}
          articleEl={articleEl}
          diagnostics={diagnostics}
        />
      );
    }
    const result = render(<Host view={trustedView} />);
    act(() => {
      ref.current!.turn("next");
    });
    result.rerender(<Host view={nextView} />);
    // Issue #236 — PageState carries the committed page's canonical start
    // offset beside the page pair; the swap-coherence contract is the
    // (page, total) pair, so the offset is matched by shape.
    expect(ref.current!.getState()).toEqual({
      page: 2,
      total: 2,
      anchorOffset: expect.any(Number),
    });
    expect(screen.getByRole("region", { name: "Page 2" })).toHaveTextContent("Third page content.");
    const dev = (
      window as unknown as {
        __lemPagination: { currentPageIdx: number; pagesLength: number; pages: PageFragment[] };
      }
    ).__lemPagination;
    expect(dev.currentPageIdx).toBe(1);
    expect(dev.pagesLength).toBe(2);
    expect(dev.pages).toBe(ref.current!.getPages());
  });

  it("Previous has aria-disabled='true' on page 1 (D4-08 first-page boundary)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
  });

  it("Next has aria-disabled='true' on the last page (D4-08 last-page boundary)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const next = screen.getByRole("button", { name: "Next page" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
  });

  it("Previous has aria-disabled='false' on page 2 (D4-08 mid-boundary enabled state)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev.getAttribute("aria-disabled")).toBe("false");
  });

  it("renders the page-indicator span with '1 of 3' on the first page (D4-08)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    renderSurface();
    const indicator = document.querySelector(".page-indicator");
    expect(indicator?.textContent).toBe("1 of 3");
    // aria-hidden — decorative; AT progress comes from SectionAnnouncer.
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
  });

  it("publishes a terminal fallback even when no page state changes or DOM commit follows", () => {
    const dev = window as unknown as { __lemPagination?: { status: string; pagesLength: number } };
    delete dev.__lemPagination;
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "fallback",
      pages: [],
      reason: "oversized-block",
    });
    renderSurface();
    expect(dev.__lemPagination).toMatchObject({ status: "fallback", pagesLength: 0 });
  });

  it.each(["overflow-atomic-too-tall", "overflow-no-legal-split", "overflow-no-progress"])(
    "records the guard's %s reason in the attached event trail",
    (reason) => {
      // This is wiring, not layout truth: drive the guard's terminal result
      // and verify that the component retains its machine-readable reason.
      const diagnostics = new DiagnosticBus();
      const guard = vi.spyOn(overflowGuard, "refragmentOverflowingPage").mockImplementation(() => {
        diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString(), reason });
        return [];
      });
      const frames: FrameRequestCallback[] = [];
      const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
      window.localStorage.setItem("lem.paginationTrail", "1");
      resetPaginationTrailForTests();
      paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: makePages(3) });
      const articleEl = makeArticleEl();
      const view = render(
        <PaginatedSurface
          article={article}
          trustedView={trustedView}
          articleEl={articleEl}
          diagnostics={diagnostics}
        />,
        { container: articleEl.querySelector<HTMLElement>(".page-viewport")! },
      );
      try {
        act(() => frames.at(-1)!(0));
        expect(guard).toHaveBeenCalled();
        expect(
          readPaginationTrail().events.find((event) => event.kind === "fallback"),
        ).toMatchObject({
          articleId: article.id,
          cause: "fallback",
          reason,
        });
      } finally {
        view.unmount();
        guard.mockRestore();
        raf.mockRestore();
        cancel.mockRestore();
        resetPaginationTrailForTests();
        window.localStorage.removeItem("lem.paginationTrail");
      }
    },
  );

  it("renders nothing when the engine returns status 'fallback' (PAGE-04 deferred to Plan 04-05)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "fallback",
      pages: [],
      reason: "oversized-block",
    });
    const { container } = renderSurface();
    expect(container.querySelectorAll(".page-fragment").length).toBe(0);
    expect(container.querySelector(".page-indicator")).toBeNull();
  });

  it("renders nothing until its own resize observation reports a page height (waits for geometry)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    // No geometry yet: the surface's RO mock delivers height 0 (jsdom's zero
    // layout), so the engine must not run and nothing renders.
    roHeight = 0;
    const { container } = renderSurface();
    expect(container.querySelectorAll(".page-fragment").length).toBe(0);
    expect(paginateMock).not.toHaveBeenCalled();
    // Geometry arrives through the surface's OWN resize observation —
    // pagination runs without any parent-side height injection.
    act(() => {
      roInstances[roInstances.length - 1]!.fire(600);
    });
    expect(container.querySelectorAll(".page-fragment").length).toBe(1);
    expect(paginateMock).toHaveBeenCalledTimes(1);
    expect(paginateMock.mock.calls[0]![0]!.pageContentBoxHeightPx).toBe(600);
  });

  it("reports geometry readiness upward through onGeometryReady, exactly once per mount", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const onGeometryReady = vi.fn();
    const diagnostics = new DiagnosticBus();
    render(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={diagnostics}
        onGeometryReady={onGeometryReady}
      />,
    );
    // Fired on the 0 → positive height transition (the RO's initial
    // delivery), and NOT again for subsequent deliveries of the same box.
    expect(onGeometryReady).toHaveBeenCalledTimes(1);
    act(() => {
      roInstances[roInstances.length - 1]!.fire(600);
    });
    expect(onGeometryReady).toHaveBeenCalledTimes(1);
  });

  it("does not report geometry readiness while the viewport reports zero height", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    roHeight = 0;
    const onGeometryReady = vi.fn();
    const diagnostics = new DiagnosticBus();
    render(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={diagnostics}
        onGeometryReady={onGeometryReady}
      />,
    );
    expect(onGeometryReady).not.toHaveBeenCalled();
  });
});

// ─── 260908-oht: the committed-page anchor pin (passive completion) ─────────
// onAnchorChange must emit graphemeLength(article) on the FINAL page of a
// multi-page set (so the debounced save persists offset = total → Finished),
// while earlier pages keep emitting page-start offsets exactly as before.

describe("PaginatedSurface — continuation chrome", () => {
  it("does not repeat article metadata or reserve on a headingless paragraph continuation", () => {
    const continuation = {
      ...trustedView,
      scope: {
        articleId: article.id,
        revision: article.revision,
        startBlock: 0,
        endBlock: 1,
        startGrapheme: 6,
        endGrapheme: 18,
      },
    };
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: [
        {
          schemaVersion: 1,
          pageIndex: 0,
          blocks: [{ blockIndex: 0, startGrapheme: 6, endGrapheme: 18 }],
        },
      ],
    });
    const articleEl = makeArticleEl();
    const chrome = document.createElement("div");
    chrome.className = "article-top-meta";
    chrome.getBoundingClientRect = () => ({ height: 80 }) as DOMRect;
    articleEl.appendChild(chrome);
    const { container } = render(
      <PaginatedSurface
        article={article}
        trustedView={continuation}
        articleEl={articleEl}
        diagnostics={new DiagnosticBus()}
        articleStartChrome={<div>Article metadata</div>}
      />,
    );
    expect(screen.queryByText("Article metadata")).toBeNull();
    expect(paginateMock.mock.calls.at(-1)![0].firstPageReservedPx).toBe(0);
    expect(container.querySelector<HTMLElement>(".page-fragment")?.style.height).toBe("");
  });
});

describe("PaginatedSurface — committed-page anchor pin (onAnchorChange)", () => {
  it("the initial commit's call (page 1 of 3) is 0", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const onAnchorChange = vi.fn();
    renderSurface(onAnchorChange);
    const calls = onAnchorChange.mock.calls.map((c) => c[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toBe(0);
  });

  it("page 2's call equals pageStartGlobalOffset(article, pages[1]) and is below graphemeLength(article)", () => {
    const pages = makePages(3);
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages,
    });
    const onAnchorChange = vi.fn();
    renderSurface(onAnchorChange);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const expected = pageStartGlobalOffset(article, pages[1]!);
    const calls = onAnchorChange.mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(graphemeLength(article));
  });

  it("after two Next clicks the LAST onAnchorChange call equals graphemeLength(article) (the completion pin)", () => {
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    const onAnchorChange = vi.fn();
    renderSurface(onAnchorChange);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const calls = onAnchorChange.mock.calls.map((c) => c[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toBe(graphemeLength(article));
    // The pinned anchor agrees with the pure helper (no forked math).
    expect(calls[calls.length - 1]).toBe(pageAnchorOffset(article, makePages(3), 2));
  });

  it("never reports an anchor while the surface is still loading (issue #233 — never save a loading anchor of zero)", () => {
    // Geometry never becomes ready (height 0): the pagination effect cannot
    // run, pages stay null, and the anchor-reporting effect must stay
    // SILENT — a 0 anchor persisted during this window would poison the
    // reader's saved position (POLISH-02 / issue #233 loading anchor rule).
    paginateMock.mockReturnValue({
      schemaVersion: 1,
      status: "ok",
      pages: makePages(3),
    });
    roHeight = 0;
    const onAnchorChange = vi.fn();
    renderSurface(onAnchorChange);
    expect(onAnchorChange).not.toHaveBeenCalled();
  });
});
