// src/ingestion/library/librarySnapshot.ts
// Issue #3 — the ONE "load whole library" read. Every library surface used
// to construct its own read (articles + locations + tags + books via four
// store seams) plus its own latest-location fold and grapheme-total fold —
// seven copies, each with its own loading/error machine. This module owns
// the load ONCE: one Promise.all over the existing store seams returns a
// CONSISTENT snapshot (every fold derived from the same settled read), and
// one invalidation call lets write paths (remove, add, edit, read-state)
// trigger the follow-up reload — the refreshKey idiom, hoisted behind the
// module so no consumer re-implements it.
//
// Issue #8 — the remaining library consumers migrated onto this read model:
// the annotation review view (its own articles/highlights/notes/tags load
// + refreshKey re-derive machine) and the settings panel's highlights
// export (its own four-store Promise.all + fixture-merge fold) read THIS
// snapshot now; curation writes (note save, highlight delete) and imports
// follow up with the ONE invalidateLibrarySnapshot() call.
//
// What the snapshot carries (the shapes the library surfaces consume):
//   - articles              — the composite library (fixtures ∪ ingested;
//                             the listArticles seam, unchanged)
//   - standaloneArticles +  — the D12-01 partition (articles carrying
//     chaptersByBook          ingestionMeta.bookId are chapter members and
//                             never render top-level)
//   - books                 — every Book row (listBooks fail-quiet: a books
//                             load failure routes calmly to zero book rows;
//                             the standalone library stays usable — the
//                             strip/LibraryView discipline, now in one place)
//   - locations             — EVERY persisted LocationRecord (raw rows feed
//                             BookRow's bookProgress derivations)
//   - latestLocationByArticleId — THE latest-location fold: readingPosition's
//                             latestLocationByArticle (max savedAt per article;
//                             the savedAt-tie discipline lives there). The
//                             strip/LibraryView/BookRow folds all read THIS
//                             map now — one fold, no drift-prone copies.
//   - totalsByArticleId     — THE grapheme-total fold: one
//                             graphemeClusters(normalizeText(article), lang)
//                             .length pass per load, keyed by article id
//                             (the D-05 substrate; rows/hairlines/strip and
//                             the book-progress text-length lookup all read
//                             THIS map now).
//   - tags                  — article tags ∪ book tags, localeCompare-sorted
//                             (the D12-04 chip list: a tag on a book must
//                             surface as a filterable chip; loadAllTags keeps
//                             its persisted-rows-only derivation).
//   - highlights + notes    — EVERY persisted annotation record (the review
//                             view's join input and the highlights export's
//                             payload; loadAllHighlights/loadAllNotes keep
//                             their calm corrupt-row-drop derivations).
//   - readingSessions       — EVERY persisted ReadingSessionRecord (issue
//                             #38 — the ambient stats strip's whole-history
//                             payload). Fail-quiet like books: stats are
//                             non-critical chrome (D2-13), so a sessions
//                             read failure routes calmly to [] and the
//                             strip stays silent.
//
// The module is a data seam, not a cache: every load re-reads the stores.
// Invalidation is a broadcast, not state — subscribers (useLibrarySnapshot)
// decide what a reload means for their own surface. Zero React imports, so
// the fold-pinning unit suite imports this module directly.
import type {
  Book,
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReadingSessionRecord,
} from "../../content/schema";
import { graphemeClusters, normalizeText } from "../../content/normalizeText";
import { listArticles } from "../../content/repository";
import { loadAllLocations } from "../../persistence/locationStore";
import { loadAllHighlights } from "../../persistence/highlightsStore";
import { loadAllNotes } from "../../persistence/notesStore";
import { loadAllReadingSessions } from "../../persistence/readingSessionsStore";
import { listBooks } from "../../persistence/booksStore";
import { loadAllTags } from "./tagsStore";
import { latestLocationByArticle } from "../../reader/readingPosition";

/**
 * The one consistent library read model. All fields derive from ONE settled
 * Promise.all — no fold can straddle two reads.
 */
export interface LibrarySnapshot {
  /** The composite library (bundled fixtures ∪ ingested rows). */
  articles: CanonicalArticle[];
  /** Articles WITHOUT ingestionMeta.bookId (top-level rows; D12-01). */
  standaloneArticles: CanonicalArticle[];
  /** Chapter members grouped by bookId, in article-list order (D12-01). */
  chaptersByBook: Map<string, CanonicalArticle[]>;
  /** Every Book row; a books-load failure routes calmly to [] (fail-quiet). */
  books: Book[];
  /** EVERY persisted LocationRecord (raw rows for bookProgress derivations). */
  locations: LocationRecord[];
  /** THE latest-location fold (max savedAt per articleId — D8-10; ties keep
   * the first row in iteration order, the readingPosition discipline). */
  latestLocationByArticleId: Map<string, LocationRecord>;
  /** THE grapheme-total fold: graphemeClusters(normalizeText(article), lang)
   * .length per article id (the D-05 substrate, computed once per load). */
  totalsByArticleId: Map<string, number>;
  /** Issue #76 (decision #72) — THE per-article highlight-count fold:
   * highlight rows per articleId, computed once per load (the library-row
   * entry gate ≥ 1 and the review article-combobox counts read THIS map —
   * no consumer re-folds the raw rows). */
  highlightCountByArticleId: Map<string, number>;
  /** Article tags ∪ book tags, localeCompare-sorted (the D12-04 chip list). */
  tags: string[];
  /** EVERY persisted HighlightRecord (the review view's rows + the
   * highlights export's payload; corrupt rows already dropped at the seam). */
  highlights: HighlightRecord[];
  /** EVERY persisted NoteRecord (keyed by highlightId; corrupt rows already
   * dropped at the seam). */
  notes: NoteRecord[];
  /** EVERY persisted ReadingSessionRecord (issue #38 — the stats strip's
   * payload; fail-quiet [] on a sessions-read failure; corrupt rows already
   * dropped at the seam). */
  readingSessions: ReadingSessionRecord[];
}

