// src/ingestion/library/BookRow.tsx
// Plan 12-05 Task 1 — the expandable book row (D12-01 + D12-06 + D12-11).
// ONE top-level `<li class="book-row">` per Book; chapter articles render as
// SUB-ROWS inside the controlled disclosure region, never as top-level
// library rows (the 08-05 `.library-list > li` direct-child lesson — e2e row
// counts keep working because sub-rows are nested, not siblings).
//
// Native disclosure semantics (T-12-15): a REAL chevron `<button>` carrying
// aria-expanded + aria-controls toggles a region whose id matches. Row-click
// does NOT toggle — two gestures, two targets (12-RESEARCH Pattern 7 L316:
// the row's primary action is Resume/open; the chevron owns disclosure).
//
// Issue #67 (locked IA, variant A) — the book row adopts the ONE row
// anatomy (LibraryRow's): a MAIN column (title → metaline → tags →
// progress/Finished → disclosure) plus the right-aligned ICON action
// cluster (trash only — books carry no editable overrides). The TITLE is
// the resume affordance: it links to the D12-07 last-read chapter while
// one exists, else to the first declared chapter (an unread book's title
// opens the book at its start; D12-06 numbering shows in the metaline).
// The old standalone "Resume" text link and the in-region "Remove book"
// text button are superseded by the title link and the cluster trash
// (BookRemoveConfirm still gates the sole removeBook call site — Task 2
// wires the dialog; BookRow itself only fires the onRemove callback).
//
// Expanded region: the chapter sub-list (LibraryRow anatomy at headingLevel
// 3), the D12-11 skip disclosure when skippedChapterCount > 0, and the book
// TagEntry (D12-04 — tags persist on the BOOK record via setBookTags).
//
// Chapter ordering is the planner's partial-import-tolerant resolution:
// chapterArticleIds order first (rows missing from the record simply don't
// render), then any live rows extra to the record appended in load order.
//
// Issue #3 — the row consumes the ONE LibrarySnapshot: per-chapter totals
// read snapshot.totalsByArticleId (the ONE grapheme-total fold) and
// per-chapter hairlines read snapshot.latestLocationByArticleId (the ONE
// latest-location fold). Issue #8 — the book-progress derivations take that
// same precomputed fold; no consumer folds the raw rows, no local fold
// copies remain.
import { useMemo, useState } from "react";
import type { Book, CanonicalArticle } from "../../content/schema";
import { TagEntry } from "../../reader/TagEntry";
import { setBookTags } from "./tagsStore";
import {
  deriveBookProgress,
  resolveResumeChapterId,
  chapterOrdinal,
} from "./bookProgress";
import { bookReadingState } from "./readingState";
import { LibraryRow } from "./LibraryRow";
import { RowProgress, RowTags } from "./RowAnatomy";
import type { LibrarySnapshot } from "./librarySnapshot";
import { TrashIcon } from "../../ui/icons";

interface BookRowProps {
  /** The Book record (its chapterArticleIds are the ordered TOC). */
  book: Book;
  /** The book's chapter articles (live rows, any order — BookRow orders). */
  chapters: CanonicalArticle[];
  /** The ONE library read model (Issue #3) — locations, the latest-location
   * fold, and the grapheme-total fold this row's derivations consume. */
  snapshot: LibrarySnapshot;
  /** Remove-book trigger — LibraryView routes it to BookRemoveConfirm. */
  onRemove: () => void;
}

