// tests/component/WindowedPaginatedSurface.book-boundary.test.tsx
// Issue #238 — the windowed surface's OUTER boundary seam. A layout-window
// end is NOT a chapter/book boundary: the adapter crosses its own windows
// internally and delegates to the host's onBoundaryTurn ONLY at the true
// chapter end/start, OR-ing the host's book-level availability into the
// child chevrons so the ordinary Next/Previous affordance stays enabled
// when the book continues past this chapter. Real geometry truth is e2e
// (book-crossing.spec.ts); this suite pins the boundary classification.
import { createRef, useMemo, useRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementResult } from "../../src/measurement/types";
import type { BlockWindow } from "../../src/pagination/blockWindow";
import type { CanonicalArticle } from "../../src/content/types";

// The measurement twin: the scope IS the requested window (no real layout).
vi.mock("../../src/measurement/useMeasurement", () => ({
  useMeasurement: (article: CanonicalArticle, _ref: unknown, range: BlockWindow) => {
    const last = useRef<MeasurementResult | null>(null);
    const measured = useMemo<MeasurementResult>(
      () => ({
        schemaVersion: 2,
        constraints: {
          font: "serif",
          size: 18,
          measure: 64,
          spacing: "comfortable",
          viewportWidthPx: 800,
          lang: "en",
        },
        computedAt: "2026-01-01T00:00:00Z",
        blocks: [],
        scope: { ...range, articleId: article.id, revision: article.revision },
      }),
      [article, range],
    );
    last.current = measured;
    return { trustedView: last.current };
  },
}));

// One page per window — the paginator covers the whole measured scope, so
// every window boundary is ALSO a page boundary (the sharpest version of
// the window-vs-chapter classification the seam must get right).
vi.mock("../../src/pagination/fragment", () => ({
  paginateDocument: ({ measurement }: { measurement: MeasurementResult }) => {
    const scope = measurement.scope!;
    const start = scope.startGrapheme ?? 0;
    const end = scope.endGrapheme ?? 16000;
    return {
      schemaVersion: 1,
      status: "ok",
      pages: [
        {
          schemaVersion: 1,
          pageIndex: 0,
          blocks: [{ blockIndex: 0, startGrapheme: start, endGrapheme: end }],
        },
      ],
    };
  },
}));

import { ArticleSchema } from "../../src/content/schema";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import { WindowedPaginatedSurface } from "../../src/reader/WindowedPaginatedSurface";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

const article = ArticleSchema.parse({
  id: "bc-giant-chapter",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Giant chapter",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "book-boundary",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(16000), marks: [] }] }],
});

interface MountOptions {
  hasPreviousWindow?: boolean;
  hasNextWindow?: boolean;
}

function mount(options: MountOptions = {}) {
  const articleEl = document.createElement("article");
  const viewport = document.createElement("div");
  viewport.className = "page-viewport";
  viewport.getBoundingClientRect = () => ({ height: 600, top: 0 }) as DOMRect;
  Object.defineProperty(viewport, "clientHeight", { value: 600 });
  articleEl.appendChild(viewport);
  document.body.appendChild(articleEl);
  const ref = createRef<PaginatedSurfaceHandle>();
  const diagnostics = new DiagnosticBus();
  const onBoundaryTurn = vi.fn();
  const onUserTurn = vi.fn();
  const element = () => (
    <WindowedPaginatedSurface
      ref={ref}
      article={article}
      articleEl={articleEl}
      diagnostics={diagnostics}
      hasPreviousWindow={options.hasPreviousWindow}
      hasNextWindow={options.hasNextWindow}
      onBoundaryTurn={onBoundaryTurn}
      onUserTurn={onUserTurn}
    />
  );
  const result = render(element(), { container: viewport });
  return {
    ...result,
    ref,
    onBoundaryTurn,
    chevronNext: () => viewport.querySelector<HTMLElement>(".page-turn-next"),
    chevronPrevious: () => viewport.querySelector<HTMLElement>(".page-turn-previous"),
    refresh: () => result.rerender(element()),
  };
}

beforeEach(() => {
  window.location.hash = "";
});

