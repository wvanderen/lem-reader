// UI glue only: synthetic trusted measurement and pagination evidence replace
// browser layout. Real geometry/overflow truth belongs to Playwright.
import { createRef, useMemo, useRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementResult } from "../../src/measurement/types";
import type { BlockWindow } from "../../src/pagination/blockWindow";
import type { CanonicalArticle } from "../../src/content/types";

const gate = vi.hoisted(() => ({
  hold: false,
  sourceCapacity: true,
  overflow: false,
  onCapacity: undefined as
    ((cursor: { blockIndex: number; startGrapheme: number }) => void) | undefined,
}));
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
    if (!gate.hold) last.current = measured;
    return { trustedView: last.current };
  },
}));
vi.mock("../../src/pagination/fragment", () => ({
  paginateDocument: ({ measurement }: { measurement: MeasurementResult }) => {
    const scope = measurement.scope!;
    const start = scope.startGrapheme ?? 0;
    const end = scope.endGrapheme ?? 16000;
    const limit =
      start === 0
        ? 4000
        : start === 4000
          ? 6000
          : start === 8000
            ? 12000
            : start === 12000
              ? 14000
              : end;
    const cut = gate.sourceCapacity ? Math.min(end, limit) : end;
    return {
      schemaVersion: 1,
      status: "ok",
      pages: (scope.includeFootnotes && !gate.sourceCapacity
        ? [0, 9000, 14000]
        : [start, (start + cut) / 2]
      ).map((from, i, starts) => ({
        schemaVersion: 1,
        pageIndex: i,
        blocks: [{ blockIndex: 0, startGrapheme: from, endGrapheme: starts[i + 1] ?? cut }],
      })),
      ...(cut < end ? { continuation: { blockIndex: 0, startGrapheme: cut } } : {}),
    };
  },
}));

vi.mock("../../src/pagination/overflowGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/pagination/overflowGuard")>();
  return {
    ...actual,
    refragmentOverflowingPage: (opts: Parameters<typeof actual.refragmentOverflowingPage>[0]) => {
      gate.onCapacity = opts.onCapacity;
      if (
        gate.overflow &&
        opts.pages[0]?.blocks[0]?.startGrapheme === 0 &&
        opts.pages.at(-1)?.blocks.at(-1)?.endGrapheme === 8000
      ) {
        gate.overflow = false;
        opts.onCapacity?.({ blockIndex: 0, startGrapheme: 4000 });
        return [0, 2000].map((start, i) => ({
          schemaVersion: 1 as const,
          pageIndex: i,
          blocks: [{ blockIndex: 0, startGrapheme: start, endGrapheme: start + 2000 }],
        }));
      }
      return actual.refragmentOverflowingPage(opts);
    },
  };
});

import { ArticleSchema } from "../../src/content/schema";
import { blockWindows } from "../../src/pagination/blockWindow";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import { WindowedPaginatedSurface } from "../../src/reader/WindowedPaginatedSurface";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

const article = ArticleSchema.parse({
  id: "capacity-reader",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Capacity reader",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "capacity",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "x".repeat(16000), marks: [] }] }],
});

function mount(wholeArticle = false) {
  const articleEl = document.createElement("article");
  const viewport = document.createElement("div");
  viewport.className = "page-viewport";
  viewport.getBoundingClientRect = () => ({ height: 600, top: 0 }) as DOMRect;
  Object.defineProperty(viewport, "clientHeight", { value: 600 });
  articleEl.appendChild(viewport);
  document.body.appendChild(articleEl);
  const ref = createRef<PaginatedSurfaceHandle>();
  const diagnostics = new DiagnosticBus();
  const onAnchorChange = vi.fn();
  const element = () => (
    <WindowedPaginatedSurface
      windows={wholeArticle ? undefined : blockWindows(article)}
      ref={ref}
      article={article}
      articleEl={articleEl}
      diagnostics={diagnostics}
      onAnchorChange={onAnchorChange}
    />
  );
  const result = render(element(), { container: viewport });
  return { ...result, ref, diagnostics, onAnchorChange, refresh: () => result.rerender(element()) };
}

beforeEach(() => {
  gate.hold = false;
  gate.sourceCapacity = true;
  gate.overflow = false;
  gate.onCapacity = undefined;
});

