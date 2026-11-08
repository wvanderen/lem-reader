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
// Issue #244 — CHAPTER entries open the READER with a declared chapter
// assignment (#/article/<articleId>/c/<scope>): the reader scopes start,
// stop, and speech to the assigned chapter without a substitute article or
// a second saved position (ADR 0011). Two targets, two scopes:
//   - book-chapter → scope "chapter" on the chapter article's own route
//     (the EPUB chapter IS the article; the assignment declares the stop-
//     at-end + explicit-continue behavior).
//   - work-chapter → scope <destinationId> on the work's route (the
//     destination's canonical offset range is the assignment). A STALE
//     destination (the work's structure no longer validates it — a
//     re-ingest moved the ranges) resolves to null: the row renders
//     honestly unlinked rather than silently opening the whole work.
//
// Reference honesty: an entry whose target is absent from the library
// snapshot resolves to null — the view renders it as an unlinked,
// honestly-labeled row, never a dead link (issue #242 AC — validated
// target references; issue #245 owns the delete-time confirmation flow).
import type { CanonicalArticle } from "../../content/types";
import type { Book, CollectionEntry, CompletionRecord, LocationRecord } from "../../content/schema";
import type { LibrarySnapshot } from "../../ingestion/library/librarySnapshot";
import { resolveBookChapterTarget, resolveWorkChapterTarget } from "../../content/chapterTargets";
import { entryFinished } from "../../content/completion";
import { effectiveTitle } from "../../ingestion/library/effectiveMetadata";
import { orderedLiveChapters, resolveResumeChapterId } from "../../ingestion/library/bookProgress";

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
  /** Issue #246 — THE completion fold (completionTargetKey → record): the
   * shared finished/unfinished truth the entry rows + progress line read. */
  completionByKey: ReadonlyMap<string, CompletionRecord>;
  /** Issue #246 — the grapheme-total lookup (the snapshot's
   * totalsByArticleId fold) the whole-article completion threshold reads. */
  textLengthOf: (articleId: string) => number | undefined;
}

/** One entry's full display + navigation resolution (the ONE shape every
 * collection surface renders from — issue #244 retargeted the detail view's
 * per-field helpers here so a row's title, kind line, and link can never
 * disagree about the same target). Issue #246 adds the SHARED completion
 * truth: `finished` derives from the ONE entryFinished algebra (records +
 * canonical locations), never from membership context. */
export interface EntryResolution {
  /** The in-app route the entry OPENS, or null when the target is absent
   * or stale (an unlinked row). */
  href: string | null;
  /** The reading's display title, or null when unresolvable (the view's
   * fallback copy covers it). */
  title: string | null;
  /** The honest kind line: what the entry points at, including the parent
   * work/book for chapter entries, and the stale-target honesty. */
  kindLine: string;
  /** Issue #246 — the target's shared completion state (the correction
   * control's starting point and the progress line's input). */
  finished: boolean;
}

/**
 * collectionEntryHref — the in-app route an entry OPENS, or null when the
 * target is absent (unknown id, a book with zero live chapter rows, or a
 * stale chapter destination). One definition shared by every collection
 * surface so a collection row and its detail view can never disagree about
 * where an entry leads.
 */
export function collectionEntryHref(
  entry: CollectionEntry,
  lookup: CollectionEntryLookup,
): string | null {
  return resolveCollectionEntry(entry, lookup).href;
}

/**
 * resolveCollectionEntry — the ONE entry resolution (href + title + kind
 * line). See the module header for the per-kind semantics.
 */
export function resolveCollectionEntry(
  entry: CollectionEntry,
  lookup: CollectionEntryLookup,
): EntryResolution {
  // Issue #246 — the shared completion derivation runs for EVERY target
  // (even unlinked rows — an absent target counts, never finishes).
  const finished = entryFinished(entry.target, {
    completionByKey: lookup.completionByKey,
    latestLocationByArticleId: lookup.latestLocationByArticleId,
    textLengthOf: lookup.textLengthOf,
    chapterArticleIdsOf: (bookId) => lookup.booksById.get(bookId)?.chapterArticleIds ?? [],
  });
  const target = entry.target;
  if (target.kind === "article") {
    const article = lookup.articlesById.get(target.articleId);
    return {
      href: article ? `#/article/${target.articleId}` : null,
      title: article ? effectiveTitle(article) : null,
      kindLine: article ? "Article" : "No longer in your library",
      finished,
    };
  }
  if (target.kind === "book") {
    const book = lookup.booksById.get(target.bookId);
    if (!book) return { href: null, title: null, kindLine: "No longer in your library", finished };
    // ONE shared chapter ordering (the BookRow input — bookProgress owns the
    // partial-import-tolerant fold).
    const live = lookup.chaptersByBookId.get(book.id) ?? [];
    const ordered = orderedLiveChapters(book, live);
    const resume = resolveResumeChapterId(book, lookup.latestLocationByArticleId);
    const targetId = resume ?? ordered[0]?.id ?? null;
    return {
      href: targetId !== null ? `#/article/${targetId}` : null,
      title: book.title,
      kindLine: targetId !== null ? "Book" : "No longer in your library",
      finished,
    };
  }
  // Issue #244 — book-chapter: the chapter article's own route with the
  // whole-article assignment scope.
  if (target.kind === "book-chapter") {
    const book = lookup.booksById.get(target.bookId);
    const chapter = lookup.articlesById.get(target.articleId);
    // The ONE cross-record membership check (the store write seam uses the
    // same resolution — routes/collections may import content).
    if (resolveBookChapterTarget(book, chapter) === null) {
      return { href: null, title: null, kindLine: "No longer in your library", finished };
    }
    return {
      href: `#/article/${target.articleId}/c/chapter`,
      title: effectiveTitle(chapter!),
      kindLine: `Chapter · ${book!.title}`,
      finished,
    };
  }
  // Issue #244 — work-chapter: the work's route carrying the destination
  // scope. The destination must still validate against the article's live
  // structure (the SAME resolution the reader applies at open time) — a
  // stale destination renders unlinked with its own honest line, never a
  // silent whole-work open.
  const article = lookup.articlesById.get(target.articleId);
  if (!article) return { href: null, title: null, kindLine: "No longer in your library", finished };
  const destination = resolveWorkChapterTarget(article, target.destinationId);
  if (destination === null) {
    return {
      href: null,
      title: null,
      kindLine: "Chapter no longer matches this reading",
      finished,
    };
  }
  return {
    href: `#/article/${target.articleId}/c/${target.destinationId}`,
    title: destination.title,
    kindLine: `Chapter · ${effectiveTitle(article)}`,
    finished,
  };
}

/**
 * entryLookupFromSnapshot — the ONE snapshot → lookup fold (plain maps over
 * the settled LibrarySnapshot — no re-fold, the BookRow input discipline).
 * Every collection surface (detail view, reader context) derives its lookup
 * through THIS helper so the rows, the progress line, and Continue can
 * never disagree about the same snapshot.
 */
export function entryLookupFromSnapshot(snapshot: LibrarySnapshot): CollectionEntryLookup {
  return {
    articlesById: new Map(snapshot.articles.map((a) => [a.id, a])),
    booksById: new Map(snapshot.books.map((b) => [b.id, b])),
    chaptersByBookId: snapshot.chaptersByBook,
    latestLocationByArticleId: snapshot.latestLocationByArticleId,
    completionByKey: snapshot.completionByTargetKey,
    textLengthOf: (articleId: string) => snapshot.totalsByArticleId.get(articleId),
  };
}
