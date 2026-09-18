// src/reader/useReadAloudFollow.ts
// Issue #42 — the spoken-word FOLLOWER as one hook: the marker state, the
// "never fight the reader" suspension, the follow effects, the programmatic
// scroll window, and the jump affordance + its notice. Extracted from the
// route (which had become the dumping ground for every follow concern); the
// route now just wires this hook's outputs to PaginatedSurface, ArticleBody,
// and ReadAloudBar. The DECISIONS stay in readaloud/follow.ts (pure, unit-
// tested); this hook owns only the React/DOM effects that apply them.
//
// Contracts carried over from the route verbatim:
//   - The marker lives exactly as long as the session: stopped clears it and
//     resets the follower.
//   - Reduced motion is honored at the EFFECT sites: the scroll picks
//     behavior "auto" (instant) under prefers-reduced-motion, a calm smooth
//     glide otherwise (the app's ONLY smooth-scroll site); the paginated
//     turn's optional fade is gated inside PaginatedSurface.
//   - Focus NEVER moves: turnToPage and scrollIntoView are focus-free; the
//     jump keeps the reader where they are and confirms through the ONE
//     polite transport region (the notice).
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";
import type { TransportState } from "../readaloud/types";
import { paginatedFollowDecision, scrollingFollowDecision } from "../readaloud/follow";
import { fragmentContainingOffset } from "../pagination/anchor";
import type { PaginatedSurfaceHandle } from "./PaginatedSurface";
import { findScrollTarget, queryBlocks } from "./restoreLocation";
import { isFormField } from "./PageTurnControls";

export interface UseReadAloudFollowOptions {
  /** The transport state (useReadAloud) — the follower runs only while
   * playing and resets when stopped. */
  state: TransportState;
  /** The effective reading mode, reactive (drives which effect runs). */
  isPaginated: boolean;
  /** The same mode, ref-mirrored (the jump handler reads it at press time,
   * outside the reactive effect graph). */
  isPaginatedRef: React.RefObject<boolean>;
  article: CanonicalArticle | null;
  articleEl: HTMLElement | null;
  surfaceRef: React.RefObject<PaginatedSurfaceHandle | null>;
  /** The transport's polite announcement — the jump notice yields to it so
   * the ONE region always reflects the freshest event. */
  announcement: string | null;
}

export interface UseReadAloudFollow {
  /** The canonical [start, end) grapheme range the voice is inside — the
   * render twins' synthetic spoken-word highlight. */
  spokenRange: GraphemeRange | null;
  /** Feed for useReadAloud's onListenSpoken (drops zero-width sentinels). */
  updateSpokenRange(range: GraphemeRange): void;
  /** A manual page turn (PaginatedSurface.onUserTurn) suspends the follower. */
  suspend(): void;
  /** "Jump to spoken position": focus-free orientation restore. */
  jumpToSpoken(): void;
  /** The transient route-level notice shown through the bar's status region. */
  notice: string | null;
}

/** How long after a programmatic scroll its own scroll events stay
 * disambiguated from user scrolls (smooth-glide upper bound). */
const PROGRAMMATIC_SCROLL_WINDOW_MS = 800;
/** Smooth-glide position slack: a scroll event inside the programmatic
 * window counts as the follower's own only while its position stays within
 * the glide's [from, target] span plus this slack — the glide travels that
 * span and nothing else; a scrollbar drag lands outside it. */
const GLIDE_SPAN_SLACK_PX = 4;
/** How long the jump notice stays in the transport region before
 * self-clearing (the RestorationMarker 4s tempo). */
const NOTICE_TTL_MS = 4000;

