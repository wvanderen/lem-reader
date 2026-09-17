// src/ingestion/library/ReadingStatsStrip.tsx
// Issue #38 — the ambient reading-stats strip ("on the shelf" verdict from
// prototype branch prototype/stats-presentation, wayfinder ticket #29). A
// plain-text line BETWEEN "Continue reading" and the library list:
//
//   You've read {duration} across {N} visits.
//   {N} finished.                       ← only when the count is nonzero
//
// Ambient discipline (issue #38 + #24):
//   - NO destination, NO heading, NO interactive elements — the strip and
//     its sentences introduce zero new keyboard stops and carry no icons
//     or colors that mean anything; plain document-order text only.
//   - Silence IS the empty state: null while the snapshot is not ready
//     (the ContinueReadingStrip fail-quiet spare-chrome discipline) and
//     null at zero visits (no backfill — history accrues from the #34
//     recorder onward). No zeros, no placeholders.
//   - The finished count rides in from LibraryView's countByState fold
//     (D14-23/D14-24 — the strip's "{N} finished." CANNOT disagree with
//     the Finished view's count; both read the ONE policy module).
//   - No streaks, no goals, no daily targets, no words-read — anywhere.
//
// Data: a pure derivation over the ONE LibrarySnapshot (Issue #3 — no own
// load, no own folds; readingStats.ts owns the algebra). The stats memo
// recomputes only when the snapshot identity changes, so an invalidation
// reload keeps the settled derivation mounted until the fresh snapshot
// lands (the stale-while-revalidate discipline).
import { useMemo } from "react";
import {
  deriveReadingStats,
  formatDuration,
} from "./readingStats";
import type { LibrarySnapshot } from "./librarySnapshot";

/**
 * ReadingStatsStrip — derives whole-library reading totals from the ONE
 * LibrarySnapshot. Returns null while not ready (loading or load failure —
 * spare chrome either way) OR when no visit has ever been recorded.
 */
export function ReadingStatsStrip({
  snapshot,
  ready,
  finishedCount,
}: {
  /** The ONE library read model (from useLibrarySnapshot). */
  snapshot: LibrarySnapshot;
  /** True only when the snapshot has settled ready — gates the spare-chrome null. */
  ready: boolean;
  /** The library's finished count (LibraryView's countByState fold — one
   * tally shared with the view switcher). */
  finishedCount: number;
}) {
  const stats = useMemo(() => {
    if (!ready) return null;
    // Membership set over the composite library — orphan history (an
    // articleId no longer/not in the library, possible only via the #37
    // import ride-along) counts nowhere (readingStats.ts discipline).
    const knownArticleIds = new Set(snapshot.articles.map((a) => a.id));
    return deriveReadingStats(snapshot.readingSessions, knownArticleIds);
    // The snapshot identity fully determines the derivation (sessions and
    // articles settle together in one load).
  }, [ready, snapshot]);

  if (!stats || stats.visits === 0) return null;

  const visits = new Intl.NumberFormat(navigator.language).format(stats.visits);
  return (
    <p className="library-stats-strip">
      You've read <strong>{formatDuration(stats.totalSeconds)}</strong> across{" "}
      {visits} {stats.visits === 1 ? "visit" : "visits"}.
      {finishedCount > 0 &&
        ` ${new Intl.NumberFormat(navigator.language).format(finishedCount)} finished.`}
    </p>
  );
}
