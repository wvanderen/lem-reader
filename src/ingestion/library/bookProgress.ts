// src/ingestion/library/bookProgress.ts
// Plan 12-05 Task 1 — PURE book-level derivations over existing
// LocationRecords (D12-03 + D12-07). ZERO new measurement: every input is a
// persisted row (Book.chapterArticleIds + LocationRecord[]) plus a
// caller-supplied text-length lookup. This module has NO React usage and NO
// Dexie queries of its own — components own the reads (the store-seam
// discipline), this module owns the algebra.
//
// FINISHED_THRESHOLD is imported from ./ContinueReadingStrip (the exported
// single source of truth — never fork the constant). This module lives
// BESIDE the strip precisely to avoid a persistence→ingestion cycle; the
// transitive module load constructs the Dexie instance lazily (no open, no
// query — importing a constant is side-effect free).
//
// Contracts (12-05-PLAN.md §must_haves truths):
//   - deriveBookProgress (D12-03): chapters-finished ratio — count(chapter
//     locations at >= FINISHED_THRESHOLD x chapter text length) ÷
//     chapterArticleIds.length. A chapter with NO location is unfinished; a
//     chapter whose text length is UNKNOWN (article row missing — partial
//     import) is unfinished. 0 when the chapter list is empty.
//   - resolveResumeChapterId (D12-07): the chapter id (within
//     chapterArticleIds) whose LocationRecord has the MAX savedAt —
//     last-read wins, even mid-chapter or re-skimmed earlier. null when no
//     chapter has a location.
//   - chapterOrdinal (D12-06): the 1-based position of a chapter within
//     chapterArticleIds — the "Chapter N" source; callers render "of M" with
//     chapterArticleIds.length.
//
// The latest-per-article fold mirrors ContinueReadingStrip.tsx L72-78 /
// LibraryView.tsx L78-84 exactly (max savedAt per articleId — D8-10
// "recently-read = opened"). LocationRecords are keyed [articleId+revision],
// so a chapter read across revisions carries several rows; the latest-savedAt
// row is the live truth for BOTH the finished check and the resume pick.
import type { Book, LocationRecord } from "../../content/schema";
import { FINISHED_THRESHOLD } from "./ContinueReadingStrip";

/**
 * latestLocationByArticle — index the max-savedAt LocationRecord per
 * articleId (the D8-10 fold; identical comparison discipline to the strip +
 * LibraryView folds — ISO-8601 strings from Date.prototype.toISOString()
 * compare correctly lexicographically).
 */
function latestLocationByArticle(
  locations: LocationRecord[],
): Map<string, LocationRecord> {
  const latest = new Map<string, LocationRecord>();
  for (const loc of locations) {
    const prev = latest.get(loc.articleId);
    if (!prev || loc.savedAt > prev.savedAt) {
      latest.set(loc.articleId, loc);
    }
  }
  return latest;
}

/**
 * deriveBookProgress (D12-03) — chapters-finished ratio in [0, 1].
 *
 * @param book         The Book record (its ordered chapterArticleIds are the
 *                     denominator).
 * @param locations    ALL persisted LocationRecords (the fold filters to the
 *                     book's chapters; callers may pass the whole library's
 *                     rows).
 * @param textLengthOf Lookup for a chapter's normalized-text grapheme total
 *                     (`graphemeClusters(normalizeText(article), lang)
 *                     .length`). Returns undefined when the chapter article
 *                     row is absent (partial import) — such chapters count
 *                     as UNFINISHED, never as errors.
 * @returns finished-chapters ÷ chapterArticleIds.length; 0 when the book
 *                   declares no chapters.
 */
export function deriveBookProgress(
  book: Book,
  locations: LocationRecord[],
  textLengthOf: (articleId: string) => number | undefined,
): number {
  const total = book.chapterArticleIds.length;
  if (total === 0) return 0;
  const latest = latestLocationByArticle(locations);
  let finished = 0;
  for (const chapterId of book.chapterArticleIds) {
    const loc = latest.get(chapterId);
    if (!loc) continue; // never opened → unfinished
    const len = textLengthOf(chapterId);
    if (len === undefined) continue; // unknown text length → unfinished
    if (loc.graphemeOffset >= FINISHED_THRESHOLD * len) {
      finished += 1;
    }
  }
  return finished / total;
}

/**
 * resolveResumeChapterId (D12-07) — the chapter whose latest LocationRecord
 * has the max savedAt within the book. Last-read wins even when it is
 * mid-chapter or an EARLIER chapter re-skimmed later (the re-skim's savedAt
 * is newer — predictability beats read-in-order assumptions).
 *
 * @returns The chapter article id, or null when no chapter of this book has
 *          any location (a fresh book — nothing to resume).
 */
export function resolveResumeChapterId(
  book: Book,
  locations: LocationRecord[],
): string | null {
  const chapterSet = new Set(book.chapterArticleIds);
  const latest = latestLocationByArticle(locations);
  let bestId: string | null = null;
  let bestAt: string | null = null;
  for (const [articleId, loc] of latest) {
    if (!chapterSet.has(articleId)) continue;
    if (bestAt === null || loc.savedAt > bestAt) {
      bestAt = loc.savedAt;
      bestId = articleId;
    }
  }
  return bestId;
}

/**
 * chapterOrdinal (D12-06) — the 1-based position of chapterId within the
 * book's ordered chapterArticleIds (the book's own TOC — publisher intent is
 * the unit of truth, so "Chapter 4" matches the printed TOC). Returns 0 for
 * an id outside the record (partial-import tolerance: callers skip the
 * "Chapter N of M" label rather than guess a position).
 */
export function chapterOrdinal(book: Book, chapterId: string): number {
  const index = book.chapterArticleIds.indexOf(chapterId);
  return index === -1 ? 0 : index + 1;
}