export function useReadAloudFollow(options: UseReadAloudFollowOptions): UseReadAloudFollow {
  const { state, isPaginated, isPaginatedRef, article, articleEl, surfaceRef, announcement } =
    options;

  // The spoken-word marker: the canonical [start, end) grapheme range the
  // voice is currently inside. The ref mirror serves handler reads (jump).
  const [spokenRange, setSpokenRange] = useState<GraphemeRange | null>(null);
  const spokenRangeRef = useRef<GraphemeRange | null>(null);
  // "Never fight the reader": a manual page turn or manual scroll suspends
  // the follower; it silently re-acquires when speech re-enters the reader's
  // current view (the pure policy in readaloud/follow.ts owns the decision).
  const followSuspendedRef = useRef(false);
  // Programmatic-scroll window: the follower's own glide (or an instant
  // jump) with the document-space span it travels (from → target). Scroll
  // events inside the window whose position lies ON that span are the
  // follower's; anything off the span — a scrollbar drag away from, or
  // past, the target — is reader input and suspends. Wheel / touch / key
  // input suspends unconditionally regardless of this window.
  const programmaticScrollRef = useRef<{
    until: number;
    fromY: number;
    targetY: number;
  } | null>(null);

  /** The DOM target for "where speech is" in scrolling mode: the rendered
   * marker element when present, else the block containing the spoken
   * offset (non-readable kinds render no mark). */
  const spokenScrollTarget = useCallback(
    (range: GraphemeRange): HTMLElement | null => {
      if (!article || !articleEl) return null;
      return (
        articleEl.querySelector<HTMLElement>("mark.spoken-word") ??
        findScrollTarget(article, queryBlocks(articleEl), range.start)
      );
    },
    [article, articleEl],
  );

  /** Bring the spoken target into view. `reduced` forces the instant
   * behavior (the reduced-motion contract); otherwise a calm smooth glide —
   * the app's ONLY smooth-scroll site. Always arms the programmatic-scroll
   * window (with the span the scroll travels) so the follower's own events
   * never read as user input. */
  const scrollSpokenIntoView = useCallback(
    (range: GraphemeRange, reduced: boolean): void => {
      const target = spokenScrollTarget(range);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const targetY = Math.max(
        0,
        window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2,
      );
      programmaticScrollRef.current = {
        until: performance.now() + PROGRAMMATIC_SCROLL_WINDOW_MS,
        fromY: window.scrollY,
        targetY,
      };
      target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    },
    [spokenScrollTarget],
  );

  /** The spoken-range setter with its ref mirror; the engine's zero-width
   * chunk-end sentinel ([end, end)) carries progress currency only and must
   * NOT collapse the visible marker — it is dropped here. */
  const updateSpokenRange = useCallback((range: GraphemeRange) => {
    if (range.end <= range.start) return;
    spokenRangeRef.current = range;
    setSpokenRange(range);
  }, []);

  const suspend = useCallback(() => {
    followSuspendedRef.current = true;
  }, []);

  // The marker lives exactly as long as the session: stopped (stop, finish,
  // or honest refusal) clears it and resets the follower.
  useEffect(() => {
    if (state !== "stopped") return;
    if (spokenRangeRef.current !== null) {
      spokenRangeRef.current = null;
      setSpokenRange(null);
    }
    followSuspendedRef.current = false;
  }, [state]);

  // Paginated auto page-turn: on each spoken-range update, turn to the page
  // containing the spoken word ONLY when the policy says the follower is
  // healthy (never after a manual turn until speech re-enters the displayed
  // page). turnToPage is the programmatic path — no focus movement; the
  // optional fade inside respects prefers-reduced-motion (instant). When
  // the surface hasn't committed a page yet, decide NOTHING (never assume
  // page 1) — the next spoken update retries.
  useEffect(() => {
    if (state !== "playing" || !isPaginated || spokenRange === null || !article) return;
    const surface = surfaceRef.current;
    const pages = surface?.getPages();
    if (!surface || !pages || pages.length === 0) return;
    const pageState = surface.getState();
    if (!pageState) return;
    const spokenPage = fragmentContainingOffset(pages, spokenRange.start, article);
    const decision = paginatedFollowDecision({
      suspended: followSuspendedRef.current,
      displayedPage: pageState.page - 1,
      spokenPage,
    });
    followSuspendedRef.current = decision.suspended;
    if (decision.action === "turn") surface.turnToPage(spokenPage);
  }, [state, isPaginated, spokenRange, article, surfaceRef]);

  // Scrolling follow-scroll: keep the spoken passage in view while playing
  // (the marker element when present, else its block), again gated by the
  // never-fight-the-reader policy. Reduced motion is honored here directly:
  // behavior "auto" (instant) under prefers-reduced-motion, a calm smooth
  // scroll otherwise.
  useEffect(() => {
    if (state !== "playing" || isPaginated || spokenRange === null || !articleEl) return;
    const target = spokenScrollTarget(spokenRange);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const spokenInView = rect.bottom > 0 && rect.top < window.innerHeight;
    const decision = scrollingFollowDecision({
      suspended: followSuspendedRef.current,
      spokenInView,
    });
    followSuspendedRef.current = decision.suspended;
    if (decision.action === "scroll") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollSpokenIntoView(spokenRange, reduced);
    }
  }, [state, isPaginated, spokenRange, articleEl, spokenScrollTarget, scrollSpokenIntoView]);

  // Manual-scroll suspension listeners (scrolling mode only, while a session
  // exists): any user scroll gesture — wheel, touch, the keyboard scroll
  // bundle, or a scrollbar drag (a scroll event off the programmatic glide's
  // span, inside or outside the window) — suspends the follower. Speech
  // re-entering the viewport re-acquires (the policy), and the jump
  // affordance re-acquires explicitly.
  useEffect(() => {
    if (state === "stopped" || isPaginated || !articleEl) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY !== 0) suspend();
    };
    const onTouchMove = () => suspend();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      // Activating a control (Space/Enter on a button, etc.) doesn't scroll
      // the page — not a manual-navigation signal.
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, [role='button']")
      ) {
        return;
      }
      if (
        event.key === "PageUp" ||
        event.key === "PageDown" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === " "
      ) {
        suspend();
      }
    };
    const onScroll = () => {
      const programmatic = programmaticScrollRef.current;
      if (programmatic !== null && performance.now() < programmatic.until) {
        // Inside the window: only a position on the glide's own span is the
        // follower's; off-span (dragged away from, or past, the target) is
        // reader input — the acceptance criterion's "manual scrolling is
        // possible" holds even mid-glide.
        const y = window.scrollY;
        const lo = Math.min(programmatic.fromY, programmatic.targetY) - GLIDE_SPAN_SLACK_PX;
        const hi = Math.max(programmatic.fromY, programmatic.targetY) + GLIDE_SPAN_SLACK_PX;
        if (y >= lo && y <= hi) return;
      }
      suspend();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [state, isPaginated, articleEl, suspend]);

  // The jump notice rides the bar's single status region and self-clears
  // (the RestorationMarker 4s tempo). The notice is the feedback for the
  // reader's LAST action: the moment the transport itself announces again
  // (pause/resume/stop/error), it yields so the ONE region always reflects
  // the freshest event.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), NOTICE_TTL_MS);
  }, []);
  useEffect(() => {
    setNotice(null);
  }, [announcement]);
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // The "jump to spoken position" affordance: restore the reader's view to
  // the spoken passage (auto page-turn / instant scroll) WITHOUT moving
  // focus — the transport button keeps focus, and the ONE polite transport
  // region confirms the jump for non-visual readers (the marker itself is
  // aria-hidden). Re-acquires the follower.
  const jumpToSpoken = useCallback(() => {
    const range = spokenRangeRef.current;
    if (!article || !range) {
      // Honesty: never a silent dead-end control — the bar offers the jump
      // for the whole session, but before the voice's first word there is
      // nothing to jump to, and the ONE polite region says so.
      showNotice("The voice hasn't spoken yet.");
      return;
    }
    followSuspendedRef.current = false;
    if (isPaginatedRef.current) {
      const pages = surfaceRef.current?.getPages();
      if (pages && pages.length > 0) {
        surfaceRef.current?.turnToPage(fragmentContainingOffset(pages, range.start, article));
      }
    } else {
      // Instant (behavior "auto") — the app's jump policy; no smooth glide.
      scrollSpokenIntoView(range, true);
    }
    showNotice("Jumped to spoken position.");
  }, [article, scrollSpokenIntoView, showNotice, isPaginatedRef, surfaceRef]);

  return { spokenRange, updateSpokenRange, suspend, jumpToSpoken, notice };
}
