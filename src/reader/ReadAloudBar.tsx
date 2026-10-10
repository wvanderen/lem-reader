// src/reader/ReadAloudBar.tsx
// Issue #40 — the minimal speakable path's transport bar: a fixed compact
// bar at the bottom of the reader with Play / Pause / Stop as REAL buttons.
// Issue #90 — the bar QUIETS when idle: a stopped reader shows the read-aloud
// ENTRY as one quiet affordance ("Read aloud"), rendered chrome-less (no
// pill fill/hairline — no card-within-a-card; the button free-floats). The
// pill WRAPPER stays mounted so the primary keeps its DOM position across
// the idle→active flip (a remount would drop the reader's focus). The full
// transport (skips, jump, Stop, follow level, rate) exists only while a
// session does. Keyboard access and SR discoverability are unchanged — the
// entry is a real, always visible, focusable button (never hover-only).
//
// Expanded-band reservation: the fixed bar paints over article text wherever
// the reader scrolls or paginates content under it. While a session exists
// this component publishes the rendered pill height as the --readaloud-h
// custom property on <body> (ResizeObserver — wrap-count aware), and app.css
// spends that height so text never hides: scrolling mode pads the bottom of
// the scroll flow; paginated mode shrinks the page surface so the engine
// repaginates the band away. Idle clears the property — the bare entry's
// 48px band already fits inside both modes' calm bottom insets.
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
//     the configured speed is editable BESIDE it. Idle shows neither: the
//     collapse is the point (issue #90); fuller choices stay in Reading
//     settings. State, never icon/color-only.
//   - Issue #165 — the speed is EDITABLE directly on the bar: a native
//     <select> over the RATE_STEPS ladder (aria-label "Read-aloud speed";
//     keyboard/SR operable for free), writing through onRateChange → the
//     settings store + the live-session retune seam. The voice — and any
//     less frequent choice — is ONE action away: the "Voice" button opens
//     the anchored ReadAloudVoicePopover (the same probed filtered list
//     Reading settings shows). Both apply immediately at the current
//     passage; while paused a change preserves the paused state (the
//     engine defers to resume).
//   - Issue #42: while a session exists (playing/paused) the bar also offers
//     "Jump to spoken position" — a focus-free orientation affordance for
//     when manual navigation left the spoken passage out of view. The
//     spoken-word MARK itself is synthetic + aria-hidden and lives in the
//     article renderers, never on this bar.
//   - Issue #43 (O3): while a session exists the bar offers "Skip sentence
//     backward", "Skip sentence forward", and "Skip paragraph forward" —
//     speech audibly jumps and the marker hops; successful skips stay silent
//     (no per-hop chatter — any announcement rides the ONE polite region).
//   - Issue #166: the bar exposes the seek control — a native range slider
//     over ARTICLE position (a percent of the article's text; no duration is
//     implied, the platform provides no reliable audio time), keyboard
//     operable, its aria-valuetext carrying the article-position feedback —
//     plus "Previous passage" / "Next passage" (the utterance-sized step
//     either direction, the same skip discipline as #43). Seeking while
//     paused stays paused; seeking during playback continues speech from the
//     picked position; percent 100 finishes through the ONE completion seam.
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
// geometry; while a session exists the measured --readaloud-h property
// (above) is what lets app.css give the band its space honestly.

import { useEffect, useRef, useState } from "react";
import type { FollowLevel, TransportState } from "../readaloud/types";
import { RATE_STEPS, formatRate } from "../settings/tokens";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../ui/StatusRegion";
// Issue #165 — the anchored Voice popover (the voice one action away).
import { ReadAloudVoicePopover } from "./ReadAloudVoicePopover";