describe("capacity-refined reader navigation", () => {
  it("retains a later passage when a whole publication falls back to source tiles", async () => {
    gate.sourceCapacity = false;
    const { ref, onAnchorChange } = mount(true);
    await waitFor(() => expect(ref.current?.getState()?.total).toBe(3));
    act(() => {
      ref.current!.turn("next");
    });
    await waitFor(() => expect(ref.current!.getCurrentAnchorOffset()).toBe(9000));
    await waitFor(() => expect(gate.onCapacity).toBeTypeOf("function"));
    act(() => {
      gate.onCapacity!({ blockIndex: 0, startGrapheme: 12000 });
    });
    await waitFor(() => expect(ref.current!.getPages()?.[0]?.blocks[0]?.startGrapheme).toBe(8000));
    expect(ref.current!.getCurrentAnchorOffset()).toBe(8000);
    expect(onAnchorChange).not.toHaveBeenLastCalledWith(0, "layout");
  });

  it("keeps the prefix usable, turns into a refinement, and returns to its previous source page", async () => {
    const { ref, diagnostics, container } = mount();
    await waitFor(() => expect(ref.current?.getState()?.total).toBe(2));
    expect(ref.current!.getState()?.scopeLabel).toBe("overall-progress");
    expect(container.querySelector(".page-indicator")?.textContent).toBe("0%");
    expect(container.querySelector(".page-start-heading")?.textContent).not.toMatch(/Page|portion/);
    expect(ref.current!.containsOffset!(5000)).toBe(false);
    act(() => {
      ref.current!.turn("next");
    });
    expect(ref.current!.getState()?.atEnd).toBe(false);
    expect(ref.current!.getCurrentAnchorOffset()).toBe(2000);
    let next!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      next = ref.current!.turnAsync!("next");
    });
    await act(async () => {
      await next;
    });
    expect(ref.current!.getCurrentAnchorOffset()).toBe(4000);
    let previous!: typeof next;
    act(() => {
      previous = ref.current!.turnAsync!("previous");
    });
    await act(async () => {
      await previous;
    });
    expect(ref.current!.getCurrentAnchorOffset()).toBe(2000);
    expect(diagnostics.recent()).toEqual([]);
  });

  it("loads the tail yielded by live overflow correction, not the original next source window", async () => {
    gate.sourceCapacity = false;
    gate.overflow = true;
    const { ref, diagnostics } = mount();
    await waitFor(() => expect(ref.current?.containsOffset!(5000)).toBe(false));
    await waitFor(() => {
      expect(ref.current!.getPages()?.at(-1)?.blocks.at(-1)?.endGrapheme).toBe(4000);
      expect(ref.current!.getState()?.total).toBe(2);
    });
    act(() => {
      ref.current!.turn("next");
    });
    await waitFor(() => expect(ref.current!.getCurrentAnchorOffset()).toBe(2000));
    let next!: ReturnType<NonNullable<PaginatedSurfaceHandle["turnAsync"]>>;
    act(() => {
      next = ref.current!.turnAsync!("next");
    });
    await act(async () => {
      await next;
    });
    expect(ref.current!.getCurrentAnchorOffset()).toBe(4000);
    expect(ref.current!.getState()?.atEnd).toBe(false);
    expect(diagnostics.recent()).toEqual([]);
  });

  it("does not republish the same committed anchor when its parent rerenders", async () => {
    const { ref, refresh, onAnchorChange } = mount();
    await waitFor(() => expect(ref.current?.containsOffset!(5000)).toBe(false));
    const calls = onAnchorChange.mock.calls.length;
    act(refresh);
    expect(onAnchorChange).toHaveBeenCalledTimes(calls);
  });

  it("chases capacity refinements for a precise direct jump without falsely completing", async () => {
    const { ref, onAnchorChange } = mount();
    const settled = vi.fn();
    act(() => {
      ref.current!.goToOffset!(7001, settled);
      expect(onAnchorChange).toHaveBeenLastCalledWith(7001, "navigation");
    });
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(ref.current!.containsOffset!(7001)).toBe(true);
    expect(ref.current!.getPages()?.[0]?.blocks[0]?.startGrapheme).toBe(6000);
    expect(ref.current!.getState()?.atEnd).toBe(false);
    expect(ref.current!.getCurrentAnchorOffset()).toBe(7000);
    expect(onAnchorChange.mock.calls.every(([offset]) => offset < 16000)).toBe(true);
    act(() => {
      ref.current!.goToOffset!(16000, settled);
    });
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(2));
    expect(ref.current!.getState()?.atEnd).toBe(true);
    expect(ref.current!.getCurrentAnchorOffset()).toBe(16000);
    act(() => {
      ref.current!.goToOffset!(4000, settled);
      expect(onAnchorChange).toHaveBeenLastCalledWith(4000, "navigation");
    });
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(3));
    expect(ref.current!.getState()?.atEnd).toBe(false);
    expect(ref.current!.getCurrentAnchorOffset()).toBe(4000);
  });

  it("drops a superseded jump while measurement retains the last valid page", async () => {
    const { ref, refresh } = mount();
    const stale = vi.fn();
    const latest = vi.fn();
    gate.hold = true;
    act(() => {
      ref.current!.goToOffset!(7001, stale);
    });
    act(() => {
      ref.current!.goToOffset!(100, latest);
    });
    gate.hold = false;
    act(refresh);
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(stale).not.toHaveBeenCalled();
    expect(ref.current!.getCurrentAnchorOffset()).toBe(0);
    expect(ref.current!.containsOffset!(7001)).toBe(false);
  });
});
