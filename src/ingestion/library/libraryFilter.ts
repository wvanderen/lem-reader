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
 * The function does NOT sort; the caller (LibraryView) owns the default sort
 * (recently-added descending per D8-03) because the sort key (`addedAt`) is
 * available at the repository layer, not inside this pure helper.
 *
 * @param articles The composite library list (fixtures + ingested).
 * @param filter   `{ query, activeTag }` — see `LibraryFilter`.
 * @returns        A new array (input is not mutated) of matching articles.
 */
export function filterLibrary(
  articles: CanonicalArticle[],
  filter: LibraryFilter,
): CanonicalArticle[] {
  const q = filter.query.trim().toLowerCase();
  return articles.filter((a) => {
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
