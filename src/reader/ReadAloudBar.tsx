// src/reader/ReadAloudBar.tsx
// Issue #40 — the minimal speakable path's transport bar: a fixed compact
// bar at the bottom of the reader with Play / Pause / Stop as REAL buttons.
//
// Acceptance contract:
//   - The primary button's NAME flips between "Play" and "Pause" as state —
//     visible text content, never color (native button text = the accessible
//     name; no aria-label duplication).
//   - The probed follow level is visible as TEXT on the bar (one of word /
//     sentence / passage / progress only) — the spoken-word marker itself is
//     NOT rendered at this stage.
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
  /** Primary press: Play when stopped/paused, Pause when playing. */
  onPrimary: () => void;
  onStop: () => void;
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
  onPrimary,
  onStop,
}: ReadAloudBarProps) {
  const playing = state === "playing";
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
          annotation/export announce pattern). */}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </>
  );
}
