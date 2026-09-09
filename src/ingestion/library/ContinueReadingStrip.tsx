// src/ingestion/library/ContinueReadingStrip.tsx
// Plan 08-03 Task 2 — ContinueReadingStrip (D8-09, D8-10, D8-12). Spare
// section above the main library list showing the 1–3 most-recently-OPENED
// UNFINISHED articles. Mounted only when the unfinished set is non-empty
// (returns null otherwise — spare chrome per UI-SPEC §ContinueReadingStrip).
//
// Compact responsive resume cards: native title links cover each surface,
// with progress and an independent mark-as-read action for articles.
// Books retain their chapter-specific resume link and aggregate progress.
//
// Substrate (D-05 grapheme offset):
//   - `loadAllLocations()` (Plan 02) returns ALL persisted LocationRecords
//     (Zod-validated per row — STATE-04 corrupt-row drop).
//   - For each article, the latest matching location is found by articleId
//     (max savedAt per articleId — D8-10 "recently-read = opened").
//   - `progress = location.graphemeOffset / total` where `total =
//     graphemeClusters(normalizeText(article), article.lang).length`.
//   - Filter: membership is an in-progress check on the ONE policy module
//     (readingState.ts — D14-20); entries keep `lastOpened !== null` and
//     the entry's own progress ratio for the hairline.
//   - Sort: `savedAt` descending (most-recently-opened first — D8-10).
//   - Slice: cap 3 (D8-09 calm lower end).
//
// Plan 12-05 Task 2 (D12-02): the strip now shows ONE book-level entry per
// in-progress book — "BookTitle — Chapter N of M" linking to the D12-07
// resume chapter, with the D12-03 chapters-finished hairline. CHAPTER
// articles never emit their own strip entry (filtered from the standalone
// fold via ingestionMeta.bookId); standalone article entries are unchanged.
// The mixed sort key stays `savedAt` descending — a book entry's key is its
// resume chapter's location savedAt (the most recent reading activity in
// the book), so books and articles interleave by genuine recency.
//
// Plan 14-01 Task 3 (D14-20): the membership DECISIONS (article + book)
// now route through readingState.ts (articleReadingState/bookReadingState
// !== "in-progress") — behavior identical to the old ratio gates; the
// surface, copy, and DOM are untouched (Phase 16 owns the redesign).
//
// Quick 260909-ahy — the strip re-derives via the refreshKey PROP as an
// effect dep (stale-while-revalidate): previously-derived entries keep
// rendering while the reload is in flight. The previous parent-side
// key-remount (commit 109fb3d) flashed because the remounted instance
// began at entries null and unmounted the whole section until the async
// reload re-derived it (content below jumped up, then rebuilt).
//
// `FINISHED_THRESHOLD = 0.98` (RESEARCH §Pattern 4 L498) is EXPORTED so unit
// + e2e tests can reference the same constant (not a magic number).
import { useEffect, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { Book, LocationRecord } from "../../content/schema";
import { normalizeText, graphemeClusters } from "../../content/normalizeText";
import { listArticles } from "../../content/repository";
import { loadAllLocations } from "../../persistence/locationStore";
import { listBooks } from "../../persistence/booksStore";
import { ProgressHairline } from "../../reader/ProgressHairline";
import { deriveBookProgress, resolveResumeChapterId, chapterOrdinal } from "./bookProgress";
import { articleReadingState, bookReadingState } from "./readingState";
import { ReadingStateButton } from "./ReadingStateButton";
import { effectiveTitle, effectiveAuthor } from "./effectiveMetadata";

/**
 * FINISHED_THRESHOLD — D8-12 + RESEARCH §Pattern 4 L498 recommendation. At or
 * above this ratio the article is "Finished": it leaves the continue-reading
 * strip and shows the filled-hairline + "Finished" mark in the main list.
 * Exported so tests + bookProgress.ts can reference the same value without
 * forking the constant.
 */
export const FINISHED_THRESHOLD = 0.98;

/** The cap on continue-reading cards (D8-09 — calm lower end). */
const CONTINUE_READING_CAP = 3;

/**
 * The mixed strip entry union (Plan 12-05 — D12-02). `lastOpenedAt` is the
 * shared sort key (D8-10 recency): an article's location savedAt, or a
 * book's resume-chapter location savedAt.
 */
type StripEntry =
  | {
      kind: "article";
      article: CanonicalArticle;
      progress: number;
      lastOpenedAt: string;
    }
  | {
      kind: "book";
      book: Book;
      resumeChapterId: string;
      ordinal: number;
      total: number;
      progress: number;
      lastOpenedAt: string;
    };

/**
 * ContinueReadingStrip — derives the most-recently-opened unfinished set
 * (standalone articles + in-progress books) from `listArticles()` +
 * `loadAllLocations()` + `listBooks()` on mount. Returns null while loading
 * OR when the unfinished set is empty (spare chrome). A books-load failure
 * routes calmly to article-only entries (the strip is spare chrome; the
 * fail-quiet discipline is unchanged).
 *
 * Quick 260909-ahy — `refreshKey` re-runs the load effect IN PLACE (the
 * component is never remounted by the parent): stale entries stay mounted
 * until fresh data replaces them, so a reading-state write never collapses
 * the section. A strip that legitimately becomes empty still renders null
 * once the FRESH data lands — a single data-driven change, not a flash.
 */
export function ContinueReadingStrip({
  onReadingStateChange,
  refreshKey = 0,
}: {
  onReadingStateChange?: (article: CanonicalArticle, read: boolean) => Promise<void>;
  /** Quick 260909-ahy — bump to re-derive from Dexie WITHOUT remounting. */
  refreshKey?: number;
}) {
  const [entries, setEntries] = useState<StripEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listArticles(), loadAllLocations(), listBooks()])
      .then(([articles, locations, booksResult]) => {
        if (cancelled) return;
        // Index the latest location per articleId (max savedAt per articleId —
        // D8-10 "recently-read = opened"; savedAt is updated on every open).
        const latestByArticle = new Map<string, LocationRecord>();
        for (const loc of locations) {
          const prev = latestByArticle.get(loc.articleId);
          if (!prev || loc.savedAt > prev.savedAt) {
            latestByArticle.set(loc.articleId, loc);
          }
        }
        // Per-article normalized-text totals — computed ONCE for both the
        // article ratios and the book chapters-finished derivations (the
        // same D-05 substrate LibraryRow/BookRow consume).
        const totalsById = new Map<string, number>();
        for (const article of articles) {
          totalsById.set(article.id, graphemeClusters(normalizeText(article), article.lang).length);
        }

        // Standalone article entries (D12-02: chapter members — articles
        // carrying ingestionMeta.bookId — NEVER emit their own entry).
        const articleEntries: StripEntry[] = articles
          .filter((a) => !a.ingestionMeta?.bookId)
          .flatMap((article) => {
            const location = latestByArticle.get(article.id);
            if (!location) return [];
            const total = totalsById.get(article.id) ?? 0;
            const progress = Math.min(1, location.graphemeOffset / total);
            // D14-20 — the membership gate is a !== in-progress check on
            // the ONE policy module (behavior identical to the old
            // progress >= FINISHED_THRESHOLD gate; the ratio above still
            // feeds the entry's hairline).
            if (articleReadingState(location, total) !== "in-progress") return [];
            return [
              {
                kind: "article" as const,
                article,
                progress,
                lastOpenedAt: location.savedAt,
              },
            ];
          });

        // ONE book-level entry per in-progress book (D12-02): any chapter
        // location + chapters-finished progress < 1. The label carries the
        // D12-06 "Chapter N of M" numbering; the link resumes the D12-07
        // last-read chapter.
        const bookEntries: StripEntry[] = (booksResult.ok ? booksResult.books : []).flatMap(
          (book) => {
            // D14-20 — the membership gate is a !== in-progress check on
            // the ONE policy module (behavior identical to the old
            // resumeChapterId === null + progress >= 1 gates). The entry
            // construction below still needs the resume / ordinal /
            // progress derivations, so only the membership decision swaps.
            if (
              bookReadingState(book, locations, (articleId) => totalsById.get(articleId)) !==
              "in-progress"
            )
              return [];
            const resumeChapterId = resolveResumeChapterId(book, locations);
            if (resumeChapterId === null) return []; // defensive — in-progress implies a resume chapter
            const progress = deriveBookProgress(book, locations, (articleId) =>
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
                book,
                resumeChapterId,
                ordinal,
                total,
                progress,
                lastOpenedAt: resumeLocation.savedAt,
              },
            ];
          },
        );

        const unfinished = [...articleEntries, ...bookEntries]
          .sort((a, b) =>
            // savedAt descending (most-recently-opened first — D8-10).
            a.lastOpenedAt < b.lastOpenedAt ? 1 : a.lastOpenedAt > b.lastOpenedAt ? -1 : 0,
          )
          .slice(0, CONTINUE_READING_CAP);
        setEntries(unfinished);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail quiet — the strip is spare chrome; a load failure just hides
        // it (mirrors FixtureList's "ready + empty" non-error discipline).
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
    // Quick 260909-ahy — [refreshKey] (not []): the cleanup's cancelled flag
    // cancels the in-flight run before the next starts (mirrors LibraryView's
    // [refreshKey] load effect). entries is deliberately NOT reset here —
    // stale-while-revalidate keeps the section mounted during the reload.
  }, [refreshKey]);

  // null = still loading; [] = loaded but empty → render nothing in both cases.
  if (!entries || entries.length === 0) return null;

  return (
    <section className="continue-reading-strip" aria-labelledby="cr-heading">
      <h2 id="cr-heading">Continue reading</h2>
      <ul className="continue-reading">
        {entries.map((entry) =>
          entry.kind === "article" ? (
            <li key={`a-${entry.article.id}`} className="continue-reading-row">
              {/* Plan 17-02 (D17-09) — the strip shows the ONE effective
                  name (effectiveTitle/effectiveAuthor inside the truthy
                  guard); book entries below stay canonical (D17-05). */}
              <a className="library-card-link" href={`#/article/${entry.article.id}`}>
                {effectiveTitle(entry.article)}
              </a>
              {effectiveAuthor(entry.article) && (
                <p className="meta">{effectiveAuthor(entry.article)}</p>
              )}
              <div className="continue-reading-footer">
                <span className="meta">{Math.floor(entry.progress * 100)}% read</span>
                {onReadingStateChange && (
                  <ReadingStateButton
                    title={effectiveTitle(entry.article)}
                    isRead={false}
                    onChange={(read) => onReadingStateChange(entry.article, read)}
                  />
                )}
              </div>
              <ProgressHairline progress={entry.progress} />
            </li>
          ) : (
            <li key={`b-${entry.book.id}`} className="continue-reading-row">
              {/* D12-02 — the book-level entry: ONE link resuming the
                  last-read chapter, labeled with the book's own TOC
                  numbering (D12-06 "Chapter N of M"). */}
              <a className="library-card-link" href={`#/article/${entry.resumeChapterId}`}>
                {entry.book.title} — Chapter {entry.ordinal} of {entry.total}
              </a>
              {entry.book.authors.length > 0 && (
                <p className="meta">{entry.book.authors.join(", ")}</p>
              )}
              <ProgressHairline progress={entry.progress} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
