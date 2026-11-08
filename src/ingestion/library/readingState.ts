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
// Issue #246 — finished now delegates to content/completion's shared
// target algebra, including correction arbitration. Without corrections
// the truth table above is unchanged. Location remains the ONLY passage
// position and still decides unread vs in-progress for unfinished targets;
// corrections never manufacture or erase a resume position.
import type { Book, CompletionRecord, LocationRecord } from "../../content/schema";
import {
  articleCompletionFinished,
  completionTargetKey,
  entryFinished,
} from "../../content/completion";
import { resolveResumeChapterId } from "./bookProgress";

const NO_COMPLETIONS: ReadonlyMap<string, CompletionRecord> = new Map();

/** The library reading-state union (D14-18/D14-19 — the LIB-07 vocabulary). */
export type ReadingState = "unread" | "in-progress" | "finished";

/**
 * percentRead (issue #67 review) — the ONE in-progress percent label
 * derivation for every surface (rows, book rows, the continue-reading rail).
 * The 97 cap is display policy, not algebra: an unfinished record never
 * DISPLAYS 98–100% (a 98–99% ratio floors there but still reads
 * "in-progress"; showing ~100% while the Finished chip hasn't arrived reads
 * as stuck). 100% belongs to the Finished chip alone.
 */
export function percentRead(progress: number): number {
  return Math.min(97, Math.floor(progress * 100));
}

/**
 * articleReadingState (D14-18) — the ONE standalone-article derivation.
 *
 * Finished uses the same correction/location arbitration as collections.
 * With no correction the original threshold edges are preserved, including
 * opened-zero-length articles. A finished correction can stand without a
 * location; an unfinished target with no saved position remains unread.
 *
 * @param location The article's latest LocationRecord (caller folds), or
 *                 undefined when the article was never opened.
 * @param total    The article's normalized-text grapheme total
 *                 (`graphemeClusters(normalizeText(article), lang).length`).
 */
export function articleReadingState(
  location: LocationRecord | undefined,
  total: number,
  completion?: CompletionRecord,
): ReadingState {
  if (articleCompletionFinished(location, total, completion)) return "finished";
  return location ? "in-progress" : "unread";
}

/**
 * bookReadingState (D14-19/D14-21) — the ONE book-level derivation. Wraps
 * shared target-completion algebra (book corrections and per-chapter
 * corrections included). If unfinished, no chapter location means unread;
 * otherwise in-progress. Without corrections the original declared-chapter
 * denominator and missing-chapter-row behavior are preserved.
 *
 * @param book              The Book record (its ordered chapterArticleIds
 *                          are the denominator).
 * @param latestByArticleId THE latest-location fold (max savedAt per
 *                          articleId) — pass snapshot.latestLocationByArticleId,
 *                          never raw rows (Issue #8: the snapshot owns the
 *                          fold; consumers never re-fold).
 * @param textLengthOf      Lookup for a chapter's normalized-text grapheme
 *                          total. Returns undefined when the chapter article
 *                          row is absent (partial import) — such chapters
 *                          count as UNFINISHED, never as errors.
 */
export function bookReadingState(
  book: Book,
  latestByArticleId: ReadonlyMap<string, LocationRecord>,
  textLengthOf: (articleId: string) => number | undefined,
  completions: ReadonlyMap<string, CompletionRecord> = NO_COMPLETIONS,
): ReadingState {
  if (
    entryFinished(
      { kind: "book", bookId: book.id },
      {
        completionByKey: completions,
        latestLocationByArticleId: latestByArticleId,
        textLengthOf,
        chapterArticleIdsOf: () => book.chapterArticleIds,
      },
    )
  )
    return "finished";
  return resolveResumeChapterId(book, latestByArticleId) === null ? "unread" : "in-progress";
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
 * @param standalone        The standalone (non-chapter) article entries.
 * @param books             Every Book row.
 * @param latestByArticleId THE latest-location fold (max savedAt per
 *                          articleId) — pass snapshot.latestLocationByArticleId.
 * @param textLengthOf      Lookup for any article id's grapheme total
 *                          (chapters included); undefined when the row is
 *                          absent.
 */
export function countByState(
  standalone: StandaloneArticleEntry[],
  books: Book[],
  latestByArticleId: ReadonlyMap<string, LocationRecord>,
  textLengthOf: (articleId: string) => number | undefined,
  completions: ReadonlyMap<string, CompletionRecord> = NO_COMPLETIONS,
): Record<ReadingState, number> {
  const counts: Record<ReadingState, number> = {
    unread: 0,
    "in-progress": 0,
    finished: 0,
  };
  for (const entry of standalone) {
    counts[
      articleReadingState(
        entry.location,
        entry.total,
        completions.get(completionTargetKey({ kind: "article", articleId: entry.id })),
      )
    ] += 1;
  }
  for (const book of books) {
    counts[bookReadingState(book, latestByArticleId, textLengthOf, completions)] += 1;
  }
  return counts;
}