/** The pre-first-load snapshot: every collection empty, every fold settled. */
export const EMPTY_LIBRARY_SNAPSHOT: LibrarySnapshot = {
  articles: [],
  standaloneArticles: [],
  chaptersByBook: new Map(),
  books: [],
  locations: [],
  latestLocationByArticleId: new Map(),
  totalsByArticleId: new Map(),
  highlightCountByArticleId: new Map(),
  tags: [],
  highlights: [],
  notes: [],
  readingSessions: [],
};

/**
 * THE per-article highlight-count fold (issue #76, decision #72) — one pass
 * over the highlight rows, count per articleId. Named + exported like its
 * sibling fold `latestLocationByArticle`: one definition, pinned directly
 * by the fold unit suite, consumed through the snapshot.
 */
export function highlightCountByArticle(
  highlights: HighlightRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const highlight of highlights) {
    counts.set(highlight.articleId, (counts.get(highlight.articleId) ?? 0) + 1);
  }
  return counts;
}

/**
 * loadLibrarySnapshot — the ONE whole-library read. Composes the existing
 * store seams in parallel and derives every fold from the same settled
 * results. Rejects only when a load the library cannot render without
 * fails (articles/locations/tags/highlights/notes — the mirrors of the old
 * LibraryView/ReviewView load effects' Promise.all); a books or
 * reading-sessions failure stays fail-quiet ([]).
 */
export async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  const [articles, locations, tags, booksResult, highlights, notes, readingSessions] =
    await Promise.all([
      listArticles(),
      loadAllLocations(),
      loadAllTags(),
      listBooks(),
      loadAllHighlights(),
      loadAllNotes(),
      // Issue #38 — fail-quiet like books: the stats strip is spare chrome,
      // so a sessions-read failure routes calmly to [] (never blocks the
      // library the reader cannot render without).
      loadAllReadingSessions().catch(() => []),
    ]);
  const books = booksResult.ok ? booksResult.books : [];

  // The D12-01 partition — chapter members grouped under their Book, never
  // top-level rows (moved verbatim from LibraryView's render body).
  const standaloneArticles: CanonicalArticle[] = [];
  const chaptersByBook = new Map<string, CanonicalArticle[]>();
  for (const article of articles) {
    const bookId = article.ingestionMeta?.bookId;
    if (bookId) {
      const list = chaptersByBook.get(bookId) ?? [];
      list.push(article);
      chaptersByBook.set(bookId, list);
    } else {
      standaloneArticles.push(article);
    }
  }

  // THE grapheme-total fold — one Intl.Segmenter pass per load (the same
  // totalsById memo LibraryView/the strip/BookRow each used to run).
  const totalsByArticleId = new Map<string, number>();
  for (const article of articles) {
    totalsByArticleId.set(
      article.id,
      graphemeClusters(normalizeText(article), article.lang).length,
    );
  }

  // THE latest-location fold — readingPosition's one fold (Issue #2).
  const latestLocationByArticleId = latestLocationByArticle(locations);

  // Issue #76 — THE per-article highlight-count fold (one pass per load;
  // the library rows' review entry + the review combobox counts read it).
  const highlightCountByArticleId = highlightCountByArticle(highlights);

  // Chip list = article tags ∪ book tags (D12-04), the loadAllTags
  // localeCompare discipline (moved verbatim from LibraryView).
  const tagSet = new Set<string>(tags);
  for (const book of books) {
    for (const tag of book.tags ?? []) {
      tagSet.add(tag);
    }
  }

  return {
    articles,
    standaloneArticles,
    chaptersByBook,
    books,
    locations,
    latestLocationByArticleId,
    totalsByArticleId,
    highlightCountByArticleId,
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    highlights,
    notes,
    readingSessions,
  };
}

// ── Invalidation (the one write-followup call) ──────────────────────────────
// Write paths (remove article/book, add book, edit metadata, read-state
// changes, review-panel curation, bundle import) call
// invalidateLibrarySnapshot() after the write lands; subscribed
// consumers re-run their load. A plain broadcast set — no state, no caching,
// no third-party store (the AGENTS.md stack rule): the hook below the bus
// owns whatever reload semantics a surface needs.

const invalidationListeners = new Set<() => void>();

/**
 * invalidateLibrarySnapshot — call ONCE after a library write lands. Every
 * subscribed consumer reloads (stale-while-revalidate semantics belong to
 * the consumer's hook, not to this bus).
 */
export function invalidateLibrarySnapshot(): void {
  for (const listener of invalidationListeners) {
    listener();
  }
}

/**
 * onLibrarySnapshotInvalidated — subscribe to invalidation broadcasts.
 * Returns the unsubscribe function (the useEffect cleanup shape).
 */
export function onLibrarySnapshotInvalidated(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}
