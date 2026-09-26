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

// Issue #101 — the library snapshot composes EVERY store seam in one
// Promise.all; in jsdom (no IndexedDB in this file) the un-mocked seams
// reject on open, so once the lazy LibraryView chunk lands the snapshot can
// settle ERROR before the pending-load window can be observed. Stub the
// persistence seams resolved-empty (_librarySeams, the shared helper — the
// rest of each module stays real via importOriginal) so the PENDING
// listArticles mock alone owns the load state — the loading-chrome contract
// this file pins.
vi.mock("../../src/persistence/locationStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "loadAllLocations", []);
});
vi.mock("../../src/persistence/highlightsStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "loadAllHighlights", []);
});
vi.mock("../../src/persistence/notesStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "loadAllNotes", []);
});
vi.mock("../../src/persistence/readingSessionsStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "loadAllReadingSessions", []);
});
vi.mock("../../src/persistence/booksStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "listBooks", {
    ok: true,
    books: [],
  });
});
vi.mock("../../src/ingestion/library/tagsStore", async (importOriginal) => {
  const { seamsResolvedEmpty } = await import("./_librarySeams");
  return seamsResolvedEmpty(importOriginal, "loadAllTags", []);
});

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
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  it("maps a bare '#/' to the list view", () => {
    window.location.hash = "#/";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  it("maps an unrecognized route hash to the list view", () => {
    window.location.hash = "#/article/"; // trailing slash — no id capture
    expect(parseHash()).toEqual({ name: "list", view: "all" });
    window.location.hash = "#/unknown/route";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  // Plan 14-02 (D14-12/D14-16) — reading-state view segments are REAL hash
  // routes. Strengthen-only: every case above stays the same grammar
  // contract, extended with the view field; article /h/ and #/review cases
  // stay byte-stable.
  it("maps '#/unread' to the list view with view 'unread'", () => {
    window.location.hash = "#/unread";
    expect(parseHash()).toEqual({ name: "list", view: "unread" });
  });

  it("maps '#/in-progress' to the list view with view 'in-progress'", () => {
    window.location.hash = "#/in-progress";
    expect(parseHash()).toEqual({ name: "list", view: "in-progress" });
  });

  it("maps '#/finished' to the list view with view 'finished'", () => {
    window.location.hash = "#/finished";
    expect(parseHash()).toEqual({ name: "list", view: "finished" });
  });

  it("maps an unknown '#/…' view segment to the All view (D14-16 fallback)", () => {
    // Unknown #/ segments fall back to All — the existing unknown-route →
    // list discipline extended to the view field; no new error surface.
    window.location.hash = "#/unknown-view";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  // Plan 10-02 (D10-03, RECV-01.h) — the /h/ deep-link grammar + the
  // destination route (see the Plan 15-01 Highlights cases below).
  // Strengthen-only: every case above stays byte-stable.
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
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  it("maps '#/review/x' (unknown sub-route) to the list view", () => {
    window.location.hash = "#/review/x";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  // Plan 15-01 (D15-06/D15-07) — the Highlights rename: #/highlights is
  // the CANONICAL route for the destination (the internal grammar name
  // stays "review" — OQ3 resolution: user-facing vocabulary renames, the
  // internal View name does not), and #/review becomes the legacy alias
  // carrying the legacyAlias marker so App's onHash can normalize the URL
  // via history.replaceState (D15-07 — old bookmarks keep working, the
  // grammar keeps ONE canonical form). The superseded 10-02 case
  // ("maps '#/review' to the review view" asserting the plain shape) is
  // folded into the strengthened alias case below — it asserted strictly
  // less than the alias case pins now.
  it("maps '#/highlights' to the review view", () => {
    window.location.hash = "#/highlights";
    expect(parseHash()).toEqual({ name: "review" });
  });

  it("maps '#/review' to the review view with the legacy alias marker", () => {
    window.location.hash = "#/review";
    expect(parseHash()).toEqual({ name: "review", legacyAlias: true });
  });

  it("maps '#/highlights/x' (unknown sub-route) to the list view", () => {
    // The D14-16 fallback discipline extended to the canonical literal:
    // only the exact #/highlights equality routes to the destination.
    window.location.hash = "#/highlights/x";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
  });

  // Issue #76 (decision #72) — the review route's ONE URL-borne scope:
  // `#/highlights?article=<id>`. The `#/path?k=v` grammar; only `article`
  // is read; missing/empty degrades to the unscoped view (no silent
  // garbage — an unknown value is just an id the view reports honestly
  // through the "(deleted article)" chip).
  it("maps '#/highlights?article=<id>' to the review view with the scope id", () => {
    window.location.hash = "#/highlights?article=a-one";
    expect(parseHash()).toEqual({ name: "review", articleId: "a-one" });
  });

  it("maps '#/highlights?article=' (empty value) to the unscoped review view", () => {
    window.location.hash = "#/highlights?article=";
    expect(parseHash()).toEqual({ name: "review" });
  });

  it("maps '#/highlights?foo=bar' (unknown query key) to the unscoped review view", () => {
    window.location.hash = "#/highlights?foo=bar";
    expect(parseHash()).toEqual({ name: "review" });
  });

  it("ignores extra query keys and keeps the article scope", () => {
    window.location.hash = "#/highlights?foo=bar&article=a-one";
    expect(parseHash()).toEqual({ name: "review", articleId: "a-one" });
  });

  it("maps '#/highlights?' (bare question mark) to the unscoped review view", () => {
    window.location.hash = "#/highlights?";
    expect(parseHash()).toEqual({ name: "review" });
  });

  it("maps '#/review?article=<id>' (legacy alias + query) to the list view", () => {
    // The D15-07 alias gains NO query grammar — it stays the exact
    // literal, so an unknown shape falls to the list fallback as always.
    window.location.hash = "#/review?article=a-one";
    expect(parseHash()).toEqual({ name: "list", view: "all" });
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
    // Issue #101 — LibraryView is a lazy route chunk now, so the h1 lands
    // one microtask later (the async chunk import); findByRole observes the
    // SAME contract (library chrome present during the pending load).
    expect(
      await screen.findByRole("heading", { level: 1, name: "Saved articles" }),
    ).not.toBeNull();
    // The feedback aside mounts only after the library load settles, so the
    // link is asserted asynchronously — findByRole retries until the mock
    // resolves. Its pending-load ABSENCE is pinned by the never-settling
    // test at the bottom of this file.
    expect(
      await screen.findByRole("link", {
        name: "Share feedback on GitHub (opens in a new tab)",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/wvanderen/lem-reader/issues/new?template=feature-request.yml&title=%5BFeedback%5D%3A%20",
    );

    // Navigate to the article route.
    window.location.hash = "#/article/a-one";
    window.dispatchEvent(new Event("hashchange"));

    await screen.findByRole("heading", { level: 1, name: "Article One" });
    expect(screen.queryByRole("heading", { level: 1, name: "Saved articles" })).toBeNull();
  });
});

// Quick 260908-nk2 — the library's .project-feedback aside is gated on the
// settled load (status !== "loading" in LibraryView): during the initial
// load the page is short enough that the aside sat INSIDE the viewport and
// the feedback link flashed before rows pushed it below the fold. The
// never-settling mock pins that exact loading window indefinitely; the
// settled-state render is already covered by the converted findByRole
// assertion in the route-swap test above.
describe("App — feedback aside never flashes during the library load", () => {
  it("the feedback link is absent from the DOM while the load is pending", async () => {
    listArticlesMock.mockReturnValue(new Promise(() => {}));

    window.location.hash = "";
    render(<App />);

    // Issue #101 — LibraryView is a lazy route chunk now; await the chrome
    // (the chunk import resolves while the listArticles promise below never
    // settles) so the assertions still observe the PENDING-load state.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Saved articles" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("link", {
        name: "Share feedback on GitHub (opens in a new tab)",
      }),
    ).toBeNull();

    // Issue #98 review — the honest library copy is PINNED (the acceptance
    // criterion: the copy updates flow through the tests). The load speaks
    // through the ONE status region with the library-worded string —
    // never the article route's "Opening article…".
    expect(screen.getByText("Opening your library…")).not.toBeNull();
    expect(screen.queryByText("Opening article…")).toBeNull();
  });
});

// Issue #98 review — the library load ERROR copy is pinned too: the
// acceptance criterion names both strings ("Opening your library…" /
// "Couldn't open your library.") and the review found neither exercised by
// any test. The error speaks the library-worded failure + its follow-up
// through the status region (the state-kind table's ERROR kind: named
// honestly, with a next step).
describe("App — the library load error speaks the library-worded copy", () => {
  it("renders 'Couldn't open your library.' + the follow-up sentence", async () => {
    listArticlesMock.mockRejectedValue(new Error("dexie unavailable"));
    window.location.hash = "";
    render(<App />);

    expect(await screen.findByText("Couldn't open your library.")).not.toBeNull();
    expect(
      screen.getByText(
        "Your library could not be loaded. Reload the page to try again; if it still fails, check that this browser can use local storage.",
      ),
    ).not.toBeNull();
  });
});
