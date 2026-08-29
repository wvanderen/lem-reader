// tests/unit/library-search.test.ts
// Plan 08-03 Task 1 — Pure-function coverage for the library filter helper
// (D8-06 search by title/author/source-domain/tag-name; D8-07 single-tag
// filter, AND-style within a tag). NO Dexie, NO React — `filterLibrary` is a
// pure function over a CanonicalArticle[] so the suite runs in plain Node.
//
// The sample articles cover the four searchable fields + the tag filter
// (with/without tags) + the domainOf edge cases (undefined, non-URL, subdomain).
import { describe, expect, it } from "vitest";
import { filterLibrary, domainOf } from "../../src/ingestion/library/libraryFilter";
import type { LibraryFilter } from "../../src/ingestion/library/libraryFilter";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";

/**
 * Build a minimal valid CanonicalArticle via the schema (single source of
 * truth — the test data is Zod-validated at construction). The library filter
 * only touches provenance.title, provenance.author, provenance.sourceUrl,
 * ingestionMeta.source, and tags — so the helper fills in just enough
 * elsewhere to satisfy the schema.
 */
function makeArticle(
  overrides: Record<string, unknown>,
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "test-id",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Untitled",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "body" }] }],
    ...overrides,
  });
}

// Sample corpus — three articles covering the searchable fields + the tag
// filter matrix.
const plato = makeArticle({
  id: "republic",
  provenance: {
    title: "Plato's Republic",
    author: "Plato",
    sourceUrl: "https://example.com/essay",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
  },
  tags: ["essay"],
});

const marcus = makeArticle({
  id: "meditations",
  provenance: {
    title: "Meditations",
    author: "Marcus",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
  },
  tags: ["essay", "stoic"],
});

const fixture = makeArticle({
  id: "fixture-no-tags",
  provenance: {
    title: "A v1.0 fixture with no tags",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
  },
  // tags omitted entirely — hydrates to undefined → `(a.tags ?? [])` in the filter
});

const sampleArticles = [plato, marcus, fixture];

const noFilter: LibraryFilter = { query: "", activeTag: null };

describe("filterLibrary (D8-06 + D8-07)", () => {
  it("returns all articles unchanged when query is empty and activeTag is null", () => {
    expect(filterLibrary(sampleArticles, noFilter)).toEqual(sampleArticles);
  });

  it("matches by title (case-insensitive substring)", () => {
    expect(filterLibrary(sampleArticles, { query: "plato", activeTag: null })).toEqual([
      plato,
    ]);
  });

  it("matches by author", () => {
    expect(filterLibrary(sampleArticles, { query: "marcus", activeTag: null })).toEqual([
      marcus,
    ]);
  });

  it("matches by source-domain via domainOf (D8-06 — hostname searchable)", () => {
    expect(
      filterLibrary(sampleArticles, { query: "example.com", activeTag: null }),
    ).toEqual([plato]);
  });

  it("matches by tag name (D8-06 — tags are first-class searchable metadata)", () => {
    expect(filterLibrary(sampleArticles, { query: "essay", activeTag: null })).toEqual([
      plato,
      marcus,
    ]);
  });

  it("matches a single-article tag specifically", () => {
    expect(filterLibrary(sampleArticles, { query: "stoic", activeTag: null })).toEqual([
      marcus,
    ]);
  });

  it("single-tag filter (D8-07) returns only articles carrying the tag", () => {
    expect(
      filterLibrary(sampleArticles, { query: "", activeTag: "essay" }),
    ).toEqual([plato, marcus]);
  });

  it("activeTag AND query compose (both must pass)", () => {
    expect(
      filterLibrary(sampleArticles, { query: "marcus", activeTag: "stoic" }),
    ).toEqual([marcus]);
  });

  it("activeTag that no article carries returns empty", () => {
    expect(
      filterLibrary(sampleArticles, { query: "", activeTag: "nonexistent" }),
    ).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const snapshot = [...sampleArticles];
    filterLibrary(sampleArticles, { query: "plato", activeTag: null });
    expect(sampleArticles).toEqual(snapshot);
  });

  it("whitespace-only query is treated as empty (no filter branch)", () => {
    expect(
      filterLibrary(sampleArticles, { query: "   ", activeTag: null }),
    ).toEqual(sampleArticles);
  });
});

// Plan 17-02 Task 1 — D17-07 override-only matching cells. The article
// haystack reads the EFFECTIVE title/author (effectiveMetadata), so what you
// see is what matches: a renamed article surfaces for its new name and NOT
// for its old canonical one. Builders stay on the 17-01 discipline: articles
// are constructed via ArticleSchema.parse (never hand-written rows).
describe("filterLibrary × reader-owned overrides (D17-07)", () => {
  // An article whose reader renamed the title away from its canonical one.
  const renamed = makeArticle({
    id: "renamed-essay",
    provenance: {
      title: "Old Canonical Title",
      author: "Canonical Author",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
    readerTitle: "My Renamed Essay",
  });

  // An article whose reader overrode only the author.
  const reauthored = makeArticle({
    id: "reauthored-essay",
    provenance: {
      title: "Reauthored Essay",
      author: "Original Author",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
    readerAuthor: "New Author",
  });

  it("an article with readerTitle set is found by the override text and NOT by its old canonical title (D17-07)", () => {
    const corpus = [renamed, ...sampleArticles];
    // Found by the override text.
    expect(
      filterLibrary(corpus, { query: "my renamed essay", activeTag: null }),
    ).toEqual([renamed]);
    // NOT found by the old canonical title — the override is the ONE name.
    expect(
      filterLibrary(corpus, { query: "old canonical title", activeTag: null }),
    ).toEqual([]);
  });

  it("an article with readerAuthor set matches the override author; the canonical author text no longer matches once overridden (D17-07)", () => {
    const corpus = [reauthored, ...sampleArticles];
    // The override author matches.
    expect(
      filterLibrary(corpus, { query: "new author", activeTag: null }),
    ).toEqual([reauthored]);
    // The canonical author no longer matches once overridden.
    expect(
      filterLibrary(corpus, { query: "original author", activeTag: null }),
    ).toEqual([]);
  });

  it("an article without overrides matches canonical title/author exactly as before (regression)", () => {
    // The pre-override corpus behavior is byte-stable: plato by title,
    // marcus by author, and the full-set no-filter pass all hold unchanged.
    expect(filterLibrary(sampleArticles, noFilter)).toEqual(sampleArticles);
    expect(filterLibrary(sampleArticles, { query: "plato", activeTag: null })).toEqual([
      plato,
    ]);
    expect(filterLibrary(sampleArticles, { query: "marcus", activeTag: null })).toEqual([
      marcus,
    ]);
  });
});

describe("domainOf", () => {
  it("returns '' for undefined input", () => {
    expect(domainOf(undefined)).toBe("");
  });

  it("returns '' for empty string", () => {
    expect(domainOf("")).toBe("");
  });

  it("returns '' for a non-URL string", () => {
    expect(domainOf("not-a-url")).toBe("");
  });

  it("returns the hostname for a valid URL", () => {
    expect(domainOf("https://foo.example.com/path")).toBe("foo.example.com");
  });

  it("returns the hostname for a bare domain URL", () => {
    expect(domainOf("https://example.com")).toBe("example.com");
  });
});
