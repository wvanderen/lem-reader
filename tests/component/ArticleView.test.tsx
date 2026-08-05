// tests/component/ArticleView.test.tsx
// Component tests for the article-view route (DOC-03 provenance header +
// source-URL link reverse-tabnabbing defense; DOC-06 disclosure rendered by
// the body). The repository seam (openArticle) is mocked so the test asserts
// COMPONENT behavior in isolation.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the module, then drive it via vi.mocked(openArticle).
vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

import { ArticleView } from "../../src/routes/ArticleView";
import { openArticle } from "../../src/content/repository";
import type { CanonicalArticle } from "../../src/content/types";
import { SettingsProvider } from "../../src/settings/SettingsContext";

const openArticleMock = vi.mocked(openArticle);

/**
 * ArticleView now mounts useMeasurement (Phase 3), which calls useSettings —
 * so component tests must render inside <SettingsProvider> or the hook
 * throws. DEFAULT_SETTINGS + an in-memory provider are sufficient: the
 * measurement engine runs but its commit lands in DEV-only debug state,
 * not in any element this test asserts on.
 */
function renderWithProvider(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

const fullArticle = (): CanonicalArticle => ({
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
    // The body starts at h2 — the article title h1 is rendered once by
    // ArticleView from provenance (one h1 per page, a11y best practice).
    { kind: "heading", level: 2, content: [{ text: "A section", marks: [] }] },
    { kind: "paragraph", content: [{ text: "A body paragraph.", marks: [] }] },
  ],
  footnotes: [],
});

beforeEach(() => {
  openArticleMock.mockReset();
});

describe("ArticleView (DOC-03)", () => {
  it("renders the article title in an <h1>", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView articleId="stub-article" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Stub Article" })).not.toBeNull();
  });

  it("renders a safe source-URL link (target=_blank, rel=noopener noreferrer)", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView articleId="stub-article" />);
    const link = await screen.findByRole("link", { name: /Originally published at/ });
    expect(link).not.toBeNull();
    expect(link.getAttribute("target")).toBe("_blank");
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    expect(link.getAttribute("href")).toBe("https://example.com/posts/stub");
  });

  it("includes a visually-hidden 'opens in a new tab' announcement", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView articleId="stub-article" />);
    expect(await screen.findByText(/opens in a new tab/i)).not.toBeNull();
  });

  it("does NOT render a Footnotes region when the article has no footnotes", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView articleId="stub-article" />);
    await screen.findByRole("heading", { level: 1, name: "Stub Article" });
    expect(screen.queryByRole("region", { name: "Footnotes" })).toBeNull();
  });

  it("shows 'Opening article…' while loading", () => {
    openArticleMock.mockReturnValue(new Promise<CanonicalArticle | null>(() => {}));
    renderWithProvider(<ArticleView articleId="stub-article" />);
    expect(screen.getByText("Opening article…")).not.toBeNull();
  });

  it("shows the error copy when openArticle rejects", async () => {
    openArticleMock.mockRejectedValue(new Error("boom"));
    renderWithProvider(<ArticleView articleId="stub-article" />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't open this article.")).not.toBeNull();
    });
    expect(screen.getByText(/The article could not be loaded/)).not.toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("shows the error copy when openArticle resolves null (article not found)", async () => {
    openArticleMock.mockResolvedValue(null);
    renderWithProvider(<ArticleView articleId="does-not-exist" />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't open this article.")).not.toBeNull();
    });
    expect(screen.getByText(/The article could not be loaded/)).not.toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });
});
