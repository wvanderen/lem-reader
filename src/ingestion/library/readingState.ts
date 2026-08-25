// src/ingestion/library/readingState.ts
// Plan 14-01 Task 1 — PURE reading-state policy (D14-20: ONE derivation
// owned by ONE module). Computes unread | in-progress | finished for
// standalone articles AND books from EXISTING rows — zero new measurement,
// zero React usage, zero Dexie queries of its own (the store-seam
// discipline this file mirrors from bookProgress.ts: components own the
// reads, this module owns the algebra). Views, counts, hairlines, the
// strip, LibraryRow, and BookRow all consume THIS module so counts cannot
// disagree with membership (D14-23/D14-24 structural agreement).
//
// Policy edges pinned by the 12-row truth table
// (tests/unit/library/reading-state.test.ts):
//   - D14-18: no LocationRecord → unread; ANY location (even offset 0)
//     means started (in-progress unless finished) — "recently-read =
//     opened" (D8-10) and the strip's existing membership agree by
//     construction.
//   - D14-19: book finished ⇔ deriveBookProgress === 1 (ALL admitted
//     chapters individually at/above the threshold — D12-03). A book with
//     39 of 40 chapters done is honestly in-progress; there is no second
//     book-level threshold to round up with.
//   - D14-21: a book whose chapter row is missing (unknown text length)
//     can never read finished — deriveBookProgress's own denominator
//     discipline keeps it honestly in-progress.
//
// FINISHED_THRESHOLD is imported from ./ContinueReadingStrip (the exported
// single source of truth — never fork the constant; any numeric threshold
// literal in this file would be a fork of D8-12). The readingState ↔ strip
// import cycle is the exact bookProgress ↔ strip precedent already
// shipping (importing a constant is side-effect free — see bookProgress.ts
// header); do NOT restructure it.
import type { Book, LocationRecord } from "../../content/schema";
import { FINISHED_THRESHOLD } from "./ContinueReadingStrip";
import { deriveBookProgress, resolveResumeChapterId } from "./bookProgress";

/** The library reading-state union (D14-18/D14-19 — the LIB-07 vocabulary). */
export type ReadingState = "unread" | "in-progress" | "finished";

/**
 * articleReadingState (D14-18) — the ONE standalone-article derivation.
 *
 * The ratio formula stays VERBATIM from LibraryRow/the strip
 * (Math.min(1, location.graphemeOffset / total)) so every edge is
 * byte-stable — including the opened-zero-length article (total 0 with a
 * positive offset clamps to 1 → finished; current behavior on every
 * surface, deliberately preserved).
 *
 * @param location The article's latest LocationRecord (caller folds), or
 *                 undefined when the article was never opened.
 * @param total    The article's normalized-text grapheme total
 *                 (`graphemeClusters(normalizeText(article), lang).length`).
 */
export function articleReadingState(
  location: LocationRecord | undefined,
  total: number,
): ReadingState {
  if (!location) return "unread";
  const ratio = Math.min(1, location.graphemeOffset / total);
  return ratio >= FINISHED_THRESHOLD ? "finished" : "in-progress";
}

/**
 * bookReadingState (D14-19/D14-21) — the ONE book-level derivation. Wraps
 * the existing bookProgress functions (never re-implements their algebra):
 * no chapter has any location → unread (resolveResumeChapterId === null);
 * otherwise deriveBookProgress === 1 → finished, else in-progress. The
 * 39/40-chapter and missing-chapter-row edges fall out of
 * deriveBookProgress's own denominator discipline.
 *
 * @param book         The Book record (its ordered chapterArticleIds are
 *                     the denominator).
 * @param locations    ALL persisted LocationRecords (the derivations fold
 *                     to this book's chapters; callers may pass the whole
 *                     library's rows).
 * @param textLengthOf Lookup for a chapter's normalized-text grapheme
 *                     total. Returns undefined when the chapter article
 *                     row is absent (partial import) — such chapters count
 *                     as UNFINISHED, never as errors.
 */
export function bookReadingState(
  book: Book,
  locations: LocationRecord[],
  textLengthOf: (articleId: string) => number | undefined,
): ReadingState {
  if (resolveResumeChapterId(book, locations) === null) return "unread";
  return deriveBookProgress(book, locations, textLengthOf) === 1
    ? "finished"
    : "in-progress";
}

/**
 * A standalone-article entry for countByState — the article id, its latest
 * (caller-folded) location, and its normalized-text grapheme total.
 */
export interface StandaloneArticleEntry {
  id: string;
  location?: LocationRecord;
  total: number;
}

/**
 * countByState (D14-23/D14-24) — fold BOTH derivations into one tally so
 * counts CANNOT disagree with membership: each standalone article counts
 * once via articleReadingState; each book counts ONCE via bookReadingState
 * (matching D12-01 — chapters never count top-level).
 *
 * @param standalone  The standalone (non-chapter) article entries.
 * @param books       Every Book row.
 * @param locations   ALL persisted LocationRecords.
 * @param textLengthOf Lookup for any article id's grapheme total (chapters
 *                     included); undefined when the row is absent.
 */
export function countByState(
  standalone: StandaloneArticleEntry[],
  books: Book[],
  locations: LocationRecord[],
  textLengthOf: (articleId: string) => number | undefined,
): Record<ReadingState, number> {
  const counts: Record<ReadingState, number> = {
    unread: 0,
    "in-progress": 0,
    finished: 0,
  };
  for (const entry of standalone) {
    counts[articleReadingState(entry.location, entry.total)] += 1;
  }
  for (const book of books) {
    counts[bookReadingState(book, locations, textLengthOf)] += 1;
  }
  return counts;
}
