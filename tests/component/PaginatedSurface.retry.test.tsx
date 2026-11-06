// tests/component/PaginatedSurface.retry.test.tsx
// Issue #240 — the surface-side retry + honesty seams:
//   - a processing failure leaves pages uncommitted (blank surface is the
//     typed failure state, explained by ArticleView's banner);
//   - the paginationRetryEpoch prop re-runs the pagination pass at the SAME
//     anchor when the reader chooses "Try pages again";
//   - an unexpected engine exception emits the typed
//     "unexpected-pagination-error" diagnostic (no silent garbage) and
//     classifies as a processing failure;
//   - an AbortError (superseded pass) emits NOTHING — cancellation is never
//     a reader-facing failure.
// Engine mocked (the file's discipline): layout truth lives in Playwright.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PaginatedSurface } from "../../src/reader/PaginatedSurface";
import { paginateDocument } from "../../src/pagination/fragment";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import { articleGraphemeIndex, graphemeLength } from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";
import type { MeasurementResult } from "../../src/measurement/types";
import type { PageFragment } from "../../src/pagination/types";

vi.mock("../../src/pagination/fragment", () => ({
  paginateDocument: vi.fn(),
}));

import {
  PaginationFailureSchema,
  classifyPaginationFailure,
} from "../../src/reader/paginationFailure";

const paginateMock = vi.mocked(paginateDocument);

const article: CanonicalArticle = {
  id: "retry-stub",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/post",
    title: "Retry Stub",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "First.", marks: [] }] },
    { kind: "paragraph", content: [{ text: "Second.", marks: [] }] },
  ],
  footnotes: [],
};

const trustedView: MeasurementResult = {
  schemaVersion: 2,
  scope: undefined,
  constraints: {
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    viewportWidthPx: 1024,
    lang: "en",
  },
  blocks: [
    { kind: "paragraph", heightPx: 300, lineCount: 5, lineBoxes: [] },
    { kind: "paragraph", heightPx: 300, lineCount: 5, lineBoxes: [] },
  ],
  computedAt: "2026-08-06T00:00:00.000Z",
};

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
    // The real RO contract: the initial observation delivers on observe().
    this.fire(roHeight);
  }
  unobserve(target: Element) {
    this.observed = this.observed.filter((t) => t !== target);
  }
  disconnect() {
    this.observed = [];
  }
  /** One entry per observed target, as a real RO fires (identity matters:
      the surface routes entries by target identity). */
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

function makeArticleEl(): HTMLElement {
  const articleEl = document.createElement("article");
  const pageViewport = document.createElement("div");
  pageViewport.className = "page-viewport";
  articleEl.appendChild(pageViewport);
  return articleEl;
}

beforeEach(() => {
  paginateMock.mockReset();
  roHeight = 600;
  roInstances.length = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

function renderSurface(
  diagnostics: DiagnosticBus,
  props: Partial<Parameters<typeof PaginatedSurface>[0]> = {},
) {
  return render(
    <PaginatedSurface
      article={article}
      trustedView={trustedView}
      articleEl={makeArticleEl()}
      diagnostics={diagnostics}
      {...props}
    />,
  );
}

describe("PaginatedSurface — retry epoch + honest failure (issue #240)", () => {
  it("does not re-run pagination when the retry epoch is constant", () => {
    paginateMock.mockReturnValue({ schemaVersion: 1, status: "ok", pages: makePages(2) });
    const articleEl = makeArticleEl();
    const bus = new DiagnosticBus();
    const view = render(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={articleEl}
        diagnostics={bus}
        paginationRetryEpoch={0}
      />,
    );
    view.rerender(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={articleEl}
        diagnostics={bus}
        paginationRetryEpoch={0}
      />,
    );
    expect(paginateMock).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("re-runs pagination at the same anchor when the retry epoch bumps after a processing failure", () => {
    const diagnostics = new DiagnosticBus();
    const anchors: number[] = [];
    paginateMock
      .mockReturnValueOnce({
        schemaVersion: 1,
        status: "fallback",
        pages: [],
        reason: "zero-progress",
      })
      .mockReturnValueOnce({ schemaVersion: 1, status: "ok", pages: makePages(2) });
    // Anchor mid-work (offset 8 = inside the SECOND block) — a retry that
    // reset to the beginning would commit page 1 and report offset 0; the
    // preserved anchor commits the final page and reports the end-pin.
    const affected = articleGraphemeIndex(article).blockStartOffsets[1]! + 2;
    const view = render(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={diagnostics}
        initialAnchorOffset={affected}
        paginationRetryEpoch={0}
        onAnchorChange={(offset) => anchors.push(offset)}
      />,
    );
    // The processing failure committed nothing — the typed blank state.
    expect(document.querySelectorAll(".page-fragment").length).toBe(0);
    expect(paginateMock).toHaveBeenCalledTimes(1);
    expect(anchors).toEqual([]); // no anchor reports while pages are null

    // The reader chooses "Try pages again": ArticleView bumps the epoch.
    view.rerender(
      <PaginatedSurface
        article={article}
        trustedView={trustedView}
        articleEl={makeArticleEl()}
        diagnostics={diagnostics}
        initialAnchorOffset={affected}
        paginationRetryEpoch={1}
        onAnchorChange={(offset) => anchors.push(offset)}
      />,
    );
    expect(paginateMock).toHaveBeenCalledTimes(2);
    // Recovery committed pages at the SAME affected passage: the final page
    // carries the completion end-pin, not a reset-to-zero anchor.
    expect(document.querySelectorAll(".page-fragment").length).toBe(1);
    expect(anchors.at(-1)).toBe(graphemeLength(article));
    view.unmount();
  });

  it("an unexpected engine exception emits the typed processing diagnostic — never silence", () => {
    const diagnostics = new DiagnosticBus();
    paginateMock.mockImplementation(() => {
      throw new Error("layout engine exploded");
    });
    const { container } = renderSurface(diagnostics);
    expect(container.querySelectorAll(".page-fragment").length).toBe(0);
    const events = diagnostics.recent();
    const last = events.at(-1);
    expect(last?.kind).toBe("dom-fallback");
    const failure = classifyPaginationFailure(last!);
    expect(failure?.failureClass).toBe("processing-error");
    expect(() => PaginationFailureSchema.parse(failure)).not.toThrow();
  });

  it("a superseded pass (AbortError) emits no failure event — cancellation is silent", () => {
    const diagnostics = new DiagnosticBus();
    const abort = new Error("canceled");
    abort.name = "AbortError";
    paginateMock.mockImplementation(() => {
      throw abort;
    });
    renderSurface(diagnostics);
    expect(diagnostics.recent().filter((e) => e.kind === "dom-fallback")).toEqual([]);
  });
});
