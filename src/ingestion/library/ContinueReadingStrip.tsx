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
// Quick 260909-ahy — the strip used to re-derive via its own whole-library
// load keyed on a refreshKey prop (stale-while-revalidate: previously-
// derived entries kept rendering while the reload was in flight).
//
// Issue #3 — that duplicate load is GONE. The strip is now a pure
// derivation over the ONE LibrarySnapshot (passed down from LibraryView's
// useLibrarySnapshot mount): the entries memo recomputes only when the
// snapshot identity changes, so an invalidation reload keeps the stale
// entries mounted until the fresh snapshot lands — the same
// stale-while-revalidate behavior, with the fold copies (latest-location,
// grapheme totals) deleted behind the module. The strip renders null while
// not ready (initial load or load failure — the fail-quiet spare-chrome
// discipline) or when the unfinished set is empty.
//
// Issue #67 (locked IA, variant A) — the rail card slims to the resume
// essentials: the title link (stretched, native navigation), the book
// "Chapter N of M" line, and "% read" + hairline. The author line and the
// strip-level mark-read button are GONE — curation lives in the row action
// clusters (one arrangement, the locked vocabulary); the strip carries
// zero keyboard stops beyond the resume links themselves.
//
// Issue #82 (decision #68) — the derivation MOVED to ./resumeTarget (the
// ONE shared resume-target derivation: the shell header's Read
// destination consumes the same entries' first). This component keeps
// only the rail-specific concerns: the ready gate, the D8-09 cap of 3,
// and the card rendering. Membership, book-awareness, and sort live in
// exactly one place now.
import { useMemo } from "react";
import { ProgressHairline } from "../../reader/ProgressHairline";
import { percentRead } from "./readingState";
import { effectiveTitle } from "./effectiveMetadata";
import type { LibrarySnapshot } from "./librarySnapshot";
import {
  deriveResumeTargets,
  type ResumeTargetEntry,
} from "./resumeTarget";

/** The cap on continue-reading cards (D8-09 — calm lower end). */
const CONTINUE_READING_CAP = 3;

/**
 * ContinueReadingStrip — renders the first D8-09-cap of the ONE shared
 * resume-target derivation (Issue #82) from the ONE LibrarySnapshot
 * (Issue #3 — no own load, no own folds). Returns null while the snapshot
 * is not ready (initial load or load failure — fail quiet, the strip is
 * spare chrome) OR when the unfinished set is empty.
 */
export function ContinueReadingStrip({
  snapshot,
  ready,
}: {
  /** The ONE library read model (from useLibrarySnapshot). */
  snapshot: LibrarySnapshot;
  /** True only when the snapshot has settled ready — gates the spare-chrome null. */
  ready: boolean;
}) {
  const entries = useMemo<ResumeTargetEntry[] | null>(() => {
    if (!ready) return null; // loading or failed — spare chrome either way
    return deriveResumeTargets(snapshot).slice(0, CONTINUE_READING_CAP);
    // The snapshot identity fully determines the derivation (every input —
    // articles, locations, folds, books — settles together in one load).
  }, [ready, snapshot]);

  // null = not ready; [] = ready but empty → render nothing in both cases.
  if (!entries || entries.length === 0) return null;

  return (
    <section className="continue-reading-strip" aria-labelledby="cr-heading">
      <h2 id="cr-heading">Continue reading</h2>
      <ul className="continue-reading">
        {entries.map((entry) =>
          entry.kind === "article" ? (
            <li key={`a-${entry.article.id}`} className="continue-reading-row">
              {/* Plan 17-02 (D17-09) — the strip shows the ONE effective
                  name (effectiveTitle); book entries below stay canonical
                  (D17-05). The stretched title link IS the card (native
                  navigation); % read + hairline under it (D8-11). */}
              <a className="library-card-link" href={`#/article/${entry.articleId}`}>
                {effectiveTitle(entry.article)}
              </a>
              <div className="continue-reading-progress">
                <span className="meta">{percentRead(entry.progress)}% read</span>
                <ProgressHairline progress={entry.progress} />
              </div>
            </li>
          ) : (
            <li key={`b-${entry.book.id}`} className="continue-reading-row">
              {/* D12-02 — the book-level entry: ONE link resuming the
                  last-read chapter, labeled with the book's own TOC
                  numbering (D12-06 "Chapter N of M"). */}
              <a className="library-card-link" href={`#/article/${entry.articleId}`}>
                {entry.book.title} — Chapter {entry.ordinal} of {entry.total}
              </a>
              <div className="continue-reading-progress">
                <span className="meta">{percentRead(entry.progress)}% read</span>
                <ProgressHairline progress={entry.progress} />
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
