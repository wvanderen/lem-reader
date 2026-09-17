// src/ingestion/library/readingStats.ts
// Issue #38 — the ambient reading-stats derivations ("on the shelf" verdict
// from prototype branch prototype/stats-presentation, wayfinder ticket #29).
// PURE module (the readingState.ts discipline): zero React, zero Dexie,
// zero DOM — components own the reads (the ONE LibrarySnapshot carries the
// ReadingSessionRecord[] rows), this module owns the algebra.
//
// Presentation contracts (issue #38 + the prototype's agreed variant A):
//   1. ONE summary strip sentence — "You've read {duration} across {N}
//      visits." — plus a second sentence "{N} finished." ONLY when the
//      finished count is nonzero. No streaks, no goals, no words-read.
//   2. A per-article quiet meta line "{duration} read here", SUPPRESSED
//      under one minute of accrued time.
//   3. Silence is the empty state: zero visits → the strip renders null;
//      under-a-minute articles → no meta line. No zeros, no placeholders.
//   4. Orphan history (a session whose articleId is not in the library —
//     possible only via the issue #37 bundle-import ride-along, since
//     removal cascades) counts NOWHERE: the prototype's deriveStats
//     skipped it and this module keeps that discipline. Visits and time
//     always sum over the SAME counted sessions.
//
// formatDuration is VERBATIM from the prototype branch (its presentation
// was the agreed verdict) — do not re-round: minutes use Math.round,
// hours floor with the remainder as minutes.

import type { ReadingSessionRecord } from "../../content/schema";

/**
 * formatDuration — the one duration voice. Under a minute says so in
 * words (never "0 min"); minutes round; hours floor with the trailing
 * minutes ("2 h 5 min"). Verbatim from the prototype's agreed variant A.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The per-article meta line's suppression floor (issue #38 — suppressed
 * under one minute). One accrued minute is the quietest honest line. */
const READ_HERE_MINIMUM_SECONDS = 60;

/**
 * timeReadLabel — the card meta line "{duration} read here", or undefined
 * when the article's accrued time is under a minute (the suppression is
 * the empty state, not a placeholder).
 */
export function timeReadLabel(totalSeconds: number): string | undefined {
  if (totalSeconds < READ_HERE_MINIMUM_SECONDS) return undefined;
  return `${formatDuration(totalSeconds)} read here`;
}

/** The whole-library reading-stats fold over recorded sessions. */
export interface ReadingStats {
  /** Sum of activeSeconds over counted sessions. */
  totalSeconds: number;
  /** Count of counted sessions (one recorded visit = one row). */
  visits: number;
  /** Per-article accrued seconds (the row meta line's input). */
  secondsByArticleId: Map<string, number>;
}

/**
 * deriveReadingStats — fold the session rows into whole-library totals and
 * a per-article time map. Sessions whose articleId is not in
 * `knownArticleIds` are inert orphan history (issue #37 ride-along) and
 * count nowhere. Order-independent: addition over non-negative integers.
 *
 * @param sessions        Every persisted ReadingSessionRecord (the ONE
 *                        LibrarySnapshot's readingSessions array).
 * @param knownArticleIds The library's article ids (snapshot.articles) —
 *                        the membership set that keeps orphan history out.
 */
export function deriveReadingStats(
  sessions: readonly ReadingSessionRecord[],
  knownArticleIds: ReadonlySet<string>,
): ReadingStats {
  const secondsByArticleId = new Map<string, number>();
  let totalSeconds = 0;
  let visits = 0;
  for (const session of sessions) {
    if (!knownArticleIds.has(session.articleId)) continue;
    totalSeconds += session.activeSeconds;
    visits += 1;
    secondsByArticleId.set(
      session.articleId,
      (secondsByArticleId.get(session.articleId) ?? 0) + session.activeSeconds,
    );
  }
  return { totalSeconds, visits, secondsByArticleId };
}
