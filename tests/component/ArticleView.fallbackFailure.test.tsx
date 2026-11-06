// tests/component/ArticleView.fallbackFailure.test.tsx
// Issue #240 — ArticleView's DiagnosticBus subscription classifies failures
// through paginationFailure.ts instead of showing one generic banner:
//   - unpageable-content: the disclosed session flip to scrolling happens
//     (article element class reverts; the persisted preference is untouched
//     — e2e owns IndexedDB, this test owns the class flip);
//   - processing-error: NO flip — the reader keeps their selected mode;
//     "Try pages again" re-runs pagination (banner clears); "Read in
//     scrolling" is an explicit session-scoped escape;
//   - the banner carries the article's original-source escape route when a
//     source URL exists.
// jsdom note: measurement never settles without layout, so paginated mode
// stays in the pending placeholder — exactly the shipped harness discipline
// (tests/component/ArticleView.test.tsx G4 note). The DEV __lemDiagnosticBus
// hook is the ONE sanctioned injection seam (T-04-17).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

vi.mock("../../src/persistence/locationStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/persistence/locationStore")>();
  return { ...actual, loadLocation: vi.fn() };
});

import { ArticleView } from "../../src/routes/ArticleView";
import { openArticle } from "../../src/content/repository";
import { loadLocation } from "../../src/persistence/locationStore";
import type { CanonicalArticle } from "../../src/content/types";
import { SettingsProvider } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { SETTINGS_MIRROR_KEY } from "../../src/settings/settingsMirror";

const openArticleMock = vi.mocked(openArticle);
const loadLocationMock = vi.mocked(loadLocation);

type Bus = { emit: (event: unknown) => void; recent: () => unknown[] };

async function renderPaginatedArticle(article?: CanonicalArticle): Promise<void> {
  const full =
    article ??
    ({
      id: "stub-article",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/posts/stub",
        title: "Stub Article",
        author: "Stub Author",
        publishedAt: "2026-01-15T00:00:00Z",
        retrievedAt: "2026-07-28T00:00:00Z",
        originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "A section", marks: [] }] },
        { kind: "paragraph", content: [{ text: "A body paragraph.", marks: [] }] },
      ],
      footnotes: [],
    } satisfies CanonicalArticle);
  openArticleMock.mockResolvedValue(full);
  loadLocationMock.mockResolvedValue({ ok: true, location: null });
  render(
    <SettingsProvider>
      <ArticleView
        articleId={full.id}
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
  await screen.findByRole("heading", { level: 1, name: "Stub Article" });
  await waitFor(
    () => {
      const bus = (window as unknown as Record<string, unknown>).__lemDiagnosticBus as
        Bus | undefined;
      if (!bus) throw new Error("diagnostic bus not mounted yet");
    },
    { timeout: 4000 },
  );
}

function emitFallback(reason?: string): void {
  const bus = (window as unknown as Record<string, unknown>).__lemDiagnosticBus as Bus;
  act(() => {
    bus.emit({
      kind: "dom-fallback",
      ts: new Date().toISOString(),
      ...(reason !== undefined ? { reason } : {}),
    });
  });
}

const articleEl = (): HTMLElement => document.querySelector("article.article-body")!;

beforeEach(() => {
  openArticleMock.mockReset();
  loadLocationMock.mockReset();
  localStorage.setItem(
    SETTINGS_MIRROR_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, readingMode: "paginated" }),
  );
});

describe("ArticleView pagination failure classes (issue #240)", () => {
  it("an unpageable-content fallback flips the session to scrolling and says so", async () => {
    await renderPaginatedArticle();
    expect(articleEl().className).toContain("paginated-surface");
    emitFallback("oversized-block");
    const banner = await screen.findByText(
      "An element in this article is too large to fit on one page.",
    );
    expect(banner).toBeInTheDocument();
    // The disclosed session flip: the article element reverts to scrolling.
    expect(articleEl().className).not.toContain("paginated-surface");
    // The reversible way back + the original-source escape route.
    expect(screen.getByRole("button", { name: "Switch to pages" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See the original/ })).toBeInTheDocument();
    // Retry controls belong to processing errors only.
    expect(screen.queryByRole("button", { name: "Try pages again" })).toBeNull();
  });

  it("a processing-error fallback does NOT flip the mode; retry clears the banner", async () => {
    await renderPaginatedArticle();
    emitFallback("zero-progress");
    expect(
      await screen.findByText("Preparing this article as pages didn't finish."),
    ).toBeInTheDocument();
    // Explicit + distinct: the reader keeps their selected mode.
    expect(articleEl().className).toContain("paginated-surface");
    expect(screen.queryByText(/Switched to scrolling/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try pages again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read in scrolling" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try pages again" }));
    await waitFor(() => {
      expect(screen.queryByText("Preparing this article as pages didn't finish.")).toBeNull();
    });
    // Still paginated after the retry.
    expect(articleEl().className).toContain("paginated-surface");
  });

  it("an unknown fallback reason never claims a specific content limit and never flips", async () => {
    await renderPaginatedArticle();
    emitFallback("some-future-guard");
    expect(
      await screen.findByText("Preparing this article as pages didn't finish."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/too large|too long|divided/)).toBeNull();
    expect(articleEl().className).toContain("paginated-surface");
  });

  it("Read in scrolling is an explicit session escape that does not claim a switch happened", async () => {
    await renderPaginatedArticle();
    emitFallback("measurement-scope-mismatch");
    await screen.findByText("Preparing this article as pages didn't finish.");
    await userEvent.click(screen.getByRole("button", { name: "Read in scrolling" }));
    // The reader chose scrolling: the element reverts, the banner clears.
    await waitFor(() => {
      expect(articleEl().className).not.toContain("paginated-surface");
    });
    expect(screen.queryByText("Preparing this article as pages didn't finish.")).toBeNull();
  });

  it("a measurement-error event classifies as a processing failure without the raw message", async () => {
    await renderPaginatedArticle();
    const bus = (window as unknown as Record<string, unknown>).__lemDiagnosticBus as Bus;
    act(() => {
      bus.emit({
        kind: "measurement-error",
        message: "measureAllBlocks found 0 elements",
        ts: new Date().toISOString(),
      });
    });
    expect(
      await screen.findByText("Preparing this article as pages didn't finish."),
    ).toBeInTheDocument();
    expect(screen.queryByText("measureAllBlocks found 0 elements")).toBeNull();
    expect(articleEl().className).toContain("paginated-surface");
  });
});
