// src/routes/collections/collectionEntries.ts
// Issue #242 — the ONE entry → navigation derivation for collection views.
// Pure functions, zero React, zero Dexie (the store-seam discipline — the
// snapshot-owning view passes the folds in; this module owns the algebra).
//
// What "opening an entry" means (issue #242 AC + ADR 0001/0011):
//   - An ARTICLE entry opens the article's canonical reader route — the
//     reader's normal shared saved location (ArticleView restores it; no
//     collection-specific position exists or may exist).
//   - A BOOK entry opens the book the same way the library's BookRow does:
//     the D12-07 resume chapter while one exists, else the first DECLARED
//     chapter (an unread book opens at its start), else null (no live
//     chapter rows — honest unlinked, the BookRow titleTarget precedent).
//     The href grammar is the same every chapter link uses (#/article/<id>),
//     so the established book/reader navigation (chapter handoff, read-
//     aloud continuation) applies unchanged.
//
// Reference honesty: an entry whose target is absent from the library
// snapshot resolves to null — the view renders it as an unlinked,
// honestly-labeled row, never a dead link (issue #242 AC — validated
// target references; issue #245 owns the delete-time confirmation flow).
import type { CanonicalArticle } from "../../content/types";
import type { Book, CollectionEntry, LocationRecord } from "../../content/schema";
import { resolveResumeChapterId } from "../../ingestion/library/bookProgress";

/** The snapshot pieces an entry resolution needs (plain maps — the view
 * derives them from the ONE LibrarySnapshot; tests hand-build them). */
export interface CollectionEntryLookup {
  /** Every composite-library article by id (missing id → absent target). */
  articlesById: ReadonlyMap<string, CanonicalArticle>;
  /** Every Book row by id (missing id → absent target). */
  booksById: ReadonlyMap<string, Book>;
  /** Live chapter rows grouped by bookId, any order (the snapshot's
   * chaptersByBook fold). */
  chaptersByBookId: ReadonlyMap<string, readonly CanonicalArticle[]>;
  /** THE latest-location fold (the D12-07 resume input). */
  latestLocationByArticleId: ReadonlyMap<string, LocationRecord>;
}

/**
 * collectionEntryHref — the in-app route an entry OPENS, or null when the
 * target is absent (unknown id, or a book with zero live chapter rows).
 * One definition shared by every collection surface so a collection row and
 * its detail view can never disagree about where an entry leads.
 */
export function collectionEntryHref(
  entry: CollectionEntry,
  lookup: CollectionEntryLookup,
): string | null {
  if (entry.target.kind === "article") {
    return lookup.articlesById.has(entry.target.articleId)
      ? `#/article/${entry.target.articleId}`
      : null;
  }
  const book = lookup.booksById.get(entry.target.bookId);
  if (!book) return null;
  // Partial-import-tolerant chapter ordering (the BookRow discipline): the
  // declared TOC order first (missing rows silently absent), then live rows
  // extra to the record appended in load order.
  const live = lookup.chaptersByBookId.get(book.id) ?? [];
  const byId = new Map(live.map((c) => [c.id, c]));
  const ordered: string[] = [];
  for (const chapterId of book.chapterArticleIds) {
    if (byId.has(chapterId)) ordered.push(chapterId);
  }
  const declared = new Set(book.chapterArticleIds);
  for (const chapter of live) {
    if (!declared.has(chapter.id)) ordered.push(chapter.id);
  }
  const resume = resolveResumeChapterId(book, lookup.latestLocationByArticleId);
  const target = resume ?? ordered[0] ?? null;
  return target !== null ? `#/article/${target}` : null;
}
