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
//   - Instants compare chronologically, not raw-lexicographically: Zod's
//     `.datetime()` admits variable-precision fractions (".5Z" vs ".55Z"),
//     so each stamp's fraction is zero-padded to a fixed width BEFORE the
//     string compare — one normalization per entry, none per comparison.
//     First-party stamps are always `toISOString()` (3-digit ms); padding
//     covers foreign/crafted bundle rows too.
//   - Equal instants keep stable relative order (ES2019+ Array.sort is
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

/** Sort-pair: the entry beside its PRE-COMPUTED fixed-width stamp (the
 * normalization runs once per entry, never inside the comparator). */
interface DatedEntry {
  at: string;
  entry: LibraryListEntry;
}

/**
 * normalizedStamp — fixed-width descending-comparable form of an ISO-8601
 * Zulu datetime. Zod's `.datetime()` default admits `…T00:00:00Z`,
 * `…T00:00:00.5Z`, `…T00:00:00.000Z`… whose raw strings sort wrong (".5Z"
 * > ".55Z" because Z > 5). Padding every fraction to 9 digits makes plain
 * string order equal chronological order. The trailing Z is contract
 * (offsets are not in the Zod default), so the slice arithmetic is safe.
 */
function normalizedStamp(iso: string): string {
  const dot = iso.indexOf(".");
  if (dot === -1) return `${iso.slice(0, -1)}.000Z`;
  const digits = iso.slice(dot + 1, -1);
  return `${iso.slice(0, dot + 1)}${digits.padEnd(9, "0")}Z`;
}

/**
 * orderLibraryEntries — the ONE merged Recently-added order (issue #114).
 *
 * @param articles Standalone (non-chapter) articles of one view — dated and
 *                 undated rows mixed.
 * @param books    The view's Book rows (every row carries addedAt).
 * @returns A new array (inputs not mutated): dated items by addedAt
 *          descending, exact instants stable (articles before books, input
 *          order within each kind), then undated articles in input order.
 */
export function orderLibraryEntries(
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
): LibraryListEntry[] {
  const dated: DatedEntry[] = [];
  const undated: LibraryListEntry[] = [];
  // Articles: the kind split. An absent addedAt is the legacy/fixture state —
  // never invented on (issue #114: "no historical date is invented").
  for (const article of articles) {
    if (article.addedAt !== undefined) {
      dated.push({
        at: normalizedStamp(article.addedAt),
        entry: { kind: "article", article },
      });
    } else {
      undated.push({ kind: "article", article });
    }
  }
  // Books: addedAt is REQUIRED by BookSchema, so every book is dated.
  for (const book of books) {
    dated.push({
      at: normalizedStamp(book.addedAt),
      entry: { kind: "book", book },
    });
  }
  // Descending instant; the stable sort keeps exact ties in input order
  // (articles before books).
  dated.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return dated.map((d) => d.entry).concat(undated);
}
