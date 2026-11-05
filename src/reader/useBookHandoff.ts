// src/reader/useBookHandoff.ts
// Issue #238 — the cancellation-safe state machine for whole-book chapter
// handoffs. At the TRUE end/start of an EPUB chapter the ordinary page-turn
// seam (keyboard, swipe, chevrons) crosses to the neighboring existing
// chapter in book order; this hook owns everything about that crossing that
// must survive rapid reader input:
//
//   1. DEPARTING FLUSH, SYNCHRONOUSLY (acceptance 4): beginBoundaryTurn
//      calls the caller's flushDeparting() BEFORE any route change — the
//      departing chapter's real canonical position (the end-pin on a final
//      page) is persisted even if the reader leaves the book a moment
//      later. The write is the caller's saveLocationNow (the flush, never
//      the debounce).
//
//   2. ONE-FRAME-DEFERRED ROUTE ASSIGNMENT (acceptance 5): the canonical
//      chapter route (#/article/<id> — the same grammar every chapter link
//      uses) is assigned on the NEXT animation frame. A superseding reader
//      event inside that window — a manual turn back (the surface's
//      onUserTurn), a mode change, any other navigation — cancels the
//      crossing entirely and the reader stays in the departing chapter. A
//      second boundary turn in the same window REPLACES the first (newest
//      intent wins; exactly one navigation).
//
//   3. ARRIVAL CONSUMED EXACTLY ONCE PER GENERATION: consumeArrival hands
//      the intent to ArticleView's arrival effect (focus + boundary
//      landing) keyed by GENERATION, not target id — crossing back and
//      forward again to the same chapter is a fresh, consumable handoff.
//      The StrictMode twin run of the arrival effect gets null (claimed).
//
//   4. SUPERSESSION: supersede(articleId) runs in the article-load effect —
//      a pending navigation is cancelled and an intent whose target is NOT
//      the arriving article is dropped (the reader jumped elsewhere); an
//      intent whose target IS the arriving article survives for
//      consumption. Unmount cancels the pending frame (refs die with the
//      component — leaving the book can never land a stale handoff).
//
//   5. RESTORE STAND-DOWN: standDownRestoreFor(article) is true from a
//      consumption FOR THAT ARTICLE OBJECT — the saved-location restore
//      effect must never fight the deliberate boundary landing (next → the
//      chapter start; previous → the chapter end). The key is OBJECT
//      IDENTITY, not the id: the restore effect's re-runs for the same
//      object (StrictMode twin) stay suppressed, while any later arrival —
//      chapter link, library row, a second handoff — is a fresh object and
//      restores normally (an id-keyed stand-down would suppress resume
//      forever within the mount).
//
// The hook stores NO React state — every read is ref-based, so the caller
// may invoke it from event handlers and effects without identity churn
// (the latest-ref discipline this module's siblings use). It never touches
// Dexie, the paginated surface, or focus itself: the caller owns those.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CanonicalArticle } from "../content/types";

/** One in-flight (or arrived) chapter handoff. Generation keys everything:
 * claims, replacement, and staleness checks. */
export interface ChapterHandoffIntent {
  readonly generation: number;
  readonly targetId: string;
  readonly direction: "next" | "previous";
}

/** The stable API ArticleView consumes (ref-backed — identity never churns). */
export interface BookHandoff {
  /**
   * Begin a boundary crossing: flush the departing position synchronously,
   * record the intent, and assign the canonical route on the next frame.
   * A pending crossing is replaced (newest wins).
   */
  beginBoundaryTurn(input: {
    targetId: string;
    direction: "next" | "previous";
    /** The caller's synchronous flush (saveLocationNow of the real anchor). */
    flushDeparting: () => void;
  }): void;
  /** Cancel a crossing whose route assignment has not fired yet. */
  cancelPending(): void;
  /**
   * Article-swap truthing (the load effect runs it with the incoming id):
   * cancels a not-yet-assigned crossing, drops an intent that does not
   * target the arriving article, keeps one that does.
   */
  supersede(currentArticleId: string): void;
  /**
   * Consume the arrival intent for `article` — the intent (or null when
   * absent, superseded, mismatched, or already claimed this generation).
   * The claim keys the restore stand-down by the ARTICLE OBJECT (not the
   * id): the restore effect re-runs for the same object on StrictMode twin
   * runs (suppressed), while any LATER arrival at the same chapter id —
   * chapter link, library row, a second handoff — is a fresh object whose
   * resume behavior is intact (issue #238 review: an id-keyed stand-down
   * would suppress resume forever within the mount).
   */
  consumeArrival(article: CanonicalArticle): ChapterHandoffIntent | null;
  /**
   * True from a claimed arrival FOR THIS ARTICLE OBJECT until the mount
   * navigates elsewhere — the saved-location restore effect must never
   * fight the deliberate boundary landing (next → the chapter start;
   * previous → the chapter end). Object identity, per consumeArrival.
   */
  standDownRestoreFor(article: CanonicalArticle): boolean;
}

