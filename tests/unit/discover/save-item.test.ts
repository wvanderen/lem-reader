// tests/unit/discover/save-item.test.ts
// Issue #124 — saveFeedItem(): the save-one-feed-item policy for the
// Discover timeline's + affordance, and savedArticleIdForLink(): the
// pre-press "In library" derivation. The outcome union is the WHOLE test
// surface — these tests pin the policy, not the view (the component suite
// owns DiscoverView's copy and state routing).
//
// Contracts pinned here:
//   - The LINKED PAGE is what ingests: addToLibrary's url arm ({kind:
//     "url", url}) — never the feed summary, never cached feed text (the
//     guarded pipeline fetches and extracts the page itself).
//   - Dedupe-refuse: a duplicate resolves to already-in-library with the
//     EXISTING row's canonical id when the refusal carries it (redirect
//     aliases land on the same server-derived slug), and to the honest
//     id-less edge when it does not. Nothing is ever re-saved.
//   - Other refusals pass their typed reason through; the union never
//     throws for policy reasons.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/ingestion/addToLibrary", () => ({
  addToLibrary: vi.fn(),
}));

import { addToLibrary } from "../../../src/ingestion/addToLibrary";
import type { AddToLibraryOutcome } from "../../../src/ingestion/addToLibrary";
import {
  saveFeedItem,
  savedArticleIdForLink,
} from "../../../src/discover/saveItem";
import type { CanonicalArticle } from "../../../src/content/types";

const addToLibraryMock = vi.mocked(addToLibrary);

beforeEach(() => {
  addToLibraryMock.mockReset();
});

function libraryArticle(
  id: string,
  sourceUrl?: string,
): CanonicalArticle {
  return {
    id,
    provenance: {
      ...(sourceUrl !== undefined ? { sourceUrl } : {}),
      title: id,
    },
  } as unknown as CanonicalArticle;
}

describe("saveFeedItem — the + press policy", () => {
  it("ingests the LINKED PAGE through the pipeline's url arm and maps a clean save to {saved, articleId}", async () => {
    addToLibraryMock.mockResolvedValue({
      outcome: "saved-article",
      articleId: "example-com-the-page",
      title: "The Page",
      sourceUrl: "https://example.com/the-page",
      warnings: [],
    });

    const outcome = await saveFeedItem("https://example.com/the-page");

    // The url arm — the guarded ingest of the page itself. A feed summary
    // or cached full-content text can never ride this call (there is no
    // field to carry them).
    expect(addToLibraryMock).toHaveBeenCalledTimes(1);
    expect(addToLibraryMock).toHaveBeenCalledWith({
      kind: "url",
      url: "https://example.com/the-page",
    });
    expect(outcome).toEqual({ outcome: "saved", articleId: "example-com-the-page" });
  });

  it("a duplicate (already-in-library) resolves to the EXISTING row's id — one library item across feeds and redirect aliases", async () => {
    addToLibraryMock.mockResolvedValue({
      outcome: "refused",
      reason: "already-in-library",
      existingArticleId: "example-com-canonical",
    });

    const outcome = await saveFeedItem("https://example.com/aliased?utm_source=feed");

    expect(outcome).toEqual({
      outcome: "already-in-library",
      articleId: "example-com-canonical",
    });
  });

  it("an id-less duplicate refusal stays the honest id-less edge (no Open affordance is fabricated)", async () => {
    addToLibraryMock.mockResolvedValue({
      outcome: "refused",
      reason: "already-in-library",
    });

    const outcome = await saveFeedItem("https://example.com/dup");

    expect(outcome).toEqual({ outcome: "already-in-library", articleId: undefined });
  });

  it("other refusals pass their typed reason through (calm copy, the + stays retryable)", async () => {
    const refusals: AddToLibraryOutcome[] = [
      { outcome: "refused", reason: "fetch-failed" },
      { outcome: "refused", reason: "ssrf-blocked-private-ip" },
      { outcome: "refused", reason: "unsupported-content-type" },
      { outcome: "refused", reason: "server-error" },
    ];
    for (const refused of refusals) {
      addToLibraryMock.mockResolvedValueOnce(refused);
      const outcome = await saveFeedItem("https://example.com/x");
      expect(outcome).toEqual(refused);
    }
  });

  it("the impossible saved-book arm throws the invariant (unreachable for a url ingest)", async () => {
    addToLibraryMock.mockResolvedValue({
      outcome: "saved-book",
      bookId: "b",
      title: "B",
      skippedChapterCount: 0,
    });
    await expect(saveFeedItem("https://example.com/x")).rejects.toThrow(
      /saved-book/,
    );
  });
});

describe("savedArticleIdForLink — the pre-press In library derivation", () => {
  it("matches the article ingested from exactly this link", () => {
    const articles = [
      libraryArticle("other-com-a", "https://other.com/a"),
      libraryArticle("example-com-the-page", "https://example.com/the-page"),
    ];
    expect(savedArticleIdForLink(articles, "https://example.com/the-page")).toBe(
      "example-com-the-page",
    );
  });

  it("returns undefined when no row claims the link", () => {
    const articles = [libraryArticle("other-com-a", "https://other.com/a")];
    expect(savedArticleIdForLink(articles, "https://example.com/the-page")).toBeUndefined();
    expect(savedArticleIdForLink([], "https://example.com/the-page")).toBeUndefined();
  });

  it("ignores rows without a sourceUrl (paste/upload arms) and pasted-url collisions stay honest", () => {
    const articles = [
      libraryArticle("pasted-no-url"),
      libraryArticle("pasted-with-url", "https://example.com/the-page"),
    ];
    // An exact match still wins even when other rows lack a sourceUrl.
    expect(savedArticleIdForLink(articles, "https://example.com/the-page")).toBe(
      "pasted-with-url",
    );
  });

  it("the first matching row wins (identity is the slug — two rows cannot honestly share a sourceUrl)", () => {
    const articles = [
      libraryArticle("first", "https://example.com/the-page"),
      libraryArticle("second", "https://example.com/the-page"),
    ];
    expect(savedArticleIdForLink(articles, "https://example.com/the-page")).toBe("first");
  });
});
