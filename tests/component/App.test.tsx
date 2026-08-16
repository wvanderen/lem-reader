// tests/component/App.test.tsx
// Component tests for the hash router's fragment-vs-route distinction
// (Gap 3 / UAT test 10). The router must treat only "#/"-prefixed hashes as
// app routes; bare fragment anchors (#fn-N, #fn-ref-N, #main) are native
// in-page scroll targets and must NOT swap the view (else the scroll target
// is unmounted before the browser can scroll to it). The repository seam is
// mocked (mirrors FixtureList/ArticleView test conventions) so the test
// asserts ROUTER behavior in isolation from the loader.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the module, then drive it via vi.mocked(...).
vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

import { App, parseHash } from "../../src/App";
import { listArticles, openArticle } from "../../src/content/repository";
import type { CanonicalArticle } from "../../src/content/types";

const listArticlesMock = vi.mocked(listArticles);
const openArticleMock = vi.mocked(openArticle);

const stubArticle = (): CanonicalArticle => ({
  id: "a-one",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/a-one",
    title: "Article One",
    author: "An Author",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
  footnotes: [],
});

const article = stubArticle();

beforeEach(() => {
  listArticlesMock.mockReset();
  openArticleMock.mockReset();
  // jsdom persists window.location across tests in the same file — reset the
  // hash so each test starts from a known location.
  window.location.hash = "";
});

describe("parseHash — route parser (unit)", () => {
  it("maps '#/article/<id>' to the article view", () => {
    window.location.hash = "#/article/a-one";
    expect(parseHash()).toEqual({ name: "article", id: "a-one" });
  });

  it("maps an empty hash to the list view", () => {
    window.location.hash = "";
    expect(parseHash()).toEqual({ name: "list" });
  });

  it("maps a bare '#/' to the list view", () => {
    window.location.hash = "#/";
    expect(parseHash()).toEqual({ name: "list" });
  });

  it("maps an unrecognized route hash to the list view", () => {
    window.location.hash = "#/article/"; // trailing slash — no id capture
    expect(parseHash()).toEqual({ name: "list" });
    window.location.hash = "#/unknown/route";
    expect(parseHash()).toEqual({ name: "list" });
  });

  // Plan 10-02 (D10-03, RECV-01.h) — the /h/ deep-link grammar + the
  // #/review route. Strengthen-only: every case above stays byte-stable.
  it("maps '#/article/<id>/h/<highlightId>' to the article view with jumpHighlightId", () => {
    window.location.hash = "#/article/a-one/h/hl-123";
    expect(parseHash()).toEqual({
      name: "article",
      id: "a-one",
      jumpHighlightId: "hl-123",
    });
  });

  it("maps '#/article/<id>/h/' (trailing slash, empty id) to the list view", () => {
    // The optional /h/ group requires [^/]+ — an empty capture fails the
    // group AND the $ anchor, so the whole regex misses and the parser
    // falls through to the list fallback. This documents that behavior.
    window.location.hash = "#/article/a-one/h/";
    expect(parseHash()).toEqual({ name: "list" });
  });

  it("maps '#/review' to the review view", () => {
    window.location.hash = "#/review";
    expect(parseHash()).toEqual({ name: "review" });
  });

  it("maps '#/review/x' (unknown sub-route) to the list view", () => {
    window.location.hash = "#/review/x";
    expect(parseHash()).toEqual({ name: "list" });
  });
});

describe("App — fragment hashes do not swap the view (Gap 3)", () => {
  it("a '#fn-1' hashchange does NOT unmount the article view", async () => {
    listArticlesMock.mockResolvedValue([article]);
    openArticleMock.mockResolvedValue(article);

    // Start on the article route.
    window.location.hash = "#/article/a-one";
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Article One" });

    // A bare fragment hash must NOT trigger a route swap. In jsdom, assigning
    // window.location.hash may not fire hashchange synchronously, so dispatch
    // the event explicitly (Event is sufficient — the handler reads the hash
    // directly; HashChangeEvent is not required).
    window.location.hash = "#fn-1";
    window.dispatchEvent(new Event("hashchange"));

    // Article stays mounted (h1 still present); the fixture list is NOT
    // rendered ("Saved articles" h1 absent).
    expect(screen.getByRole("heading", { level: 1, name: "Article One" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Saved articles" })).toBeNull();
  });

  it("a '#fn-ref-1' hashchange does NOT unmount the article view", async () => {
    listArticlesMock.mockResolvedValue([article]);
    openArticleMock.mockResolvedValue(article);

    window.location.hash = "#/article/a-one";
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Article One" });

    window.location.hash = "#fn-ref-1";
    window.dispatchEvent(new Event("hashchange"));

    expect(screen.getByRole("heading", { level: 1, name: "Article One" })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Saved articles" })).toBeNull();
  });
});

describe("App — route hashes still swap the view", () => {
  it("a '#/article/<id>' hashchange swaps list → article", async () => {
    listArticlesMock.mockResolvedValue([article]);
    openArticleMock.mockResolvedValue(article);

    // Start on the list (empty hash → list on initial mount).
    window.location.hash = "";
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Saved articles" })).not.toBeNull();

    // Navigate to the article route.
    window.location.hash = "#/article/a-one";
    window.dispatchEvent(new Event("hashchange"));

    await screen.findByRole("heading", { level: 1, name: "Article One" });
    expect(screen.queryByRole("heading", { level: 1, name: "Saved articles" })).toBeNull();
  });
});
