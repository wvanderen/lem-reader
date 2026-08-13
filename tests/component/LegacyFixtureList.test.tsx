// tests/component/LegacyFixtureList.test.tsx
// Component tests for the legacy fixture-list route (DOC-01). Preserved for
// reference alongside src/routes/LegacyFixtureList.tsx after the Plan 08-03
// swap to LibraryView. The byte-stable invariants (Saved articles heading,
// Open article links, loading/error copy) are now ALSO covered by LibraryView
// + the v1.0 e2e suite (happy-path.spec L93 + open-every-fixture.spec L65-69);
// this file stays as the legacy component's dedicated isolation test.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the module, then drive it via vi.mocked(listArticles).
vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

import { FixtureList } from "../../src/routes/LegacyFixtureList";
import { listArticles } from "../../src/content/repository";
import type { CanonicalArticle } from "../../src/content/types";

const listArticlesMock = vi.mocked(listArticles);

const stubArticle = (id: string, title: string): CanonicalArticle => ({
  id,
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: `https://example.com/${id}`,
    title,
    author: "An Author",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
  footnotes: [],
});

beforeEach(() => {
  listArticlesMock.mockReset();
});

describe("FixtureList (DOC-01)", () => {
  it("renders the page title 'Saved articles'", async () => {
    listArticlesMock.mockResolvedValue([]);
    render(<FixtureList />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).not.toBeNull();
    await waitFor(() => expect(listArticlesMock).toHaveBeenCalled());
  });

  it("renders one row per fixture, each with an 'Open article' link", async () => {
    listArticlesMock.mockResolvedValue([
      stubArticle("a-one", "Article One"),
      stubArticle("a-two", "Article Two"),
    ]);
    const { container } = render(<FixtureList />);
    // Wait for the ready state (rows appear after the promise resolves).
    await screen.findByText("Article One");
    // Each article link targets #/article/<id>; count matches the fixture count.
    const links = container.querySelectorAll<HTMLAnchorElement>('a[href^="#/article/"]');
    expect(links.length).toBe(2);
    for (const link of links) {
      // The link's visible text is the "Open article" CTA.
      expect(link.textContent).toContain("Open article");
      // aria-labelledby points at a real id present in the document (the row's
      // title h2). This gives each link a distinct accessible name (the article
      // title) instead of a generic "Open article" repeated N times.
      const labelledBy = link.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).not.toBeNull();
    }
  });

  it("shows 'Opening article…' in the status region while loading", () => {
    // Never resolves — keeps the component in the loading state.
    listArticlesMock.mockReturnValue(new Promise<CanonicalArticle[]>(() => {}));
    render(<FixtureList />);
    expect(screen.getByText("Opening article…")).not.toBeNull();
  });

  it("shows the error copy when listArticles rejects", async () => {
    listArticlesMock.mockRejectedValue(new Error("boom"));
    render(<FixtureList />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't open this article.")).not.toBeNull();
    });
    expect(screen.getByText(/The article could not be loaded/)).not.toBeNull();
    // 07-06: FixtureList now mounts <IngestControl /> above the list, which
    // carries its own .status live region. The list's .status region is
    // still present — assert at least one role=status exists (getAllByRole
    // accommodates the two without changing the existing assertion intent).
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when the list resolves with no articles", async () => {
    listArticlesMock.mockResolvedValue([]);
    render(<FixtureList />);
    expect(await screen.findByRole("heading", { level: 2, name: "No articles yet" })).not.toBeNull();
  });
});
