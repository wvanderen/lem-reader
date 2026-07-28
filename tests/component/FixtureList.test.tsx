// tests/component/FixtureList.test.tsx
// Component tests for the fixture-list route (DOC-01). The repository seam is
// mocked so the test asserts the COMPONENT behavior (loading/ready/error copy,
// row count, aria-labelledby wiring) in isolation from the loader.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listArticlesMock = vi.fn();
vi.mock("../../src/content/repository", () => ({
  listArticles: listArticlesMock,
  openArticle: vi.fn(),
}));

import { FixtureList } from "../../src/routes/FixtureList";
import type { CanonicalArticle } from "../../src/content/types";

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
    render(<FixtureList />);
    const links = await screen.findAllByRole("link", { name: "Open article" });
    expect(links.length).toBe(2);
    // Each link's aria-labelledby points at a real id present in the document.
    for (const link of links) {
      const labelledBy = link.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy!)).not.toBeNull();
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
  });

  it("shows the empty state when the list resolves with no articles", async () => {
    listArticlesMock.mockResolvedValue([]);
    render(<FixtureList />);
    expect(await screen.findByRole("heading", { level: 2, name: "No articles yet" })).not.toBeNull();
  });
});
