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
//   - highlightTags         — issue #117 — THE highlight-tag vocabulary fold:
//                             every tag carried by ≥1 HighlightRecord,
//                             case-insensitively deduped (first-seen casing
//                             wins — highlight-local casings are NOT folded
//                             at the write seam), localeCompare-sorted (the
//                             review panel's Highlight-tag chip list; the
//                             article/book `tags` fold above stays
//                             annotation-free).
//   - highlights + notes    — EVERY persisted highlight/note annotation
//                             record (the review view's join input and the
//                             highlights export's payload; loadAllHighlights
//                             /loadAllNotes keep their calm corrupt-row-drop
//                             derivations).
//   - articleNotes          — issue #210 — EVERY persisted saved ArticleNote
//                             (the cross-library review's second row kind;
//                             corrupt rows already dropped at the seam;
//                             recovery drafts stay local-only device state,
//                             never here).
//   - annotationTags        — issue #210 — THE annotation-tag vocabulary
//                             fold: every tag carried by ≥1 highlight OR
//                             article note, case-insensitively deduped
//                             (first-seen casing wins), localeCompare-sorted
//                             (the review panel's Annotation-tag chip list;
//                             renamed from the issue #117 highlightTags —
//                             the same fold, widened to both annotation
//                             kinds). The article/book `tags` fold above
//                             stays annotation-free.
//   - annotationCountByArticleId — issue #210 — THE per-article annotation
//                             count fold: highlight + article-note rows per
//                             articleId (the review article-combobox counts
//                             read THIS map — combined counts are labeled
//                             annotations; the LIBRARY rows' highlight-only
//                             gate keeps reading highlightCountByArticleId).
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
import type { ArticleNote } from "../../persistence/articleNotesStore";
import { graphemeClusters, normalizeText } from "../../content/normalizeText";
import { listArticles } from "../../content/repository";
import { loadAllLocations } from "../../persistence/locationStore";
import { loadAllHighlights } from "../../persistence/highlightsStore";
import { loadAllNotes } from "../../persistence/notesStore";
import { loadAllArticleNotes } from "../../persistence/articleNotesStore";
import { loadAllReadingSessions } from "../../persistence/readingSessionsStore";
import { listBooks } from "../../persistence/booksStore";
import { loadAllTags } from "./tagsStore";
// Issue #117 — the ONE pure tag-text vocabulary backs the highlight-tag
// fold (the tagText module header's "every seam that touches tag strings").
import { normalizeTags } from "./tagText";
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
   * entry gate ≥ 1 reads THIS map — highlight-only; the review
   * article-combobox reads the ANNOTATION fold below — issue #210). */
  highlightCountByArticleId: Map<string, number>;
  /** Issue #210 — THE per-article annotation-count fold: highlight +
   * article-note rows per articleId, computed once per load (the review
   * article-combobox counts read THIS map; combined counts are labeled
   * annotations). */
  annotationCountByArticleId: Map<string, number>;
  /** Article tags ∪ book tags, localeCompare-sorted (the D12-04 chip list). */
  tags: string[];
  /** Issue #210 — THE annotation-tag vocabulary fold (every tag carried by
   * ≥1 highlight OR article note; the renamed issue #117 highlightTags
   * fold), case-insensitively deduped (first-seen casing wins),
   * localeCompare-sorted (the review panel's Annotation-tag chips). */
  annotationTags: string[];
  /** EVERY persisted HighlightRecord (the review view's rows + the
   * highlights export's payload; corrupt rows already dropped at the seam). */
  highlights: HighlightRecord[];
  /** EVERY persisted NoteRecord (keyed by highlightId; corrupt rows already
   * dropped at the seam). */
  notes: NoteRecord[];
  /** Issue #210 — EVERY persisted saved ArticleNote (the review's second
   * row kind; corrupt rows already dropped at the seam; recovery drafts
   * stay local-only device state, never here). */
  articleNotes: ArticleNote[];
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
  annotationCountByArticleId: new Map(),
  tags: [],
  annotationTags: [],
  highlights: [],
  notes: [],
  articleNotes: [],
  readingSessions: [],
};