export function BookRow({
  book,
  chapters,
  snapshot,
  onRemove,
}: BookRowProps) {
  const [open, setOpen] = useState(false);

  // D12-03 book progress + D12-07 resume target — pure derivations, zero
  // new measurement (bookProgress.ts owns the algebra; the text-length
  // lookup reads the snapshot's ONE totals fold, the latest-location input
  // is the snapshot's ONE precomputed fold — Issue #8, never a re-fold).
  const progress = useMemo(
    () =>
      deriveBookProgress(
        book,
        snapshot.latestLocationByArticleId,
        (articleId) => snapshot.totalsByArticleId.get(articleId),
      ),
    [book, snapshot],
  );
  const resumeChapterId = useMemo(
    () => resolveResumeChapterId(book, snapshot.latestLocationByArticleId),
    [book, snapshot.latestLocationByArticleId],
  );

  // Partial-import-tolerant ordering: the book's declared TOC order first
  // (missing rows silently absent), then live rows extra to the record
  // appended in load order.
  const orderedChapters = useMemo(() => {
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const ordered: CanonicalArticle[] = [];
    for (const chapterId of book.chapterArticleIds) {
      const row = byId.get(chapterId);
      if (row) ordered.push(row);
    }
    const declared = new Set(book.chapterArticleIds);
    for (const c of chapters) {
      if (!declared.has(c.id)) ordered.push(c);
    }
    return ordered;
  }, [book, chapters]);

  // D14-20 — the finished decision routes through the ONE policy module
  // (readingState.ts); the progress memo above stays untouched because
  // the hairline ratio still needs it.
  const isFinished =
    bookReadingState(
      book,
      snapshot.latestLocationByArticleId,
      (articleId) => snapshot.totalsByArticleId.get(articleId),
    ) === "finished";
  const chaptersRegionId = `chapters-${book.id}`;
  const chapterCount = book.chapterArticleIds.length;

  // Issue #67 — the title's link target: the D12-07 resume chapter while
  // one exists, else the first declared chapter (an unread book opens at
  // its start). A book with zero live chapters renders an unlinked title
  // (honest — there is nothing to open).
  const titleTarget = resumeChapterId ?? orderedChapters[0]?.id ?? null;
  const inProgress = progress > 0 && !isFinished;
  // D12-06 numbering for the metaline (review fix — `number | null`, never a
  // 0 sentinel): null whenever the book isn't mid-book, so the metaline
  // guard below is the ONLY consumer of the sentinel and the derivation
  // can't silently read as "chapter 0".
  const ordinal: number | null =
    inProgress && resumeChapterId !== null
      ? chapterOrdinal(book, resumeChapterId)
      : null;

  return (
    <li className="book-row">
      <article className="book-card">
        <div className="library-row-main">
          {/* Issue #67 — the title IS the resume link (aria-labelledby → the
              h2 keeps the accessible name = the book title). Unlinked only
              when no chapter row is live. */}
          <h2 id={`title-${book.id}`}>
            {titleTarget !== null ? (
              <a className="library-card-link" href={`#/article/${titleTarget}`}>
                {book.title}
              </a>
            ) : (
              book.title
            )}
          </h2>
          {/* Issue #67 — ONE metaline: kind+TOC size · authors · position. */}
          <div className="library-card-meta">
            <p className="meta">Book · {chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}</p>
            {book.authors.length > 0 && (
              <p className="meta">{book.authors.join(", ")}</p>
            )}
            {ordinal !== null && (
              <p className="meta">
                Chapter {ordinal} of {chapterCount}
              </p>
            )}
          </div>
          {/* D12-04 — book tags display on the row (editing stays in the
              expanded region's TagEntry) — the shared RowAnatomy piece. */}
          <RowTags tags={book.tags ?? []} />
          {/* D12-03 book progress block (chapters-finished ratio) — the
              shared RowAnatomy piece: hairline + % while in progress, the
              quiet Finished chip at 1, nothing while unread. */}
          <RowProgress finished={isFinished} progress={progress} />
          {/* T-12-15 — REAL disclosure button. aria-expanded + aria-controls
              region; row-click never toggles (two gestures, two targets). */}
          <button
            type="button"
            className="btn btn-icon book-toggle"
            aria-expanded={open}
            aria-controls={chaptersRegionId}
            aria-label={`Chapters of ${book.title}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="book-chevron" aria-hidden="true">
              ▸
            </span>
          </button>
          {/* The controlled disclosure region (always in the DOM so
              aria-controls resolves in both states; `hidden` collapses it). */}
          <div id={chaptersRegionId} className="book-chapters" hidden={!open}>
            <ul className="book-chapter-list">
              {orderedChapters.map((chapter) => (
                <LibraryRow
                  key={chapter.id}
                  article={chapter}
                  headingLevel={3}
                  location={snapshot.latestLocationByArticleId.get(chapter.id)}
                  total={snapshot.totalsByArticleId.get(chapter.id) ?? 0}
                  highlightCount={snapshot.highlightCountByArticleId.get(chapter.id)}
                />
              ))}
            </ul>
            {/* D12-11 — calm skip disclosure. Never silently missing, never
                silently broken; absent when nothing was skipped. */}
            {book.skippedChapterCount > 0 && (
              <p className="meta book-skip-disclosure">
                {book.skippedChapterCount === 1
                  ? "1 chapter could not be read."
                  : `${book.skippedChapterCount} chapters could not be read.`}
              </p>
            )}
            {/* D12-04 — tags live on the BOOK record. TagEntry's saveTags
                override routes commits to setBookTags (tags on chapters are
                out of scope per the D12-04 decision). */}
            <TagEntry
              articleId={book.id}
              tags={book.tags ?? []}
              saveTags={(tags) => setBookTags(book.id, tags)}
            />
          </div>
        </div>
        {/* Issue #67 — the icon action cluster (trash only). The BookRemoveConfirm
            gating stays: this trigger fires the same onRemove callback. */}
        <div className="library-row-actions">
          <button
            type="button"
            className="btn btn-icon library-row-remove"
            aria-label={`Remove ${book.title} from library`}
            onClick={onRemove}
          >
            <TrashIcon />
          </button>
        </div>
      </article>
    </li>
  );
}
