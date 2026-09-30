// src/ingestion/library/libraryOrder.ts
// Issue #114 — the ONE pure Recently-added order for the mixed library list;
// issue #115 extends the same module with the Title and Recently-opened
// orders (the ONE ordering home — no consumer forks a comparator). Every
// Library reading-state view (All / Unread / In progress / Finished) shows
// matching standalone articles AND books in ONE merged order chosen by the
// reader's persisted librarySort preference; chapters never enter this list
// (they stay inside their BookRow, the D12-01 partition — the caller passes
// standalone articles only).
//
// The store-seam discipline (readingState.ts/bookProgress.ts): zero React,
// zero Dexie — the caller owns the reads (LibraryView renders from the
// LibrarySnapshot), this module owns the algebra. Search/tag filters stay
// upstream of it and preserve relative order (Array.filter), so narrowing a
// view can never change its order.
//
// Recently-added policy edges pinned by tests/unit/library/library-order.test.ts:
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
//
// Title order (#115): reader-visible EFFECTIVE titles ascending — the
// effectiveTitle derivation (override wins, D17-09/META-02), never the
// canonical identity the reader no longer sees; books sort by their (only)
// title. localeCompare gives the reader-expected dictionary order (the
// markdown.ts/tagStats precedent). Deterministic ties: equal titles fall
// through to the Recently-added comparator (addedAt descending, undated
// last), and full ties keep stable input order (articles before books).
//
// Recently-opened order (#115): each entry's latest reading activity — an
// article's latest saved location (the snapshot's ONE latest-location fold)
// and a book's latest chapter location (max savedAt across its chapters) —
// most recent first. Presence is the "opened" predicate, never progress: a
// location at offset ZERO counts as opened, matching the Unread membership
// rule (D14-18: ANY location, even offset 0, means started). Never-opened
// items follow ALL opened ones in the Recently-added order (the library
// default — no second tail policy to drift). Equal stamps tie stably
// (articles before books, input order within a kind — the resumeTarget
// discipline).
import type { Book, CanonicalArticle, LocationRecord, ReaderSettings } from "../../content/schema";
import { effectiveTitle } from "./effectiveMetadata";

/**
 * The Library sort vocabulary (issue #115) — DERIVED from the persisted
 * ReaderSettings.librarySort enum (the schema is the single source of
 * truth; a schema widening surfaces here as a type error, never a silent
 * drift).
 */
export type LibrarySortKind = ReaderSettings["librarySort"];

/**
 * The reads the Recently-opened order consumes. ONE fold — the snapshot's
 * `latestLocationByArticleId` (max savedAt per article id, chapters
 * included) — passed whole; this module never re-folds raw rows (Issue #8).
 */
export interface RecentlyOpenedContext {
  latestLocationByArticleId: ReadonlyMap<string, LocationRecord>;
}

/**
 * One render entry of the merged library list: either a standalone article
 * (a LibraryRow) or a book (a BookRow with its chapters nested inside).
 */
export type LibraryListEntry =
  { kind: "article"; article: CanonicalArticle } | { kind: "book"; book: Book };

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
  if (dot === -1) return `${iso.slice(0, -1)}.000000000Z`;
  const digits = iso.slice(dot + 1, -1);
  return `${iso.slice(0, dot + 1)}${digits.padEnd(9, "0")}Z`;
}

/**
 * orderLibraryEntries — the ONE merged library order, dispatched on the
 * reader's sort choice (issue #115). The two-argument call is the shipped
 * Recently-added order (issue #114) byte-stable — every existing call site
 * and test keeps its behavior.
 *
 * @param articles Standalone (non-chapter) articles of one view — dated and
 *                 undated rows mixed.
 * @param books    The view's Book rows (every row carries addedAt).
 * @param sort     The persisted LibrarySortKind. Default (and the defensive
 *                 degrade when "recently-opened" arrives without its
 *                 context) is "recently-added" — never a crash, never a
 *                 silent third order.
 * @param opened   The latest-location fold; required ONLY by
 *                 "recently-opened".
 * @returns A new array (inputs not mutated) in the chosen order.
 */
export function orderLibraryEntries(
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
  sort: LibrarySortKind = "recently-added",
  opened?: RecentlyOpenedContext,
): LibraryListEntry[] {
  if (sort === "title") return orderByTitle(articles, books);
  if (sort === "recently-opened") {
    return orderByRecentlyOpened(articles, books, opened);
  }
  return orderByRecentlyAdded(articles, books);
}