describe("windowed surface — window ends are not chapter ends (issue #238)", () => {
  it("crosses an internal window boundary WITHOUT the outer seam, even when the book continues", async () => {
    const view = mount({ hasPreviousWindow: true, hasNextWindow: true });
    await waitFor(() => expect(view.ref.current?.getState()?.total).toBe(1));
    expect(view.ref.current!.getCurrentAnchorOffset()).toBe(0);

    let next!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      next = view.ref.current!.turnAsync!("next");
    });
    const result = await act(async () => await next);
    // The internal crossing moved the canonical anchor into window 2 — the
    // terminal window's only page, so pageAnchorOffset's shipped end-pin
    // rule reports the work end (16000), not the page start (anchor.ts:
    // "a one-page terminal window of a multi-window work can finish the
    // work"). The coordinate claim is: the reader LEFT window 1.
    expect(view.ref.current!.getCurrentAnchorOffset()).toBe(16000);
    expect(view.ref.current!.containsOffset!(0)).toBe(false);
    // …and never consulted the chapter/book seam.
    expect(view.onBoundaryTurn).not.toHaveBeenCalled();
    void result;
  });

  it("at the TRUE chapter end the turn delegates outward instead of moving", async () => {
    const view = mount({ hasNextWindow: true });
    await waitFor(() => expect(view.ref.current?.getState()?.total).toBe(1));
    // Walk to the last window's only page.
    let step!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      step = view.ref.current!.turnAsync!("next");
    });
    await act(async () => await step);
    // The terminal window's page pins the work end (pageAnchorOffset —
    // anchor.ts) while atEnd marks the true chapter end.
    expect(view.ref.current!.getCurrentAnchorOffset()).toBe(16000);

    let last!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      last = view.ref.current!.turnAsync!("next");
    });
    const result = await act(async () => await last);
    // No further window exists: the OUTER seam owns the turn (the host
    // crosses to the next chapter), and this surface stays put.
    expect(view.onBoundaryTurn).toHaveBeenCalledTimes(1);
    expect(view.onBoundaryTurn).toHaveBeenCalledWith("next");
    expect(view.ref.current!.getCurrentAnchorOffset()).toBe(16000);
    expect(result?.moved).toBe(false);
    // The anchor stays truthful: the terminal window's shipped end-pin
    // (pageAnchorOffset — anchor.ts), never a fake re-pin past the turn.
    expect(view.ref.current!.getState()?.atEnd).toBe(true);
  });

  it("at the TRUE chapter start a backward turn delegates outward", async () => {
    const view = mount({ hasPreviousWindow: true });
    await waitFor(() => expect(view.ref.current?.getState()?.total).toBe(1));
    let prev!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      prev = view.ref.current!.turnAsync!("previous");
    });
    const result = await act(async () => await prev);
    expect(view.onBoundaryTurn).toHaveBeenCalledTimes(1);
    expect(view.onBoundaryTurn).toHaveBeenCalledWith("previous");
    expect(result?.moved).toBe(false);
    expect(view.ref.current!.getCurrentAnchorOffset()).toBe(0);
  });

  it("the book-level availability keeps the chevrons enabled at window-final boundaries", async () => {
    const view = mount({ hasPreviousWindow: true, hasNextWindow: true });
    await waitFor(() => expect(view.ref.current?.getState()?.total).toBe(1));
    // First window, first page: the book has a previous chapter, so the
    // Previous chevron must NOT be disabled even though this window starts
    // the chapter.
    expect(view.chevronPrevious()?.getAttribute("aria-disabled")).toBe("false");
    // At the last window (still first page of it), the book continues.
    let step!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      step = view.ref.current!.turnAsync!("next");
    });
    await act(async () => await step);
    expect(view.chevronNext()?.getAttribute("aria-disabled")).toBe("false");
    expect(view.chevronPrevious()?.getAttribute("aria-disabled")).toBe("false");
  });

  it("without book-level availability the true end stays a no-op (back-compat)", async () => {
    const view = mount({});
    await waitFor(() => expect(view.ref.current?.getState()?.total).toBe(1));
    let step!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      step = view.ref.current!.turnAsync!("next");
    });
    await act(async () => await step);
    let last!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      last = view.ref.current!.turnAsync!("next");
    });
    const result = await act(async () => await last);
    expect(view.onBoundaryTurn).not.toHaveBeenCalled();
    expect(result?.moved).toBe(false);
    // The child chevron stays honestly disabled: no next chapter exists.
    expect(view.chevronNext()?.getAttribute("aria-disabled")).toBe("true");
  });
});
