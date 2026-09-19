// src/reader/ReadAloudBar.tsx
// Issue #40 — the minimal speakable path's transport bar: a fixed compact
// bar at the bottom of the reader with Play / Pause / Stop as REAL buttons.
//
// Acceptance contract:
//   - The primary button's NAME flips between "Play" and "Pause" as state —
//     visible text content, never color (native button text = the accessible
//     name; no aria-label duplication).
//   - The probed follow level is visible as TEXT on the bar (one of word /
//     sentence / passage / progress only), and the configured rate is always
//     visible as text (issue #43, O1: follow level + rate visible while the
//     bar is mounted — state, never icon/color-only).
//   - Issue #42: while a session exists (playing/paused) the bar also offers
//     "Jump to spoken position" — a focus-free orientation affordance for
//     when manual navigation left the spoken passage out of view. The
//     spoken-word MARK itself is synthetic + aria-hidden and lives in the
//     article renderers, never on this bar.
//   - Issue #43 (O3): while a session exists the bar offers "Skip sentence
//     backward", "Skip sentence forward", and "Skip paragraph forward" —
//     speech audibly jumps and the marker hops; successful skips stay silent
//     (no per-hop chatter — any announcement rides the ONE polite region).
//   - Exactly ONE polite role="status" region owns the transport
//     announcements (this component's visually-hidden region; annotation and
//     export regions stay separate — the D9-06 pattern).
//   - No focus movement on play; no global hotkeys; no click-word-to-start.
//     The only start is Play. All controls are native buttons, so Tab order
//     cycles through the bar and back into the page without trapping (O1).
//
// Styling follows the .mark-read-close quiet-button register (tokens only,
// zero motion properties — trivially reduced-motion safe; :focus-visible
// inherits the global ring). Fixed positioning keeps the bar out of the
// paginated grid flow so mounting it can never change .page-viewport
// geometry.

import type { FollowLevel, TransportState } from "../readaloud/types";
import { formatRate } from "../settings/tokens";

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
  /** The configured read-aloud rate — visible as text (issue #43, O1). */
  rate: number;
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
  /**
   * Issue #43 (O3) — the skip controls. Rendered only while a session
   * exists (playing or paused); while paused the skip resumes the session
   * and jumps (resume-then-seek is composed inside the hook).
   */
  onSkipSentenceBack?: () => void;
  onSkipSentenceForward?: () => void;
  onSkipParagraphForward?: () => void;
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
  rate,
  onPrimary,
  onStop,
  onJumpToSpoken,
  onSkipSentenceBack,
  onSkipSentenceForward,
  onSkipParagraphForward,
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
          {/* Skip controls (issue #43, O3) — visible only while a session
              exists; pressing one jumps the voice and the marker, and a
              skip at the session boundary announces once through the polite
              region. */}
          {sessionActive && onSkipSentenceBack && (
            <button
              type="button"
              className="readaloud-btn"
              onClick={onSkipSentenceBack}
            >
              Skip sentence backward
            </button>
          )}
          {sessionActive && onSkipSentenceForward && (
            <button
              type="button"
              className="readaloud-btn"
              onClick={onSkipSentenceForward}
            >
              Skip sentence forward
            </button>
          )}
          {sessionActive && onSkipParagraphForward && (
            <button
              type="button"
              className="readaloud-btn"
              onClick={onSkipParagraphForward}
            >
              Skip paragraph forward
            </button>
          )}
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
          {/* The status text pair (O1): follow level once probed, the
              configured rate always — visible text, never color-only. */}
          {followLevel !== null && (
            <span className="readaloud-follow">{FOLLOW_LABELS[followLevel]}</span>
          )}
          <span className="readaloud-follow">Rate: {formatRate(rate)}×</span>
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