interface ReadAloudBarProps {
  state: TransportState; /**
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
  /** The configured read-aloud rate — the speed select's live value
   * (issue #165; editable on the bar while a session exists). */
  rate: number;
  /** The currently stored read-aloud voice URI (undefined = system
   * default) — the Voice popover's live value (issue #165). */
  voice?: string;
  /**
   * Issue #165 — a speed pick from the bar's select (a RATE_STEPS value).
   * The caller persists it AND the live session re-tunes (the hook's
   * settings-change seam). Rendered only while a session exists.
   */
  onRateChange?: (rate: number) => void;
  /**
   * Issue #165 — a voice pick from the Voice popover ("" = system
   * default). The caller persists it AND the live session re-tunes.
   */
  onVoiceChange?: (voiceURI: string) => void;
  /** Primary press: Play when stopped/paused, Pause when playing. */
  onPrimary: () => void;
  onStop: () => void;
  /**
   * Issue #166 — the seek control's wiring. `progress` is the hook's display
   * mirror of the listened position (null until the session's first progress
   * event); `totalGraphemes` is the article's canonical grapheme total;
   * `onSeek` receives the picked PERCENT (0–100 — the route owns the
   * percent→canonical-offset mapping and the at-end→finish routing). The
   * slider renders only while a session exists AND all three are provided.
   */
  progress?: number | null;
  totalGraphemes?: number;
  onSeek?: (percent: number) => void;
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
  /**
   * Issue #166 — previous/next passage (one utterance-sized step). Rendered
   * only while a session exists; while paused the step resumes the session
   * and jumps (the shared skip composition, like the #43 controls).
   */
  onSkipPassageBack?: () => void;
  onSkipPassageForward?: () => void;
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

/** The body-level custom property that publishes the expanded band's live
 * measured height to app.css (the band reservation). app.css consumes it by
 * literal name alongside the idle fallback (--readaloud-idle-h) — a rename
 * must land there in the same change. Exported so the suites assert the
 * LIVE name (one rename site, like FOLLOW_LABELS). */
export const READALOUD_HEIGHT_VAR = "--readaloud-h";

/** Issue #166 — the seek control's accessible name and its article-position
 * value feedback. The slider is ARTICLE-position currency (a fraction of the
 * article's text) — never seconds or a duration, which the platform does not
 * reliably provide. Exported so the suites assert the LIVE strings. */
export const SEEK_LABEL = "Article position";

/** The slider's aria-valuetext for a percent — the understandable
 * article-position feedback ("42% through the article"). */
export function seekValueText(percent: number): string {
  return `${percent}% through the article`;
}

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

/** The passage-step controls (issue #166) — previous/next passage, the
 * utterance-sized step either direction. Same render contract as the #43
 * skips: session-gated, handler-optional. */
const PASSAGE_CONTROLS = [
  { key: "skip-passage-back", label: "Previous passage" },
  { key: "skip-passage-forward", label: "Next passage" },
] as const;

type PassageControlKey = (typeof PASSAGE_CONTROLS)[number]["key"];

export function ReadAloudBar({
  state,
  followLevel,
  announcement,
  notice,
  rate,
  voice,
  onRateChange,
  onVoiceChange,
  onPrimary,
  onStop,
  progress,
  totalGraphemes,
  onSeek,
  onJumpToSpoken,
  onSkipSentenceBack,
  onSkipSentenceForward,
  onSkipParagraphForward,
  onSkipPassageBack,
  onSkipPassageForward,
}: ReadAloudBarProps) {
  const sessionActive = state !== "stopped";
  const clusterRef = useRef<HTMLDivElement | null>(null);
  // Issue #165 — the Voice popover's open flag (the trigger only exists
  // mid-session; the popover closes itself when the session ends so it
  // never floats over an idle bar). The trigger's ref rides along: it is
  // the focus-restore target (the INVOKER — capturing activeElement at
  // open would grab <body> on engines that don't focus buttons on click).
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!sessionActive) {
      setVoiceOpen(false);
      setScrubPercent(null);
      setKeyboardPercent(null);
    }
  }, [sessionActive]);
  const skipHandlers: Record<SkipControlKey, (() => void) | undefined> = {
    "skip-sentence-back": onSkipSentenceBack,
    "skip-sentence-forward": onSkipSentenceForward,
    "skip-paragraph-forward": onSkipParagraphForward,
  };
  const passageHandlers: Record<PassageControlKey, (() => void) | undefined> = {
    "skip-passage-back": onSkipPassageBack,
    "skip-passage-forward": onSkipPassageForward,
  };
  // ── Issue #166 — the seek slider's scrub discipline ──────────────────────
  // While a POINTER drag is down, the slider shows the picked value (never
  // snapping back under the reader's finger as playback-driven progress
  // arrives); the commit rides the release. Keyboard adjustment commits per
  // change (no pointer is down — the value feedback must be immediate).
  const [scrubPercent, setScrubPercent] = useState<number | null>(null);
  // Retain the keyboard pick while the slider owns focus: passage snapping
  // must not undo each 1% step before the next arrow can reach a new passage.
  // Blur returns the display to actual playback progress.
  const [keyboardPercent, setKeyboardPercent] = useState<number | null>(null);
  // The LIVE percent — playback-driven position only, never the scrub override.
  const livePercent =
    progress !== null && progress !== undefined && totalGraphemes
      ? Math.min(100, Math.max(0, Math.round((progress / totalGraphemes) * 100)))
      : 0;
  const seekPercent = scrubPercent ?? keyboardPercent ?? livePercent;
  const commitSeek = (percent: number) => {
    setScrubPercent(null);
    const picked = Math.min(100, Math.max(0, Math.round(percent)));
    onSeek?.(picked);
  };
  // The release/blur commit: a scrub that lands back ON the live percent was
  // a no-op gesture (a thumb click, or a drag returned home) — clear the
  // scrub without the self-seek (no speech round-trip, no spurious save).
  const commitScrub = () => {
    if (scrubPercent === null) return;
    const picked = scrubPercent;
    setScrubPercent(null);
    if (picked !== livePercent) {
      onSeek?.(picked);
    }
  };
  // Expanded-band reservation — see the header comment. While a session
  // exists, publish the pill's live rendered height (--readaloud-h on
  // <body>) so app.css can hold article text clear of the fixed bar; the
  // cleanup un-publishes at every session end / unmount so the idle bar
  // reserves nothing. ResizeObserver (not resize events) tracks wrap-count
  // changes on narrow viewports; no-op where it's unavailable (DOM-emulated
  // unit tests don't do layout).
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!sessionActive || !cluster || typeof ResizeObserver === "undefined") {
      return;
    }
    const publish = () => {
      document.body.style.setProperty(READALOUD_HEIGHT_VAR, `${cluster.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(cluster);
    return () => {
      observer.disconnect();
      document.body.style.removeProperty(READALOUD_HEIGHT_VAR);
    };
  }, [sessionActive]);
  return (
    <>
      <div className={sessionActive ? "readaloud-bar readaloud-bar--expanded" : "readaloud-bar"}>
        {/* The pill wrapper is STRUCTURAL and always mounted: the primary
            button keeps the same DOM position across the idle→active flip,
            so the button a reader just pressed is never remounted under it
            (remounting would drop its focus — the no-focus-movement rule).
            Idle it renders chrome-LESS (.readaloud-cluster--idle: no fill,
            no hairline) — the entry reads as one free-floating quiet button,
            no card-within-a-card. */}
        <div
          className={
            sessionActive ? "readaloud-cluster" : "readaloud-cluster readaloud-cluster--idle"
          }
          ref={clusterRef}
        >
          {/* The primary carries the state as its name: the idle reader sees
              the read-aloud ENTRY ("Read aloud" — issue #90's quiet
              affordance), a live session sees Pause/Play. It stays ENABLED
              when speech is unavailable: pressing it announces the calm
              refusal through the transport region (the honesty constraint —
              never a silent dead-end control). */}
          <button type="button" className="btn btn-quiet readaloud-btn" onClick={onPrimary}>
            {PRIMARY_LABELS[state]}
          </button>
          {/* Issue #166 — the seek control: ARTICLE-position currency (a
              percent of the article's text), never a duration — the platform
              gives no reliable audio time, so none is implied. A native
              range input: keyboard operable for free (arrows/Home/End),
              its accessible name + aria-valuetext carrying the article-
              position feedback. Pointer drags show the picked value and
              commit on release; keyboard commits per change. Percent 100
              routes through the route's at-end→finish seam. */}
          {sessionActive && onSeek && !!totalGraphemes && (
            <input
              type="range"
              className="readaloud-seek"
              aria-label={SEEK_LABEL}
              aria-valuetext={seekValueText(seekPercent)}
              min={0}
              max={100}
              step={1}
              value={seekPercent}
              onChange={(e) => {
                const picked = e.currentTarget.valueAsNumber;
                if (scrubPercent !== null) setScrubPercent(picked);
                else {
                  if (document.activeElement === e.currentTarget) setKeyboardPercent(picked);
                  commitSeek(picked);
                }
              }}
              onPointerDown={(e) => {
                setKeyboardPercent(null);
                setScrubPercent(e.currentTarget.valueAsNumber);
              }}
              onPointerUp={commitScrub}
              onPointerCancel={commitScrub}
              onBlur={() => {
                commitScrub();
                setKeyboardPercent(null);
              }}
            />
          )}
          {/* Passage steps (issue #166) — previous/next passage, the
              utterance-sized navigation step either direction. */}
          {sessionActive &&
            PASSAGE_CONTROLS.map(({ key, label }) => {
              const onPassage = passageHandlers[key];
              return onPassage ? (
                <button
                  key={key}
                  type="button"
                  className="btn btn-quiet readaloud-btn"
                  onClick={onPassage}
                >
                  {label}
                </button>
              ) : null;
            })}
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
            <button type="button" className="btn btn-quiet readaloud-btn" onClick={onJumpToSpoken}>
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
              speed — EDITABLE since issue #165: a native select over the
              RATE_STEPS ladder, its accessible name doing the labelling
              ("Read-aloud speed"), the visible value ("1.25×") the quiet
              text register. A stored rate off the ladder (a continuous
              schema value) is APPENDED so the control never shows a
              valueless state. */}
          {sessionActive && <span className="readaloud-follow">{FOLLOW_LABELS[followLevel]}</span>}
          {sessionActive && onRateChange && (
            <select
              className="readaloud-rate readaloud-speed"
              aria-label="Read-aloud speed"
              value={rate}
              onChange={(e) => onRateChange(Number(e.currentTarget.value))}
            >
              {RATE_STEPS.map((step) => (
                <option key={step} value={step}>
                  {formatRate(step)}×
                </option>
              ))}
              {(RATE_STEPS as readonly number[]).includes(rate) || (
                <option value={rate}>{formatRate(rate)}×</option>
              )}
            </select>
          )}
          {/* Issue #165 — the voice ONE action away: the anchored popover
              (the same probed filtered list Reading settings renders).
              Session-gated like every transport control; the popover itself
              sits OUTSIDE the bar box (a fragment sibling below) because
              .readaloud-bar is pointer-events:none — CSS inheritance, not
              the top layer, governs it. */}
          {sessionActive && onVoiceChange && (
            <button
              type="button"
              ref={voiceTriggerRef}
              className="btn btn-quiet readaloud-btn readaloud-voice-trigger"
              aria-haspopup="dialog"
              aria-expanded={voiceOpen}
              onClick={() => setVoiceOpen(true)}
            >
              Voice
            </button>
          )}
        </div>
      </div>
      {/* The ONE polite transport live region (visually hidden, the ONE
          StatusRegion primitive — issue #98). The jump notice takes
          precedence while fresh — it is the feedback for the reader's LAST
          action — and the route clears it the moment the transport next
          announces. */}
      <StatusRegion className="visually-hidden">{notice ?? announcement ?? null}</StatusRegion>
      {/* Issue #165 — the Voice popover: a fragment SIBLING of the bar (not
          inside .readaloud-bar, whose pointer-events:none would inherit
          into the panel). Anchored to the trigger through CSS anchor
          positioning; opens UPWARD (the bar lives at the bottom edge). */}
      {onVoiceChange && (
        <ReadAloudVoicePopover
          open={voiceOpen}
          voice={voice}
          onVoiceChange={onVoiceChange}
          onClose={() => setVoiceOpen(false)}
          triggerRef={voiceTriggerRef}
        />
      )}
    </>
  );
}