/**
 * THE annotation-tag vocabulary fold (issue #210; the renamed issue #117
 * `highlightTagVocabulary`) — one pass over BOTH annotation kinds collecting
 * every tag carried by ≥1 highlight or article note. Composes the ONE pure
 * tag-text vocabulary (normalizeTags — trim, drop empties, case-insensitive
 * dedupe with the first-seen casing winning): annotation tags are
 * record-local (the write seam routes casing against the LIBRARY vocabulary
 * only, never across records), so two rows may carry "Margin" and "margin"
 * — the chip list must never show both. Named + exported like its sibling
 * folds: one definition, pinned directly by the fold unit suite, consumed
 * through the snapshot.
 */
export function annotationTagVocabulary(
  highlights: readonly HighlightRecord[],
  articleNotes: readonly ArticleNote[],
): string[] {
  const tags = [
    ...highlights.flatMap((h) => h.tags ?? []),
    ...articleNotes.flatMap((n) => n.tags ?? []),
  ];
  return normalizeTags(tags).sort((a, b) => a.localeCompare(b));
}

/**
 * THE per-article highlight-count fold (issue #76, decision #72) — one pass
 * over the highlight rows, count per articleId. Named + exported like its
 * sibling fold `latestLocationByArticle`: one definition, pinned directly
 * by the fold unit suite, consumed through the snapshot.
 */
export function highlightCountByArticle(highlights: HighlightRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const highlight of highlights) {
    counts.set(highlight.articleId, (counts.get(highlight.articleId) ?? 0) + 1);
  }
  return counts;
}

/**
 * THE per-article ANNOTATION count fold (issue #210) — one pass over BOTH
 * annotation kinds, count per articleId (highlights + article notes). Named
 * + exported like its siblings: one definition, pinned directly by the fold
 * unit suite, consumed through the snapshot. The review article-combobox's
 * counts read THIS fold — combined counts are labeled annotations — while
 * the library rows' review entry keeps its highlight-only sibling above.
 */
export function annotationCountByArticle(
  highlights: readonly HighlightRecord[],
  articleNotes: readonly ArticleNote[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const highlight of highlights) {
    counts.set(highlight.articleId, (counts.get(highlight.articleId) ?? 0) + 1);
  }
  for (const note of articleNotes) {
    counts.set(note.articleId, (counts.get(note.articleId) ?? 0) + 1);
  }
  return counts;
}

/**
 * loadLibrarySnapshot — the ONE whole-library read. Composes the existing
 * store seams in parallel and derives every fold from the same settled
 * results. Rejects only when a load the library cannot render without
 * fails (articles/locations/tags/highlights/notes/articleNotes — the
 * mirrors of the old LibraryView/ReviewView load effects' Promise.all);
 * a books or reading-sessions failure stays fail-quiet ([]).
 */
export async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  const [articles, locations, tags, booksResult, highlights, notes, articleNotes, readingSessions] =
    await Promise.all([
      listArticles(),
      loadAllLocations(),
      loadAllTags(),
      listBooks(),
      loadAllHighlights(),
      loadAllNotes(),
      // Issue #210 — the review's second row kind loads with the rest (a
      // required load: the panel cannot honestly claim an empty annotation
      // set without it).
      loadAllArticleNotes(),
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
  // the library rows' review entry reads it — highlight-only).
  const highlightCountByArticleId = highlightCountByArticle(highlights);

  // Issue #210 — THE per-article annotation-count fold (one pass per load;
  // the review article-combobox counts read it — combined, labeled
  // annotations).
  const annotationCountByArticleId = annotationCountByArticle(highlights, articleNotes);

  // Issue #210 — THE annotation-tag vocabulary fold (one pass per load; the
  // review panel's Annotation-tag chips read it — both annotation kinds).
  const annotationTags = annotationTagVocabulary(highlights, articleNotes);

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
    annotationCountByArticleId,
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    annotationTags,
    highlights,
    notes,
    articleNotes,
    readingSessions,
  };
}

// ── Invalidation (the one write-followup call) ──────────────────────────────
// Issue #101 (review follow-up) — the broadcast itself lives in
// ./librarySnapshotBus now: a zero-dependency module, so write paths on the
// every-load chain and the deferred consumer's mount-time subscription can
// reach the ONE call without importing THIS module's graph (the stores, the
// folds, the grapheme pass). Re-exported here unchanged — every existing
// import site keeps working.
export { invalidateLibrarySnapshot, onLibrarySnapshotInvalidated } from "./librarySnapshotBus";
