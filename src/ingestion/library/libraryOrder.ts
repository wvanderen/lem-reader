// src/ingestion/library/libraryOrder.ts
// Issue #114 — the ONE pure Recently-added order for the mixed library list.
// Every Library reading-state view (All / Unread / In progress / Finished)
// shows matching standalone articles AND books in ONE descending added-date
// order; chapters never enter this list (they stay inside their BookRow, the
// D12-01 partition — the caller passes standalone articles only).
//
// The store-seam discipline (readingState.ts/bookProgress.ts): zero React,
// zero Dexie — the caller owns the reads (LibraryView renders from the
// LibrarySnapshot), this module owns the algebra. Search/tag filters stay
// upstream of it and preserve relative order (Array.filter), so narrowing a
// view can never change its order.
//
// Policy edges pinned by tests/unit/library/library-order.test.ts:
//   - Dated items (articles with addedAt; books always — BookSchema requires
//     the field) sort by addedAt DESCENDING (newest first).
//   - ISO-8601 Zulu datetimes compare correctly as plain strings (Zod's
//     .datetime() admits no offsets by default), so the comparator is a
//     lexicographic string compare — no Date allocation per comparison.
//   - Equal dates keep stable relative order (ES2019+ Array.sort is
//     stable): within a kind, input order; across kinds, articles before
//     books (the merged input order) — deterministic, never layout- or
//     locale-dependent.
//   - Undated rows (legacy articles + bundled fixtures) follow ALL dated
//     items in stable relative order. No historical date is invented — the
//     honest "we don't know when this entered" degrades to the list tail,
//     exactly the ContinueReadingStrip/classic ordering lesson: never
//     restore something that isn't true.
import type { Book, CanonicalArticle } from "../../content/schema";

/**
 * One render entry of the merged library list: either a standalone article
 * (a LibraryRow) or a book (a BookRow with its chapters nested inside).
 */
export type LibraryListEntry =
  | { kind: "article"; article: CanonicalArticle }
  | { kind: "book"; book: Book };

/**
 * orderLibraryEntries — the ONE merged Recently-added order (issue #114).
 *
 * @param articles Standalone (non-chapter) articles of one view — dated and
 *                 undated rows mixed.
 * @param books    The view's Book rows (every row carries addedAt).
 * @returns A new array (inputs not mutated): dated items by addedAt
 *          descending, exact ties stable (articles before books, input order
 *          within each kind), then undated articles in input order.
 */
export function orderLibraryEntries(
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
): LibraryListEntry[] {
  const dated: LibraryListEntry[] = [];
  const undated: LibraryListEntry[] = [];
  // Articles: the kind split. An absent addedAt is the legacy/fixture state —
  // never invented on (issues #114: "no historical date is invented").
  for (const article of articles) {
    if (article.addedAt !== undefined) {
      dated.push({ kind: "article", article });
    } else {
      undated.push({ kind: "article", article });
    }
  }
  // Books: addedAt is REQUIRED by BookSchema, so every book is dated.
  for (const book of books) {
    dated.push({ kind: "book", book });
  }
  // Descending addedAt; the stable sort keeps exact ties in input order
  // (articles before books). ISO-8601 Zulu strings sort lexicographically.
  dated.sort((a, b) => {
    const aDate = a.kind === "article" ? a.article.addedAt : a.book.addedAt;
    const bDate = b.kind === "article" ? b.article.addedAt : b.book.addedAt;
    return (aDate ?? "") < (bDate ?? "") ? 1 : (aDate ?? "") > (bDate ?? "") ? -1 : 0;
  });
  return [...dated, ...undated];
}
