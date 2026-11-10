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
import { DiagnosticBus } from "../../src/measurement/diagnostics";
import { WindowedPaginatedSurface } from "../../src/reader/WindowedPaginatedSurface";
import type { PaginatedSurfaceHandle } from "../../src/reader/PaginatedSurface";

it("publishes all 25 ordinary pages without internal-window resets", async () => {
  const article = ArticleSchema.parse({
    id: "ordinary-25",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Ordinary",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "ordinary",
    },
    blocks: Array.from({ length: 100 }, (_, i) => ({
      kind: "paragraph",
      content: [{ text: `Passage ${i}.` }],
    })),
  });
  const articleEl = document.createElement("article");
  const viewport = document.createElement("div");
  viewport.className = "page-viewport";
  viewport.getBoundingClientRect = () => ({ height: 240, top: 0 }) as DOMRect;
  Object.defineProperty(viewport, "clientHeight", { value: 240 });
  articleEl.appendChild(viewport);
  document.body.appendChild(articleEl);
  const ref = createRef<PaginatedSurfaceHandle>();
  const mounted = render(
    <WindowedPaginatedSurface
      ref={ref}
      article={article}
      articleEl={articleEl}
      diagnostics={new DiagnosticBus()}
    />,
    { container: viewport },
  );
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
    mounted.unmount();
    articleEl.remove();
  }
});
