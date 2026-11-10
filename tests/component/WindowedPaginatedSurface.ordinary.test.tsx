// Publication/routing regression, not layout evidence: the real paginator
// consumes synthetic settled measurements. Browsers own actual line geometry.
import { createRef, useMemo } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { CanonicalArticle } from "../../src/content/types";
import type { BlockWindow } from "../../src/pagination/blockWindow";
import type { MeasurementResult } from "../../src/measurement/types";

vi.mock("../../src/measurement/useMeasurement", () => ({
  useMeasurement: (article: CanonicalArticle, _ref: unknown, scope: BlockWindow) => ({
    trustedView: useMemo<MeasurementResult>(
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
        scope: { ...scope, articleId: article.id, revision: article.revision },
        blocks: article.blocks.slice(scope.startBlock, scope.endBlock).map(() => ({
          kind: "paragraph",
          heightPx: 60,
          lineCount: 1,
          lineBoxes: [],
        })),
      }),
      [article, scope],
    ),
  }),
}));

import { ArticleSchema } from "../../src/content/schema";
import { blockWindows } from "../../src/pagination/blockWindow";
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import { WindowedPaginatedSurface } from "../../src/reader/WindowedPaginatedSurface";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

function mount(article: CanonicalArticle, height: number, windows?: readonly BlockWindow[]) {
  const articleEl = document.createElement("article");
  const viewport = document.createElement("div");
  viewport.className = "page-viewport";
  viewport.getBoundingClientRect = () => ({ height, top: 0 }) as DOMRect;
  Object.defineProperty(viewport, "clientHeight", { value: height });
  articleEl.appendChild(viewport);
  document.body.appendChild(articleEl);
  const ref = createRef<PaginatedSurfaceHandle>();
  const mounted = render(
    <WindowedPaginatedSurface
      ref={ref}
      article={article}
      articleEl={articleEl}
      windows={windows}
      diagnostics={new DiagnosticBus()}
    />,
    { container: viewport },
  );
  return {
    ref,
    viewport,
    cleanup: () => {
      mounted.unmount();
      articleEl.remove();
    },
  };
}

it("settles a backward tile jump whose target is a trailing block separator", async () => {
  const article = ArticleSchema.parse({
    id: "separator-restore",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Separators",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "separators",
    },
    blocks: Array.from({ length: 64 }, (_, i) => ({
      kind: "paragraph",
      content: [{ text: `Passage ${i}.` }],
    })),
  });
  const { ref, cleanup } = mount(article, 240, blockWindows(article));
  try {
    await waitFor(() => expect(ref.current?.getState()?.total).toBe(8));
    for (let i = 0; i < 8; i++) {
      const moved = vi.fn();
      act(() => {
        void ref.current!.turnAsync!("next").then(moved);
      });
      await waitFor(() => expect(moved).toHaveBeenCalledTimes(1));
    }
    expect(ref.current!.getState()?.windowStart).toBe(32);
    // Start the request without awaiting inside act: a broken pending promise
    // must fail the assertion rather than deadlock React's commit flush.
    const settled = vi.fn();
    act(() => {
      void ref.current!.turnAsync!("previous").then(settled);
    });
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(ref.current!.getState()).toMatchObject({ windowStart: 0, page: 8 });
  } finally {
    cleanup();
  }
});

it.each([100, 325])(
  "publishes all 25 ordinary pages from %i rows without internal-window resets",
  async (rows) => {
    const article = ArticleSchema.parse({
      id: "ordinary-25",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Ordinary",
        retrievedAt: "2026-01-01T00:00:00Z",
        originalHtmlHash: "ordinary",
      },
      blocks: Array.from({ length: rows }, (_, i) => ({
        kind: "paragraph",
        content: [{ text: `Passage ${i}.` }],
      })),
    });
    const { ref, viewport, cleanup } = mount(article, (rows / 25) * 60);
    try {
      await waitFor(() => expect(ref.current?.getState()?.total).toBe(25));
      for (let page = 1; page <= 25; page++) {
        expect(ref.current?.getState()).toMatchObject({ page, total: 25, scopeLabel: undefined });
        expect(viewport.querySelector(".page-indicator")?.textContent).toBe(`${page} of 25`);
        if (page < 25)
          await act(async () => {
            await ref.current!.turnAsync!("next");
          });
      }
      expect(ref.current?.getState()?.atEnd).toBe(true);
      expect(viewport.textContent).not.toContain("portion");
    } finally {
      cleanup();
    }
  },
);