/**
 * compareIsoDesc — descending chronological compare over two ALREADY-
 * normalized stamps (the one descending-instant expression every order
 * shares — the #114 comparator, named once).
 */
function compareIsoDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/** The #114 descending-addedAt order, verbatim (the default). */
function orderByRecentlyAdded(
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
  dated.sort((a, b) => compareIsoDesc(a.at, b.at));
  return dated.map((d) => d.entry).concat(undated);
}

/** The reader-visible sort key of a list entry (D17-09 — the override IS
 * the title; a book has exactly one). */
function entryTitle(entry: LibraryListEntry): string {
  return entry.kind === "article" ? effectiveTitle(entry.article) : entry.book.title;
}

/** The entry's addedAt (articles optional; books REQUIRED by BookSchema). */
function entryAddedAt(entry: LibraryListEntry): string | undefined {
  return entry.kind === "article" ? entry.article.addedAt : entry.book.addedAt;
}

/** The #115 Title order: effective title ascending (localeCompare), ties
 * through the Recently-added comparator (addedAt descending, undated
 * last), full ties stable (articles before books — merged input order). */
function orderByTitle(
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
): LibraryListEntry[] {
  const merged: LibraryListEntry[] = [
    ...articles.map((article): LibraryListEntry => ({ kind: "article", article })),
    ...books.map((book): LibraryListEntry => ({ kind: "book", book })),
  ];
  merged.sort((a, b) => {
    const byTitle = entryTitle(a).localeCompare(entryTitle(b));
    if (byTitle !== 0) return byTitle;
    const aa = entryAddedAt(a);
    const bb = entryAddedAt(b);
    if (aa === undefined || bb === undefined) {
      // Undated follows dated (the #114 discipline; both-undefined → 0,
      // letting the stable sort keep input order).
      return aa === bb ? 0 : aa === undefined ? 1 : -1;
    }
    return compareIsoDesc(normalizedStamp(aa), normalizedStamp(bb));
  });
  return merged;
}

/** A book's latest chapter activity — max savedAt across its chapter
 * locations (the D12-07/D8-10 book-aware key the resume rail uses),
 * undefined when no chapter was ever opened. */
function latestBookSavedAt(
  book: Book,
  latest: ReadonlyMap<string, LocationRecord>,
): string | undefined {
  let bestAt: string | undefined;
  let bestStamp: string | undefined;
  for (const chapterId of book.chapterArticleIds) {
    const savedAt = latest.get(chapterId)?.savedAt;
    if (savedAt === undefined) continue;
    const stamp = normalizedStamp(savedAt);
    if (bestStamp === undefined || stamp > bestStamp) {
      bestStamp = stamp;
      bestAt = savedAt;
    }
  }
  return bestAt;
}

/** The #115 Recently-opened order: opened entries by latest-activity
 * descending, never-opened entries following in the Recently-added order.
 * PRESENCE is the opened predicate — a location at offset 0 counts (the
 * D14-18 "ANY location means started" Unread parity). */
function orderByRecentlyOpened(
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
  opened: RecentlyOpenedContext | undefined,
): LibraryListEntry[] {
  // Defensive degrade: the context is required for this order; its absence
  // is a caller bug — degrade to the shipped default, never crash.
  if (opened === undefined) return orderByRecentlyAdded(articles, books);
  const latest = opened.latestLocationByArticleId;
  const openedDated: DatedEntry[] = [];
  const neverArticles: CanonicalArticle[] = [];
  const neverBooks: Book[] = [];
  for (const article of articles) {
    const savedAt = latest.get(article.id)?.savedAt;
    if (savedAt === undefined) {
      neverArticles.push(article);
    } else {
      openedDated.push({
        at: normalizedStamp(savedAt),
        entry: { kind: "article", article },
      });
    }
  }
  for (const book of books) {
    const savedAt = latestBookSavedAt(book, latest);
    if (savedAt === undefined) {
      neverBooks.push(book);
    } else {
      openedDated.push({
        at: normalizedStamp(savedAt),
        entry: { kind: "book", book },
      });
    }
  }
  // Descending activity; the stable sort keeps equal stamps in input order
  // (articles before books — the resumeTarget discipline).
  openedDated.sort((a, b) => compareIsoDesc(a.at, b.at));
  // The never-opened tail rides the library default order (addedAt
  // descending, undated last, stable) — ONE tail policy, no drift.
  return openedDated.map((d) => d.entry).concat(orderByRecentlyAdded(neverArticles, neverBooks));
}
