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
// Collapsed card: h2 book title + joined authors + the quiet "Book" source
// badge + the book progress hairline (deriveBookProgress — D12-03) + a
// Resume link to the D12-07 last-read chapter (shown while a resume chapter
// exists AND progress < 1).
//
// Expanded region: the chapter sub-list (LibraryRow anatomy at headingLevel
// 3 — SourceBadge, per-chapter hairline from that chapter's location, open
// link), the D12-11 skip disclosure when skippedChapterCount > 0, the book
// TagEntry (D12-04 — tags persist on the BOOK record via setBookTags), and
// the calm Remove book trigger (BookRemoveConfirm gates it — Task 2 wires
// the dialog; BookRow itself only fires the onRemove callback).
//
// Chapter ordering is the planner's partial-import-tolerant resolution:
// chapterArticleIds order first (rows missing from the record simply don't
// render), then any live rows extra to the record appended in load order.
import { useMemo, useState } from "react";
import type {
  Book,
  CanonicalArticle,
  LocationRecord,
} from "../../content/schema";
import { normalizeText, graphemeClusters } from "../../content/normalizeText";
import { ProgressHairline } from "../../reader/ProgressHairline";
import { TagEntry } from "../../reader/TagEntry";
import { setBookTags } from "../../persistence/booksStore";
import {
  deriveBookProgress,
  resolveResumeChapterId,
} from "./bookProgress";
import { LibraryRow } from "./LibraryRow";

interface BookRowProps {
  /** The Book record (its chapterArticleIds are the ordered TOC). */
  book: Book;
  /** The book's chapter articles (live rows, any order — BookRow orders). */
  chapters: CanonicalArticle[];
  /** ALL persisted LocationRecords (the derivations fold to this book). */
  locations: LocationRecord[];
  /** Remove-book trigger — LibraryView routes it to BookRemoveConfirm. */
  onRemove: () => void;
}

export function BookRow({
  book,
  chapters,
  locations,
  onRemove,
}: BookRowProps) {
  const [open, setOpen] = useState(false);

  // Per-chapter normalized-text totals (D-05 substrate — the same
  // graphemeClusters(normalizeText(article)) computation LibraryRow runs,
  // memoized once per chapters identity rather than per render).
  const totalsById = useMemo(() => {
    const totals = new Map<string, number>();
    for (const article of chapters) {
      totals.set(
        article.id,
        graphemeClusters(normalizeText(article), article.lang).length,
      );
    }
    return totals;
  }, [chapters]);

  // Latest location per chapter (per-chapter sub-row hairlines).
  const latestByChapter = useMemo(() => {
    const latest = new Map<string, LocationRecord>();
    for (const loc of locations) {
      const prev = latest.get(loc.articleId);
      if (!prev || loc.savedAt > prev.savedAt) {
        latest.set(loc.articleId, loc);
      }
    }
    return latest;
  }, [locations]);

  // D12-03 book progress + D12-07 resume target — pure derivations, zero
  // new measurement (bookProgress.ts owns the algebra).
  const progress = useMemo(
    () =>
      deriveBookProgress(book, locations, (articleId) =>
        totalsById.get(articleId),
      ),
    [book, locations, totalsById],
  );
  const resumeChapterId = useMemo(
    () => resolveResumeChapterId(book, locations),
    [book, locations],
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

  const isFinished = progress >= 1;
  const showHairline = progress > 0 && !isFinished;
  const chaptersRegionId = `chapters-${book.id}`;

  return (
    <li className="book-row">
      <article className="book-card">
        <h2 id={`title-${book.id}`}>{book.title}</h2>
        {book.authors.length > 0 && (
          <p className="meta">{book.authors.join(", ")}</p>
        )}
        {/* The Book source badge — byte-parity with SourceBadge's
            badgeLabel("epub-chapter") plain-text variant (the chapter
            sub-rows below render the real SourceBadge component). */}
        <p className="meta source-badge">Book</p>
        {/* D12-03 book progress hairline (chapters-finished ratio). Mirrors
            the LibraryRow hairline/Finished algebra: hidden at 0, hairline
            while 0 < ratio < 1, filled-circle Finished mark at 1. */}
        {showHairline && <ProgressHairline progress={progress} />}
        {isFinished && (
          <p className="meta finished-mark">
            <span aria-hidden="true">●</span> Finished
          </p>
        )}
        {/* D12-07 Resume — the last-read chapter; hidden once the book is
            finished (nothing left to resume) or never opened. */}
        {resumeChapterId !== null && !isFinished && (
          <a
            className="book-resume"
            href={`#/article/${resumeChapterId}`}
            aria-labelledby={`title-${book.id}`}
          >
            Resume
          </a>
        )}
        {/* T-12-15 — REAL disclosure button. aria-expanded + aria-controls
            region; row-click never toggles (two gestures, two targets). */}
        <button
          type="button"
          className="book-toggle"
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
                location={latestByChapter.get(chapter.id)}
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
          {/* The calm destructive trigger — BookRemoveConfirm (Task 2) gates
              the sole removeBook call site behind explicit consent. */}
          <button type="button" className="book-remove" onClick={onRemove}>
            Remove book
          </button>
        </div>
      </article>
    </li>
  );
}
