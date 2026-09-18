// src/reader/ReadAloudBar.tsx
// Issue #40 — the minimal speakable path's transport bar: a fixed compact
// bar at the bottom of the reader with Play / Pause / Stop as REAL buttons.
//
// Acceptance contract:
//   - The primary button's NAME flips between "Play" and "Pause" as state —
//     visible text content, never color (native button text = the accessible
//     name; no aria-label duplication).
//   - The probed follow level is visible as TEXT on the bar (one of word /
//     sentence / passage / progress only).
//   - Issue #42: while a session exists (playing/paused) the bar also offers
//     "Jump to spoken position" — a focus-free orientation affordance for
//     when manual navigation left the spoken passage out of view. The
//     spoken-word MARK itself is synthetic + aria-hidden and lives in the
//     article renderers, never on this bar.
//   - Exactly ONE polite role="status" region owns the transport
//     announcements (this component's visually-hidden region; annotation and
//     export regions stay separate — the D9-06 pattern).
//   - No focus movement on play; no global hotkeys; no click-word-to-start.
//     The only start is Play.
//
// Styling follows the .mark-read-close quiet-button register (tokens only,
// zero motion properties — trivially reduced-motion safe; :focus-visible
// inherits the global ring). Fixed positioning keeps the bar out of the
// paginated grid flow so mounting it can never change .page-viewport
// geometry.

import type { FollowLevel, TransportState } from "../readaloud/types";

interface ReadAloudBarProps {
  state: TransportState;
  /** Probed follow level — null until the first probe of the session. */
  followLevel: FollowLevel | null;
  /** Copy for the ONE polite transport status region. */
  announcement: string | null;
  /**
   * Issue #42 — a transient route-level notice (e.g. the "jumped to spoken
   * position" confirmation) shown through the SAME polite region. The notice
   * is the feedback for the reader's LAST action, so it takes precedence
   * while fresh; the route clears it when the transport next announces.
   */
  notice?: string | null;
  /** Primary press: Play when stopped/paused, Pause when playing. */
  onPrimary: () => void;
  onStop: () => void;
  /**
   * Issue #42 — "Jump to spoken position": restores the reader's view to
   * the currently-spoken passage (auto page-turn / follow-scroll undo)
   * WITHOUT moving focus. Rendered only while a session exists (playing or
   * paused) and a jump handler is provided.
   */
  onJumpToSpoken?: () => void;
}

const FOLLOW_LABELS: Record<FollowLevel, string> = {
  word: "Follows: word",
  sentence: "Follows: sentence",
  passage: "Follows: passage",
  "progress-only": "Follows: progress only",
};

export function ReadAloudBar({
  state,
  followLevel,
  announcement,
  notice,
  onPrimary,
  onStop,
  onJumpToSpoken,
}: ReadAloudBarProps) {
  const playing = state === "playing";
  const sessionActive = state !== "stopped";
  return (
    <>
      <div className="readaloud-bar">
        <div className="readaloud-cluster">
          {/* Play stays ENABLED when speech is unavailable: pressing it
              announces the calm refusal through the transport region (the
              honesty constraint — never a silent dead-end control). */}
          <button type="button" className="readaloud-btn" onClick={onPrimary}>
            {playing ? "Pause" : "Play"}
          </button>
          {/* Jump to spoken position — visible only while a session exists
              (playing/paused); the marker may be out of view after manual
              navigation, and this restores orientation focus-free. */}
          {sessionActive && onJumpToSpoken && (
            <button
              type="button"
              className="readaloud-btn"
              onClick={onJumpToSpoken}
            >
              Jump to spoken position
            </button>
          )}
          <button
            type="button"
            className="readaloud-btn"
            onClick={onStop}
            disabled={state === "stopped"}
          >
            Stop
          </button>
          {followLevel !== null && (
            <span className="readaloud-follow">{FOLLOW_LABELS[followLevel]}</span>
          )}
        </div>
      </div>
      {/* The ONE polite transport live region (visually hidden, mirrors the
          annotation/export announce pattern). The jump notice takes
          precedence while fresh — it is the feedback for the reader's LAST
          action — and the route clears it the moment the transport next
          announces. */}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {notice ?? announcement ?? null}
      </div>
    </>
  );
}
