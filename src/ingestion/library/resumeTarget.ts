// src/ingestion/library/resumeTarget.ts
// Issue #82 (decision #68) — THE shared resume-target derivation. One
// pure function derives the unfinished, most-recently-opened reading
// targets (standalone articles + in-progress books) over the ONE
// LibrarySnapshot; the Continue-Reading rail renders the first three and
// the shell header's Read destination consumes the first (the target).
// Rail and nav CANNOT disagree: there is no second copy of the filter,
// membership, or sort logic to drift (the #68 build note — "do not copy
// the filter logic").
//
// Derivation (lifted VERBATIM from ContinueReadingStrip's entries memo,
// which itself routes through the ONE policy modules — D14-20
// readingState.ts + D12-03/D12-07 bookProgress.ts):
//   - Standalone articles (never chapter members — D12-02) with a latest
//     location whose articleReadingState is "in-progress".
//   - ONE book entry per bookReadingState "in-progress" book, articleId =
//     the D12-07 resume chapter (max savedAt within the book), sort key =
//     that chapter's location savedAt (genuine recency — D8-10).
//   - Finished AND never-opened (unread) rows are excluded — "unfinished"
//     means in-progress. Mark-unread restores ELIGIBILITY (it deletes the
//     location rows, so a finished article loses its finished state) and
//     the article re-enters on its next in-progress save; there is no
//     permanent exclusion memory.
//   - Sort: lastOpenedAt savedAt descending (D8-10 — most-recently-opened
//     first); articles tie ahead of books (build order + stable sort —
//     the shipped rail discipline, preserved byte-stable).
//
// Zero React usage, zero Dexie queries (the store-seam discipline — the
// snapshot owns the folds, this module owns the algebra). No cap here:
// the rail slices 3 (D8-09); the nav takes [0].
import type { CanonicalArticle } from "../../content/types";
import type { Book } from "../../content/schema";
import {
  chapterOrdinal,
  deriveBookProgress,
  resolveResumeChapterId,
} from "./bookProgress";
import { articleReadingState, bookReadingState } from "./readingState";
import type { LibrarySnapshot } from "./librarySnapshot";

/**
 * One unfinished reading target. `articleId` is the article to OPEN — the
 * standalone article itself, or the book's D12-07 resume chapter (the
 * book-aware pointer decision #68 locked). `lastOpenedAt` is the shared
 * sort key (the entry's latest reading activity).
 */
export type ResumeTargetEntry =
  | {
      kind: "article";
      articleId: string;
      article: CanonicalArticle;
      progress: number;
      lastOpenedAt: string;
    }
  | {
      kind: "book";
      articleId: string;
      book: Book;
      resumeChapterId: string;
      ordinal: number;
      total: number;
      progress: number;
      lastOpenedAt: string;
    };

/**
 * deriveResumeTargets — every unfinished target, savedAt descending (no
 * cap). Consumers: ContinueReadingStrip (slice 3, the rail) and App's
 * shell Read destination ([0] = THE resume target; [] → the link is
 * hidden entirely — never a disabled state, decision #68).
 *
 * @param snapshot The ONE library read model (from useLibrarySnapshot) —
 *                 its precomputed folds feed every derivation; consumers
 *                 never re-fold raw rows.
 */
export function deriveResumeTargets(
  snapshot: LibrarySnapshot,
): ResumeTargetEntry[] {
  const latestByArticle = snapshot.latestLocationByArticleId;
  const totalsById = snapshot.totalsByArticleId;

  // Standalone article entries (D12-02: chapter members — articles
  // carrying ingestionMeta.bookId — NEVER emit their own entry; the
  // snapshot's partition already excluded them).
  const articleEntries: ResumeTargetEntry[] = snapshot.standaloneArticles.flatMap(
    (article) => {
      const location = latestByArticle.get(article.id);
      if (!location) return [];
      const total = totalsById.get(article.id) ?? 0;
      const progress = Math.min(1, location.graphemeOffset / total);
      // D14-20 — the membership gate is a !== in-progress check on
      // the ONE policy module.
      if (articleReadingState(location, total) !== "in-progress") return [];
      return [
        {
          kind: "article" as const,
          articleId: article.id,
          article,
          progress,
          lastOpenedAt: location.savedAt,
        },
      ];
    },
  );

  // ONE book-level entry per in-progress book (D12-02): any chapter
  // location + chapters-finished progress < 1. The D12-06 "Chapter N of
  // M" numbering rides the entry for the rail's label; the link resumes
  // the D12-07 last-read chapter.
  const bookEntries: ResumeTargetEntry[] = snapshot.books.flatMap((book) => {
    // D14-20 — the membership gate is a !== in-progress check on the ONE
    // policy module. Issue #8 — every derivation reads the snapshot's ONE
    // precomputed latest-location fold (never a re-fold of the raw rows).
    if (
      bookReadingState(book, latestByArticle, (articleId) =>
        totalsById.get(articleId),
      ) !== "in-progress"
    )
      return [];
    const resumeChapterId = resolveResumeChapterId(book, latestByArticle);
    if (resumeChapterId === null) return []; // defensive — in-progress implies a resume chapter
    const progress = deriveBookProgress(book, latestByArticle, (articleId) =>
      totalsById.get(articleId),
    );
    const ordinal = chapterOrdinal(book, resumeChapterId);
    const total = book.chapterArticleIds.length;
    if (ordinal === 0 || total === 0) return []; // defensive — resume id outside the record
    const resumeLocation = latestByArticle.get(resumeChapterId);
    if (!resumeLocation) return [];
    return [
      {
        kind: "book" as const,
        articleId: resumeChapterId,
        book,
        resumeChapterId,
        ordinal,
        total,
        progress,
        lastOpenedAt: resumeLocation.savedAt,
      },
    ];
  });

  return [...articleEntries, ...bookEntries]
    .sort((a, b) =>
      // savedAt descending (most-recently-opened first — D8-10).
      a.lastOpenedAt < b.lastOpenedAt ? 1 : a.lastOpenedAt > b.lastOpenedAt ? -1 : 0,
    );
}
