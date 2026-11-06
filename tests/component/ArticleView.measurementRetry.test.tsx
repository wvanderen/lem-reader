// The reader's retry must restart failed measurement even before a surface exists.
// DOM measurements/font readiness are controlled; layout truth stays in Playwright.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleSchema } from "../../src/content/schema";
import { ArticleView } from "../../src/routes/ArticleView";
import { openArticle } from "../../src/content/repository";
import { measureAllBlocks } from "../../src/measurement/domMeasurer";
import { SettingsProvider } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { SETTINGS_MIRROR_KEY } from "../../src/settings/settingsMirror";

vi.mock("../../src/content/repository", () => ({ listArticles: vi.fn(), openArticle: vi.fn() }));
vi.mock("../../src/persistence/locationStore", async (original) => ({
  ...(await original<typeof import("../../src/persistence/locationStore")>()),
  loadLocation: vi.fn(async () => ({ ok: true, location: null })),
}));
vi.mock("../../src/measurement/fontGate", async (original) => ({
  ...(await original<typeof import("../../src/measurement/fontGate")>()),
  awaitFontsReady: vi.fn(async () => {}),
}));
vi.mock("../../src/measurement/domMeasurer", async (original) => ({
  ...(await original<typeof import("../../src/measurement/domMeasurer")>()),
  measureAllBlocks: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 1024, height: 0 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.mocked(measureAllBlocks).mockReset();
  localStorage.setItem(
    SETTINGS_MIRROR_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, readingMode: "paginated" }),
  );
  delete (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("measurement failure recovery", () => {
  for (const blockCount of [1, 40]) {
    it(`Try pages again recovers initial ${blockCount === 1 ? "whole-article" : "windowed"} measurement`, async () => {
      const article = ArticleSchema.parse({
        id: `retry-${blockCount}`,
        revision: 1,
        lang: "en",
        provenance: {
          title: "Retry measurement",
          retrievedAt: "2026-01-01T00:00:00Z",
          originalHtmlHash: "retry-measurement-v1",
        },
        blocks: Array.from({ length: blockCount }, (_, i) => ({
          kind: "paragraph",
          content: [{ text: `Passage ${i}.`, marks: [] }],
        })),
      });
      vi.mocked(openArticle).mockResolvedValue(article);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: 1024,
        height: 0,
        top: 0,
        bottom: 0,
        left: 0,
        right: 1024,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      // No trusted view is committed before the user chooses retry.
      vi.mocked(measureAllBlocks).mockRejectedValue(new Error("transient measurement failure"));
      render(
        <SettingsProvider>
          <ArticleView
            articleId={article.id}
            modeToggleHandlerRef={createRef()}
            drawerOpen={false}
            onCloseDrawer={() => {}}
            tagsOpen={false}
            onCloseTags={() => {}}
            tocOpen={false}
            onCloseToc={() => {}}
            onAnnotationCountChange={() => {}}
            hasAppHistory={false}
          />
        </SettingsProvider>,
      );
      await screen.findByText("Preparing this article as pages didn't finish.");
      expect(
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints,
      ).toBeUndefined();
      const attempts = vi.mocked(measureAllBlocks).mock.calls.length;
      vi.mocked(measureAllBlocks).mockImplementation(async (root) =>
        Array.from(root.querySelectorAll("[data-block-index]"), () => ({
          kind: "paragraph" as const,
          heightPx: 30,
          lineCount: 1,
          lineBoxes: [],
        })),
      );
      await userEvent.click(screen.getByRole("button", { name: "Try pages again" }));
      await waitFor(() => {
        expect(vi.mocked(measureAllBlocks).mock.calls.length).toBeGreaterThan(attempts);
        expect(
          (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints,
        ).toBeDefined();
      });
      expect(document.querySelector("article.article-body")).toHaveClass("paginated-surface");
      expect(screen.queryByText("Preparing this article as pages didn't finish.")).toBeNull();
    });
  }
});
