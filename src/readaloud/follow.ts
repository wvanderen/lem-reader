// src/readaloud/follow.ts
// Issue #42 — the follow-behavior decision policy, as pure functions.
//
// While playback runs, the reader's view follows the spoken position:
// paginated mode auto-turns at page boundaries; scrolling mode keeps the
// spoken passage in view. The one calm rule both modes share: the follower
// NEVER fights the reader. A manual page turn / manual scroll SUSPENDS
// following; it silently resumes only when speech re-enters the reader's
// current view (the spoken word lands on the displayed page / scrolls back
// into the viewport) — or when the reader explicitly jumps to the spoken
// position. The effects (turnToPage / scrollIntoView) live in the route;
// this module owns only the DECISION, so the "don't fight the reader" state
// machine is unit-testable without a DOM.
//
// Reduced motion is honored at the EFFECT sites (PaginatedSurface's turn
// fade is already gated on prefers-reduced-motion; the scroll effect picks
// behavior "auto" vs "smooth") — the decision itself is motion-free.

/** What the route should do for one spoken-position update, and the
 * suspension state the caller must persist for the next update. */
export interface FollowDecision {
  /** "none" — stay put; "turn" — paginated auto-turn to the spoken page;
   * "scroll" — scrolling follow-scroll to the spoken passage. */
  action: "none" | "turn" | "scroll";
  /** The suspension state going forward (a re-entry clears it). */
  suspended: boolean;
}

/**
 * Paginated follow decision. Speech on the displayed page = healthy
 * following (and a re-acquire: any prior manual displacement is forgiven).
 * Speech on another page turns there — but only while following was never
 * suspended by a manual turn, so a reader browsing other pages is never
 * yanked forward.
 */
export function paginatedFollowDecision(input: {
  suspended: boolean;
  displayedPage: number;
  spokenPage: number;
}): FollowDecision {
  if (input.spokenPage === input.displayedPage) {
    return { action: "none", suspended: false };
  }
  if (input.suspended) {
    return { action: "none", suspended: true };
  }
  return { action: "turn", suspended: false };
}

/**
 * Scrolling follow decision. The spoken passage inside the viewport = healthy
 * following (and a re-acquire). Outside the viewport scrolls it back into
 * view — but only while following was never suspended by a manual scroll.
 */
export function scrollingFollowDecision(input: {
  suspended: boolean;
  spokenInView: boolean;
}): FollowDecision {
  if (input.spokenInView) {
    return { action: "none", suspended: false };
  }
  if (input.suspended) {
    return { action: "none", suspended: true };
  }
  return { action: "scroll", suspended: false };
}