export function useBookHandoff(): BookHandoff {
  const generationRef = useRef(0);
  const intentRef = useRef<ChapterHandoffIntent | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  // The claimed generation whose arrival effect already consumed its intent
  // — StrictMode twin runs and effect re-entry are idempotent no-ops.
  const claimedGenerationRef = useRef<number | null>(null);
  // The ARTICLE OBJECT whose restore must stand down (the last handoff
  // arrival). Object identity, never the id: a later ordinary arrival at
  // the same chapter is a new object and restores normally.
  const standDownRef = useRef<CanonicalArticle | null>(null);

  const cancelPendingFrame = useCallback(() => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    intentRef.current = null;
  }, []);

  const beginBoundaryTurn = useCallback<BookHandoff["beginBoundaryTurn"]>(
    ({ targetId, direction, flushDeparting }) => {
      // Newest intent wins: a pending crossing in the same input burst is
      // replaced, never doubled (rapid key bursts produce ONE navigation).
      cancelPendingFrame();
      // Acceptance 4 — the departing chapter's real position flushes
      // BEFORE anything else (the caller's synchronous saveLocationNow).
      flushDeparting();
      const generation = ++generationRef.current;
      intentRef.current = { generation, targetId, direction };
      // Acceptance 5 — the route assignment defers one frame so a manual
      // turn / mode change / jump inside the window can still cancel.
      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = null;
        // Cancelled or replaced between schedule and fire — do not navigate.
        if (intentRef.current?.generation !== generation) return;
        // The canonical chapter route — the exact grammar the chapter-nav
        // links use; the hash router (App) swaps ArticleView's articleId in
        // place and pushes browser history (Back returns to the previous
        // chapter). The id is a validated article slug ([a-z0-9-], the
        // BookSchema chapterArticleIds grammar) — template-built, no reader
        // text enters the URL.
        window.location.hash = `#/article/${targetId}`;
      });
    },
    [cancelPendingFrame],
  );

  const cancelPending = useCallback(() => {
    cancelPendingFrame();
  }, [cancelPendingFrame]);

  const supersede = useCallback(
    (currentArticleId: string) => {
      if (pendingFrameRef.current !== null) {
        // A navigation to a different destination happened before the
        // crossing's frame fired — the crossing is over.
        cancelPendingFrame();
        return;
      }
      const intent = intentRef.current;
      if (intent !== null && intent.targetId !== currentArticleId) {
        intentRef.current = null;
      }
    },
    [cancelPendingFrame],
  );

  const consumeArrival = useCallback<BookHandoff["consumeArrival"]>((article) => {
    const intent = intentRef.current;
    if (intent === null || intent.targetId !== article.id) return null;
    intentRef.current = null;
    if (claimedGenerationRef.current === intent.generation) return null;
    claimedGenerationRef.current = intent.generation;
    standDownRef.current = article;
    return intent;
  }, []);

  const standDownRestoreFor = useCallback<BookHandoff["standDownRestoreFor"]>(
    (article) => standDownRef.current === article,
    [],
  );

  // Leaving the article (library, review, browser back) aborts a crossing
  // whose frame has not fired; the refs die with the component, so no stale
  // intent can outlive the mount.
  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  // ONE stable API object: every field above is a stable useCallback, and
  // the identity itself is memoized so callers may list `handoff` in effect
  // deps (ArticleView's load/arrival effects do) without re-running them
  // per render — the fresh-literal return shape would loop any effect that
  // depends on it (setState → render → new identity → effect again).
  return useMemo(
    () => ({
      beginBoundaryTurn,
      cancelPending,
      supersede,
      consumeArrival,
      standDownRestoreFor,
    }),
    [beginBoundaryTurn, cancelPending, supersede, consumeArrival, standDownRestoreFor],
  );
}
