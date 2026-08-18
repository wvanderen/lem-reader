// src/ingestion/library/libraryFilter.ts
// Plan 08-03 Task 1 — Pure filter+sort helper for the personal LibraryView
// (LIB-03, D8-06, D8-07). Sibling of tagsStore.ts (Plan 02) in the library
// namespace.
//
// `filterLibrary` is a pure function: articles in, filtered subset out. No
// Dexie, no React state, no I/O — so the unit suite (tests/unit/library-
// search.test.ts) covers it WITHOUT a Dexie emulator (Pitfall: DOM emulators
// do not own authoritative layout — but for pure logic, Node is authoritative).
//
// D8-06 (search by title/author/source-domain/tag-name): the haystack is the
// lowercase join of [title, author ?? "", domainOf(sourceUrl), ...tags ?? []].
// `domainOf` extracts the hostname so readers can find articles by site name
// without typing the full URL.
//
// D8-07 (single-tag filter, AND-style within a tag): when `activeTag !== null`
// the article must carry that exact tag. Multiple tag selection is OUT OF
// SCOPE (Plan 03 ships single-select chips; multi-select is a later phase).
// The query + activeTag COMPOSE (both must pass) — see the unit suite.
//
// RESEARCH §Code Examples Example 5 (L798-836) is the verbatim skeleton this
// module copies. The `domainOf` helper is exported alongside `filterLibrary`
// so the unit suite can cover its edge cases directly (undefined / not-a-url
// / nested subdomain).
//
// Threat register (08-03-PLAN.md `<threat_model>`):
//   - Tag names render as React text children downstream (TagFilter chips) →
//     React escapes by default. No HTML parsing here.
//   - sourceUrl is `httpUrl`-refined at ArticleSchema parse time (only http(s)
//     URLs survive); `new URL()` here is therefore defensive (it never sees a
//     javascript:/data: URI). See T-8-12 mitigation in the plan.
import type { CanonicalArticle } from "../../content/types";
import type { Book } from "../../content/schema";

/**
 * `LibraryFilter` — the filter shape consumed by `filterLibrary`. Mirrors the
 * Plan 03 LibraryView state: a free-text `query` (any string, "" = no query)
 * + a single `activeTag` (null = no tag filter; a string = exact tag match).
 *
 * Kept as a named interface (not an inline type) so LibraryView, LibrarySearch,
 * and TagFilter can import the SAME contract.
 */
export interface LibraryFilter {
  /** Free-text search; "" or whitespace-only disables the query branch. */
  query: string;
  /**
   * Single-tag filter (D8-07). `null` = no tag filter; otherwise the article
   * must carry this exact string in its `tags` array.
   */
  activeTag: string | null;
}

/**
 * `filterLibrary` — Pure filter over a CanonicalArticle[]. Applies the tag
 * filter (D8-07) AND the query filter (D8-06) — both must pass for an article
 * to remain in the result set.
 *
 * Plan 12-05 (D12-01): CHAPTER members — articles carrying
 * `ingestionMeta.bookId` — are excluded here; they render only as sub-rows
 * inside their BookRow grouping, never as standalone results. (LibraryView
 * partitions them out upstream; this guard keeps the pure function honest
 * for any caller.)
 *
 * The function does NOT sort; the caller (LibraryView) owns the default sort
 * (recently-added descending per D8-03) because the sort key (`addedAt`) is
 * available at the repository layer, not inside this pure helper.
 *
 * @param articles The composite library list (fixtures + ingested).
 * @param filter   `{ query, activeTag }` — see `LibraryFilter`.
 * @returns        A new array (input is not mutated) of matching standalone
 *                 articles (chapter members excluded).
 */
export function filterLibrary(
  articles: CanonicalArticle[],
  filter: LibraryFilter,
): CanonicalArticle[] {
  const q = filter.query.trim().toLowerCase();
  return articles.filter((a) => {
    // Plan 12-05 (D12-01) — chapter members never surface standalone; the
    // book grouping (filterBooks) owns their visibility.
    if (a.ingestionMeta?.bookId) return false;
    // Tag filter (D8-07 — single tag, AND-style within a tag).
    if (filter.activeTag !== null) {
      if (!(a.tags ?? []).includes(filter.activeTag)) return false;
    }
    // Search (D8-06 — title + author + sourceUrl-domain + tag-names).
    if (q.length > 0) {
      const haystack = [
        a.provenance.title,
        a.provenance.author ?? "",
        domainOf(a.provenance.sourceUrl),
        ...(a.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * `filterBooks` — Pure filter over the Book[] half of the library
 * (Plan 12-05 — D12-04). A book surfaces when it passes BOTH the tag filter
 * (via `book.tags` — tags live on the Book record) AND the query filter.
 *
 * The book haystack is the lowercase join of [title, ...authors, ...chapter
 * titles] — searching a CHAPTER title surfaces the BOOK row (never a chapter
 * row): "find the essay collection containing the essay" works. Chapter
 * titles arrive as a caller-supplied Map (bookId → titles) so this function
 * stays pure — no Dexie, no article lookups.
 *
 * @param books               The library's Book records.
 * @param filter              `{ query, activeTag }` — the SAME filter shape
 *                            filterLibrary consumes (the two compose).
 * @param chapterTitlesByBook Chapter provenance titles per book id.
 * @returns A new array of matching books.
 */
export function filterBooks(
  books: Book[],
  filter: LibraryFilter,
  chapterTitlesByBook: Map<string, string[]>,
): Book[] {
  const q = filter.query.trim().toLowerCase();
  return books.filter((book) => {
    // Tag filter (D12-04 — tags live on the Book record).
    if (filter.activeTag !== null) {
      if (!(book.tags ?? []).includes(filter.activeTag)) return false;
    }
    // Search (D12-04 — book title + authors AND chapter titles).
    if (q.length > 0) {
      const haystack = [
        book.title,
        ...book.authors,
        ...(chapterTitlesByBook.get(book.id) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * `domainOf` — Defensive hostname extraction from a URL string. Returns "" on
 * `undefined`, on a non-URL string, or on any `URL` constructor throw. The
 * SourceBadge link variant (Plan 03 Task 2) does NOT call this — it renders
 * `article.provenance.sourceUrl` directly; this helper is for the search
 * haystack (so readers can type "example.com" to find the article).
 *
 * `sourceUrl` is already `httpUrl`-refined at ArticleSchema parse time (only
 * http(s) URLs survive), so the `try/catch` is defensive — it never sees a
 * javascript:/data: URI in practice (T-8-12).
 */
export function domainOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
