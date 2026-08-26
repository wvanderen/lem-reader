// src/ingestion/library/librarySession.ts
// Plan 15-03 Task 2 — the session-scoped library return-context store
// (D15-11..14; NAV-03). PURE module + ONE in-memory snapshot: zero React
// usage, zero storage-layer imports of any kind (the store-seam
// discipline this file mirrors from readingState.ts/bookProgress.ts —
// components own the IO: LibraryView reads on mount via peek, writes on
// unmount via capture; this module owns only the algebra + the session
// slot).
//
// SESSION-SCOPED BY DECISION (D15-12): the snapshot lives in module state
// only — nothing is written to the local database, nothing survives a
// reload, and LibraryView stays unmount/remount (no keep-alive). A cold
// load peeks null and keeps today's defaults; the URL alone restores the
// view (D14-12/D14-17).
//
// Policy edges pinned by tests/unit/library/library-session.test.ts:
//   - D15-12: peek returns null before any capture (cold load); capture
//     OVERWRITES (one snapshot, never a log); peek does not clear
//     (restore is idempotent — StrictMode twin mounts re-read safely).
//   - D15-13: viewMatches is exact equality — scroll + row focus restore
//     only when the landing view matches the captured view (an Unread
//     capture landing on All restores filters only, never mismatched
//     scroll).
//   - D15-14: clampScroll clamps a saved offset that overshoots the
//     current list to the bottom — the findScrollTarget "corpus changed
//     since save" calm-clamp twin. Never restore something that isn't
//     true.
import type { LibraryViewName } from "../../App";

/**
 * The captured library context (D15-11: view + query + tag + scroll + row
 * focus). The view arrives from the URL on return (D14-12/D14-17) and is
 * captured only for the D15-13 view-match comparison; query/activeTag are
 * the reader's live filter state at departure; scrollTop is the live
 * window.scrollY at unmount; lastArticleId is the row whose Open-article
 * link launched this visit's departure (null when the departure was not
 * an article open — e.g. a Highlights round-trip).
 */
export interface LibraryContextSnapshot {
  view: LibraryViewName;
  query: string;
  activeTag: string | null;
  scrollTop: number;
  lastArticleId: string | null;
}

/** The ONE session snapshot. Module-level singleton (D15-12) — set by the
 * library's unmount cleanup, read by its next mount's initializers. */
let snapshot: LibraryContextSnapshot | null = null;

/**
 * captureLibraryContext (D15-12) — the single write point. LibraryView's
 * unmount-only cleanup calls this ONCE per departure with the live
 * { view, query, activeTag } (held in a ref), the live window.scrollY,
 * and the launched article id. A StrictMode twin-pass cleanup rewrites a
 * byte-identical snapshot (refs hold live values), so double-invocation
 * is harmless. Overwrites any prior snapshot — one slot, never a log.
 */
export function captureLibraryContext(next: LibraryContextSnapshot): void {
  snapshot = next;
}

/**
 * peekLibraryContext (D15-12) — peek, NOT take. Returns the snapshot
 * without clearing so restore is idempotent: the filter initializers and
 * the ready-gated restore effect may both read it, and a StrictMode twin
 * mount re-reads the same value. Null on a cold load (fresh session /
 * after reload) — callers keep their defaults.
 */
export function peekLibraryContext(): LibraryContextSnapshot | null {
  return snapshot;
}

/**
 * viewMatches (D15-13, pure) — exact equality of the landing and captured
 * LibraryViewName values. Scroll + row focus restore run ONLY on a match;
 * any mismatch (e.g. an Unread capture landing on All via the brand link)
 * restores filters but resets scroll/focus fresh — never restore
 * something that isn't true (D15-14).
 */
export function viewMatches(
  landing: LibraryViewName,
  captured: LibraryViewName,
): boolean {
  return landing === captured;
}

/**
 * clampScroll (D15-14, pure) — the calm clamp for "the corpus changed
 * since capture": a saved offset within the current maximum passes
 * through unchanged; one beyond it clamps to the bottom (maxScroll =
 * document.documentElement.scrollHeight − window.innerHeight, computed by
 * the caller at restore time, when rows are painted). Mirrors
 * findScrollTarget's overshoot-to-last-block discipline.
 */
export function clampScroll(saved: number, maxScroll: number): number {
  return saved <= maxScroll ? saved : maxScroll;
}
