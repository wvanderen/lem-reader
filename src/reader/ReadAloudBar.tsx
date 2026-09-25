// src/reader/ReadAloudBar.tsx
// Issue #40 — the minimal speakable path's transport bar: a fixed compact
// bar at the bottom of the reader with Play / Pause / Stop as REAL buttons.
// Issue #90 — the bar QUIETS when idle: a stopped reader shows the read-aloud
// ENTRY as one quiet affordance ("Read aloud"); the full transport (skips,
// jump, Stop, follow level, rate) exists only while a session does. Keyboard
// access and SR discoverability are unchanged — the entry is a real, always
// visible, focusable button (never hover-only).
//
// Acceptance contract:
//   - The primary button's NAME carries the state as visible text —
//     "Read aloud" when stopped, "Pause" while playing, "Play" while paused
//     — never color (native button text = the accessible name; no
//     aria-label duplication).
//   - While a session exists, the follow level is visible as TEXT on the bar
//     in plain reader language (one of "Highlights each word/sentence/
//     passage" / "Shows progress only") — the floor ("Shows progress only")
//     shows until the session's probe resolves, and the floor RETURNS at
//     every session end, so the text is never stale (issue #43, O1) — and
//     the configured rate shows beside it. Idle shows neither: the collapse
//     is the point (issue #90); the rate stays discoverable in Reading
//     settings. State, never icon/color-only.
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
//     The only start is the entry button. All controls are native buttons,
//     so Tab order cycles through the bar and back into the page without
//     trapping (O1).
//
// Styling follows the .mark-read-close quiet-button register (tokens only,
// zero motion properties — trivially reduced-motion safe; :focus-visible
// inherits the global ring). Fixed positioning keeps the bar out of the
// paginated grid flow so mounting it can never change .page-viewport
// geometry.

import type { FollowLevel, TransportState } from "../readaloud/types";
import { formatRate } from "../settings/tokens";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../ui/StatusRegion";

interface ReadAloudBarProps {
  state: TransportState;
  /**
   * The current follow level — the floor ("progress-only") until the
   * session's probe resolves; the hook resets it at every session end.
   * The hook owns the floor and never supplies null.
   */
  followLevel: FollowLevel;
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

/** The follow level as plain reader language (issue #90): what the on-page
 * highlight does as the voice reads. "Shows progress only" is the honest
 * floor for voices that provide no word/sentence boundaries. Exported so
 * the unit + e2e suites assert the LIVE strings (one rename site). */
export const FOLLOW_LABELS: Record<FollowLevel, string> = {
  word: "Highlights each word",
  sentence: "Highlights each sentence",
  passage: "Highlights each passage",
  "progress-only": "Shows progress only",
};

/** The primary button's visible name per transport state — the state IS the
 * accessible name (native button text, no aria-label duplication). */
const PRIMARY_LABELS: Record<TransportState, string> = {
  stopped: "Read aloud",
  playing: "Pause",
  paused: "Play",
};

/** The skip controls (issue #43, O3) — one table, one render loop. Each is
 * visible only while a session exists; pressing one jumps the voice and the
 * marker, and a skip at the session boundary announces once through the
 * polite region. */
const SKIP_CONTROLS = [
  { key: "skip-sentence-back", label: "Skip sentence backward" },
  { key: "skip-sentence-forward", label: "Skip sentence forward" },
  { key: "skip-paragraph-forward", label: "Skip paragraph forward" },
] as const;

type SkipControlKey = (typeof SKIP_CONTROLS)[number]["key"];

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
  const sessionActive = state !== "stopped";
  const skipHandlers: Record<SkipControlKey, (() => void) | undefined> = {
    "skip-sentence-back": onSkipSentenceBack,
    "skip-sentence-forward": onSkipSentenceForward,
    "skip-paragraph-forward": onSkipParagraphForward,
  };
  return (
    <>
      <div className="readaloud-bar">
        <div className="readaloud-cluster">
          {/* The primary carries the state as its name: the idle reader sees
              the read-aloud ENTRY ("Read aloud" — issue #90's quiet
              affordance), a live session sees Pause/Play. It stays ENABLED
              when speech is unavailable: pressing it announces the calm
              refusal through the transport region (the honesty constraint —
              never a silent dead-end control). */}
          <button type="button" className="btn btn-quiet readaloud-btn" onClick={onPrimary}>
            {PRIMARY_LABELS[state]}
          </button>
          {/* Skip controls (issue #43, O3) — see SKIP_CONTROLS. */}
          {sessionActive &&
            SKIP_CONTROLS.map(({ key, label }) => {
              const onSkip = skipHandlers[key];
              return onSkip ? (
                <button
                  key={key}
                  type="button"
                  className="btn btn-quiet readaloud-btn"
                  onClick={onSkip}
                >
                  {label}
                </button>
              ) : null;
            })}
          {/* Jump to spoken position — visible only while a session exists
              (playing/paused); the marker may be out of view after manual
              navigation, and this restores orientation focus-free. */}
          {sessionActive && onJumpToSpoken && (
            <button
              type="button"
              className="btn btn-quiet readaloud-btn"
              onClick={onJumpToSpoken}
            >
              Jump to spoken position
            </button>
          )}
          {/* Stop exists only while a session does (issue #90): an idle
              reader has nothing to stop, so the disabled shell is retired —
              the collapsed bar is the entry button alone. */}
          {sessionActive && (
            <button type="button" className="btn btn-quiet readaloud-btn" onClick={onStop}>
              Stop
            </button>
          )}
          {/* The status text pair (O1, gated to the session by #90): follow
              level in plain language (the floor until a session's probe
              resolves — always present mid-session, never stale) and the
              configured rate. Visible text, never color-only. */}
          {sessionActive && (
            <span className="readaloud-follow">{FOLLOW_LABELS[followLevel]}</span>
          )}
          {sessionActive && (
            <span className="readaloud-rate">Rate: {formatRate(rate)}×</span>
          )}
        </div>
      </div>
      {/* The ONE polite transport live region (visually hidden, the ONE
          StatusRegion primitive — issue #98). The jump notice takes
          precedence while fresh — it is the feedback for the reader's LAST
          action — and the route clears it the moment the transport next
          announces. */}
      <StatusRegion className="visually-hidden">
        {notice ?? announcement ?? null}
      </StatusRegion>
    </>
  );
}
