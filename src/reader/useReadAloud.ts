// src/reader/useReadAloud.ts
// Issue #40 — the React seam between the reader route and the read-aloud
// engine. One hook owns the per-session engine lifecycle (a fresh engine per
// Play press), applies the v3 settings (voice + rate) at play time, and
// funnels engine events into transport state + the ONE polite transport
// announcement. The listening-is-reading contract (ADR 0001) lands in the
// host: the hook reports listened canonical offsets upward, and ArticleView
// drives the SAME shared location-save discipline the scroll path uses.
// Issue #167 — a DETECTED failure keeps the transport usable: the failure
// copy surfaces as `failure` (the bar's visible line) while the engine sits
// on "failed"; play() from there IS Retry — a fresh engine, settings read
// fresh, and the start offset read live from the host (the preserved
// listened position — a failure never rewinds or skips).
//
// Discipline mirrors the sibling hooks (useScrollSave/useReadingSession):
// latest-handler refs so callbacks stay stable, no focus movement anywhere
// (the transport bar's buttons own focus), no global hotkeys (the ONLY start
// is Play), engine torn down on unmount/article swap (speech never survives
// its article).
//
// Issue #239 — whole-book playback across EPUB chapters: at a finish the
// host decides (scope lives there) whether the session holds for a chapter
// handoff. The hook holds the continuation AUTHORIZATION (the finished
// session's voice + probed follow level) and restarts playback through
// continueFromHandoff() at the arriving chapter — invalidated by any newer
// reader intent (manual Play/Pause/Stop, background stop), so delayed
// arrivals never restart speech on their own. The engine teardown on the
// AUTHORIZED swap is silent by construction: the finish already ended the
// departing session, so nothing audible is ever cut.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import { chunkArticleForSpeech } from "../readaloud/chunks";
import type { SpeechScope } from "../readaloud/chunks";
import type { CarriedFollow, ListenFinishedInfo } from "../readaloud/engine";
import { ReadAloudEngine } from "../readaloud/engine";
import type { FollowLevel, TransportState } from "../readaloud/types";
import { transportIsActive } from "../readaloud/types";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";
import {
  createWebSpeechAdapter,
  speechSynthesisAvailable,
  speechSynthesisUnavailableMessage,
  storedVoiceAvailable,
} from "../readaloud/webSpeech";
import { useSettings } from "../settings/SettingsContext";

/** The guaranteed-floor follow level (the engine's own pre-probe default).
 * Shown until a session's probe resolves and restored at every session end,
 * so the bar's follow text is always present and never stale (O1). */
const FOLLOW_LEVEL_FLOOR: FollowLevel = "progress-only";

/** O9 — the one honest line for a background-forced stop. Set on hide and
 * re-announced on visible return: most screen readers don't announce
 * live-region text that changed while the page was hidden. */
const BACKGROUND_STOP_MESSAGE =
  "Read aloud stopped while the reader was in the background. Press Play to continue.";

/** The honest fallback note (issue #165 shares it with session start): a
 * chosen voice that no longer resolves degrades to the platform default —
 * the reader is TOLD, never left wondering why the voice changed. */
const VOICE_MISSING_MESSAGE = "Saved voice not found — using the default voice.";

/** Issue #239 — the ONE calm line announcing a whole-book chapter handoff.
 * Announced at the ARRIVAL (when playback actually continues — never at the
 * finish, where the handoff could still be invalidated), so the polite
 * region never claims a continuation that did not happen. */
export const BOOK_HANDOFF_MESSAGE = "Continuing to the next chapter.";

// Issue #239 — the finish info shape is the engine's own ListenFinishedInfo
// (one type, one rename site); re-exported for the host's finish handler.
export type { ListenFinishedInfo };

export interface UseReadAloudHandlers {
  /** The reader's live canonical position, read at press time (the only
   * start is Play, and Play starts at the current reading location). */
  getStartOffset: () => number;
  /** The listened position moved — canonical article-global grapheme offset. */
  onListenProgress: (offset: number) => void;
  /**
   * Issue #42 — the spoken-range channel for the visual marker: the
   * canonical [start, end) grapheme range speech is currently inside. A
   * zero-width range (end === start) is the chunk-boundary sentinel —
   * progress currency only; hosts must not move the marker for it.
   */
  onListenSpoken?: (range: GraphemeRange) => void;
  /** The article completed by ear (or through the seek-to-end seam). The
   * handler FLUSHES the departing position and decides (issue #239): return
   * "continue" to hold the session end for a whole-book handoff — the host
   * has begun the chapter-crossing navigation and the transport restarts
   * through continueFromHandoff() when the next chapter ARRIVES. Anything
   * else is the ordinary finish (the finished announcement + rest). A
   * paused finish (info.fromPaused) must never return "continue". */
  onListenFinished: (info: ListenFinishedInfo) => "continue" | void;
}

export interface UseReadAloudReturn {
  state: TransportState;
  /** Between chapters, the engine has finished but the book session still
   * needs Pause/Stop — including while the next article is loading. */
  continuationPending: boolean;
  /** Revoke a pending continuation when navigation supersedes its handoff.
   * Does not stop an unrelated live utterance. */
  cancelContinuation: () => void;
  /**
   * Issue #167 — the detected failure's reader-facing copy, non-null exactly
   * while the state is "failed": the calm explanation the transport bar
   * keeps VISIBLE (not just announced) alongside Retry and voice selection.
   * Cleared by play (the retry) and stop; a fresh failure replaces it.
   */
  failure: string | null;
  /** The follow level: the guaranteed floor until the session's probe
   * resolves, reset to the floor whenever the session ends — the bar's
   * follow text is therefore always present and never stale (O1). */
  followLevel: FollowLevel;
  /** The ONE polite transport announcement (role=status copy). */
  announcement: string | null;
  /**
   * Issue #166 — the listened position as DISPLAY currency for the bar's
   * seek control: the canonical article-global grapheme offset of the most
   * recent progress event (word boundary, chunk advance, or seek). Null
   * until the session's first progress event; reset per fresh session. The
   * canonical SAVE still rides onListenProgress alone — this is the slider's
   * mirror, not a second source of truth.
   */
  progressOffset: number | null;
  /** Start (or resume after pause) — the only start is Play. */
  play: () => void;
  /** Pause while playing; resume while paused. */
  pauseOrResume: () => void;
  stop: () => void;
  /**
   * Issue #166 — the seek control's transport (generalizes the #43 skip
   * track): playing → the audible jump (speech continues from the target
   * chunk); paused → the paused seek (the state stays paused, the position
   * + marker move, resume lands on the target); stopped → no-op. A
   * successful seek is silent — the slider's position feedback and the
   * speech/marker jump ARE the feedback.
   */
  seek: (offset: number) => void;
  /**
   * Issue #166 — seek to the end: the session finishes through the ONE
   * completion seam (the finished announcement + the end-pin save — the
   * same contract as finishing by ear). Never wraps to the top.
   */
  seekToEnd: () => void;
  /**
   * Issue #43 (O3) — skip sentence backward/forward and skip paragraph
   * forward. While paused the composition is resume-then-seek (speech
   * audibly jumps); a skip at the session boundary announces ONE honest
   * line through the polite region — a successful skip itself stays silent
   * (no per-hop chatter).
   */
  skipSentenceBack: () => void;
  skipSentenceForward: () => void;
  skipParagraphForward: () => void;
  /**
   * Issue #166 — previous/next passage: one utterance-sized step (the chunk
   * — the same passage unit the follow ladder names). Same skip discipline
   * as #43: paused → resume-then-jump, a boundary announces ONCE through the
   * polite region, a successful step stays silent.
   */
  skipPassageBack: () => void;
  skipPassageForward: () => void;
  /**
   * Issue #239 — the ARRIVAL half of a whole-book handoff: the host calls
   * this when the next chapter arrived through an authorized playback
   * handoff. A no-op unless a continuation is still authorized — a manual
   * Play/Pause/Stop, a background stop, or superseded handoff work in the
   * gap invalidates it, so the arrival lands silently (the ordinary #238
   * handoff behavior). When authorized, playback restarts at the arriving
   * chapter's current anchor (its start) carrying the finished session's
   * probed follow level and voice — no re-probe when the voice is
   * unchanged, no manual-play announcement (the handoff line stands in the
   * ONE polite region).
   */
  continueFromHandoff: () => void;
}

export function useReadAloud(
  article: CanonicalArticle | null,
  handlers: UseReadAloudHandlers,
  // Issue #244 — the OPTIONAL speech range: a chapter assignment clips the
  // session's utterances to the assigned chapter's canonical range, so the
  // voice physically cannot cross the assignment end (a whole-article
  // assignment passes nothing — the whole article speaks, as always). Read
  // through a latest-ref at PLAY time: a session started inside the
  // assignment keeps the range it started with.
  options?: { speechRange?: SpeechScope },
): UseReadAloudReturn {
  const { settings } = useSettings();
  const supportedRef = useRef(speechSynthesisAvailable());
  const [state, setState] = useState<TransportState>("stopped");
  const [continuationPending, setContinuationPending] = useState(false);
  const [followLevel, setFollowLevel] = useState<FollowLevel>(FOLLOW_LEVEL_FLOOR);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  /** Issue #167 — the detected failure's visible copy (see UseReadAloudReturn
   * .failure). Cleared on play (Retry) and stop; never stale-visible: the
   * bar renders it only while the state is "failed". */
  const [failure, setFailure] = useState<string | null>(null);
  /** Issue #166 — the seek slider's display mirror of the listened position
   * (see UseReadAloudReturn.progressOffset). */
  const [progressOffset, setProgressOffset] = useState<number | null>(null);
  /** O9 — a background-forced stop is awaiting its visible-return
   * re-announcement (set on hide/pagehide, consumed on visible). */
  const backgroundStopRef = useRef(false);

  // Latest-handler refs (useScrollSave pattern): ArticleView's callbacks are
  // re-created per render; the engine must always call the freshest ones.
  const handlersRef = useRef(handlers);
  // Latest options ref (issue #244 — the speech range read at play time).
  const optionsRef = useRef(options);
  optionsRef.current = options;
  handlersRef.current = handlers;
  // Latest settings at play time (the engine is built per Play press).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const articleRef = useRef(article);
  articleRef.current = article;
  const engineRef = useRef<ReadAloudEngine | null>(null);
  /** Issue #239 — the authorized whole-book continuation, set when the
   * finish handler says "continue": the finished session's resolved voice
   * + probed follow level, consumed exactly once by continueFromHandoff()
   * at the arriving chapter. Any newer reader intent in the gap — a manual
   * Play/Pause/Stop, a seek or seek-to-end jump, a background stop —
   * invalidates it, so a delayed arrival can never restart playback on its
   * own. The token deliberately SURVIVES the authorized article swap (the
   * swap IS the handoff); unmount kills it with the component. */
  const continuationRef = useRef<CarriedFollow | null>(null);
  const cancelContinuation = useCallback((): boolean => {
    if (continuationRef.current === null) return false;
    continuationRef.current = null;
    setContinuationPending(false);
    return true;
  }, []);

  /** Tear down the current engine (cancel speech, detach via generation). */
  const teardown = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  // Speech never survives its article: stop on article swap and unmount.
  // article?.id keeps the cleanup across the loading→ready transition of ONE
  // article (id is stable) while tearing down on a real article swap.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [article?.id]);

  /**
   * Issue #239 — the ONE session builder behind both starts: the manual
   * Play press and the whole-book handoff arrival. Builds the fresh engine
   * (voice/rate read fresh from settings; a stored voice that no longer
   * resolves degrades to the platform default with the honest line) and
   * starts at the host's live anchor. A still-authorized continuation is
   * consumed here: its level seeds the new session (carried to the engine,
   * which skips the probe only when the SAME voice resolves); without one
   * the session probes from scratch. False when there is no article.
   */
  const startSession = useCallback((): boolean => {
    setFailure(null);
    const currentArticle = articleRef.current;
    if (!currentArticle) return false;
    const storedVoice = settingsRef.current.voice ?? null;
    let voiceURI = storedVoice;
    if (storedVoice !== null && !storedVoiceAvailable(storedVoice)) {
      voiceURI = null;
      setAnnouncement(VOICE_MISSING_MESSAGE);
    }
    const carried = continuationRef.current;
    cancelContinuation();
    teardown();
    // A fresh session shows the floor until its probe resolves; a whole-
    // book handoff's carried level corrects it SYNCHRONOUSLY — the engine
    // fires onFollowLevel during play() in this same batch when the SAME
    // voice resolved (one voice-equality check, in the engine — the place
    // that knows what will actually speak), so React renders once with the
    // carried level (no floor flash). A different voice just probes fresh.
    // The seek slider's mirror starts at the play anchor (never a false
    // 0%): a resumed mid-article session shows its true position from the
    // first frame — the probe window included — and the first progress
    // event refines it to the speaking chunk.
    setFollowLevel(FOLLOW_LEVEL_FLOOR);
    setProgressOffset(handlersRef.current.getStartOffset());
    const nextEngine = new ReadAloudEngine({
      adapter: createWebSpeechAdapter(),
      chunks: chunkArticleForSpeech(currentArticle, optionsRef.current?.speechRange ?? undefined),
      voiceURI,
      rate: settingsRef.current.rate,
      carriedFollow: carried ?? undefined,
      callbacks: {
        onStateChange: setState,
        onFollowLevel: setFollowLevel,
        onProgress: (offset) => {
          setProgressOffset(offset);
          handlersRef.current.onListenProgress(offset);
        },
        onSpokenRange: (range) => handlersRef.current.onListenSpoken?.(range),
        onFinish: (info) => {
          // The handler ALWAYS runs — it flushes the departing position for
          // every finish, paused or not. Issue #239 — its "continue"
          // decision is honored only for a playing finish (the playback
          // scope and next-chapter knowledge live in the route): "continue"
          // holds the end for a whole-book handoff, carrying THIS session's
          // resolved voice + probed follow level for the arriving chapter.
          // A paused finish (seek-to-end while paused) never continues —
          // the reader is holding the book, not leaving it.
          const decision = handlersRef.current.onListenFinished(info);
          if (decision === "continue" && !info.fromPaused) {
            continuationRef.current = {
              voiceURI: nextEngine.getVoiceURI(),
              level: nextEngine.getFollowLevel(),
            };
            setContinuationPending(true);
            return; // no announcement yet — the arrival announces what happened
          }
          setFollowLevel(FOLLOW_LEVEL_FLOOR);
          setAnnouncement("Read aloud finished.");
        },
        onError: (failure) => {
          setFollowLevel(FOLLOW_LEVEL_FLOOR);
          setFailure(failure.message);
          setAnnouncement(failure.message);
        },
      },
    });
    engineRef.current = nextEngine;
    // The ONLY starts are Play and an authorized handoff arrival, and both
    // begin at the reader's current position — read live through the host's
    // getter (the arriving chapter's reset anchor IS its start).
    nextEngine.play(handlersRef.current.getStartOffset());
    setState("playing");
    return true;
  }, [teardown, cancelContinuation]);

  const play = useCallback(() => {
    if (!supportedRef.current) {
      setAnnouncement(speechSynthesisUnavailableMessage());
      return;
    }
    // A detected failure is RETRY (issue #167): fall through to the fresh-
    // session path below — a new engine, the voice/rate read fresh from
    // settings (a voice picked from the failure state's picker applies), and
    // the start offset read live from the host (the preserved listened
    // position — the anchor never rewound during the failed session).
    // Resume the paused session first — a second Play never restarts speech.
    const existing = engineRef.current;
    if (existing && existing.getState() === "paused") {
      existing.resume();
      setState("playing");
      setAnnouncement("Reading aloud.");
      return;
    }
    // Issue #239 — a manual Play supersedes any pending whole-book
    // continuation (startSession consumes it; its carried level is dropped —
    // the reader restarted THIS chapter deliberately).
    cancelContinuation();
    if (!startSession()) return;
    setAnnouncement("Reading aloud.");
  }, [startSession, cancelContinuation]);

  const pauseOrResume = useCallback(() => {
    // Issue #239 — a Pause press during a whole-book handoff gap (the
    // finished session is already at rest) is a HOLD: the continuation is
    // invalidated and the arrival lands silently. Mid-session the token is
    // always null, so this is a no-op there.
    if (cancelContinuation()) {
      setAnnouncement("Read aloud paused.");
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getState() === "playing") {
      engine.pause();
      setState("paused");
      setAnnouncement("Read aloud paused.");
    } else if (engine.getState() === "paused") {
      engine.resume();
      setState("playing");
      setAnnouncement("Reading aloud.");
    }
  }, [cancelContinuation]);

  const stop = useCallback(() => {
    // A loading arrival may have no engine, but still has a book session
    // to stop. Retire its authorization and UI together.
    const continuing = cancelContinuation();
    if (!engineRef.current && !continuing) return;
    teardown();
    setState("stopped");
    setFollowLevel(FOLLOW_LEVEL_FLOOR);
    setFailure(null);
    setAnnouncement("Read aloud stopped.");
  }, [teardown, cancelContinuation]);

  /** Issue #239 — see UseReadAloudReturn.continueFromHandoff. The token IS
   * the authorization: the arrival may only restart playback when nothing
   * in the gap invalidated it. */
  const continueFromHandoff = useCallback(() => {
    if (continuationRef.current === null) return;
    if (!supportedRef.current) {
      cancelContinuation();
      return;
    }
    if (!startSession()) {
      cancelContinuation();
      return;
    }
    setAnnouncement(BOOK_HANDOFF_MESSAGE);
  }, [startSession, cancelContinuation]);

  // Issue #166 — the seek control's transport: playing → the audible jump;
  // paused → the paused seek (state preserved, position + marker move, the
  // canonical save rides onListenProgress immediately); stopped → no-op.
  // Issue #239 — a seek is a NEWER INTENT than a pending whole-book
  // continuation (the acceptance's "a new jump invalidates older async
  // work"): the token dies here (the route half rides the caller's
  // handoff.cancelPending in the seek seam), so a jump during the gap can
  // never be followed by a delayed arrival restarting playback.
  const seek = useCallback(
    (offset: number) => {
      cancelContinuation();
      const engine = engineRef.current;
      if (!engine) return;
      if (engine.getState() === "playing") engine.seekTo(offset);
      else if (engine.getState() === "paused") engine.seekWhilePaused(offset);
    },
    [cancelContinuation],
  );

  // Issue #166 — seek to the end: the engine finishes through the ONE
  // completion seam (onFinish → the finished announcement + the host's
  // end-pin save). No wrap to the top; no-op while stopped. The token
  // clears with the seek family (issue #239 — see seek above).
  const seekToEnd = useCallback(() => {
    cancelContinuation();
    engineRef.current?.seekToEnd();
  }, [cancelContinuation]);

  // Issue #43 (O3) — the skip wrappers. A successful skip is SILENT (the
  // speech jump + marker hop are the feedback; no per-hop chatter); only a
  // skip at the session boundary announces, once, through the ONE polite
  // region. Skips with no live session are inert (the bar doesn't render
  // them while stopped).
  const runSkip = useCallback(
    (attempt: (engine: ReadAloudEngine) => boolean, boundaryMessage: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      // Issue #167 — a failed session is not a session: skips stay inert
      // (the bar doesn't render them while failed either).
      if (!transportIsActive(engine.getState())) return;
      if (!attempt(engine)) setAnnouncement(boundaryMessage);
    },
    [],
  );

  const skipSentenceBack = useCallback(() => {
    runSkip((engine) => engine.skipSentences(-1), "No previous sentence.");
  }, [runSkip]);

  const skipSentenceForward = useCallback(() => {
    runSkip((engine) => engine.skipSentences(1), "No next sentence.");
  }, [runSkip]);

  const skipParagraphForward = useCallback(() => {
    runSkip((engine) => engine.skipParagraphForward(), "No next paragraph.");
  }, [runSkip]);

  // Issue #166 — the passage steps (one utterance-sized hop): the same skip
  // discipline as #43 — silent on success, ONE honest line at a boundary.
  const skipPassageBack = useCallback(() => {
    runSkip((engine) => engine.skipPassageBack(), "No previous passage.");
  }, [runSkip]);

  const skipPassageForward = useCallback(() => {
    runSkip((engine) => engine.skipPassageForward(), "No next passage.");
  }, [runSkip]);

  // Issue #165 — a voice/rate change applies to the ACTIVE session, from
  // whichever surface made it (the transport bar's speed select and Voice
  // popover, or the Reading-settings panel — ONE seam, no per-surface
  // plumbing). The engine re-queues the current passage; while paused the
  // change defers to resume() inside the engine, so a settings change never
  // starts playback. No live session → nothing to do: the next Play reads
  // the values fresh (the play-time seam). A chosen voice that no longer
  // resolves degrades to the platform default with the same honest line
  // session start uses — the bar's displayed voice then matches the one
  // actually speaking (the engine's stale-URI degradation stays silent).
  const settingsVoice = settings.voice;
  const settingsRate = settings.rate;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // Issue #167 — a failed session retunes nothing (the engine no-ops
    // too): the change persists in settings and Retry reads it fresh.
    if (!transportIsActive(engine.getState())) return;
    let voiceURI = settingsVoice ?? null;
    if (voiceURI !== null && !storedVoiceAvailable(voiceURI)) {
      voiceURI = null;
      setAnnouncement(VOICE_MISSING_MESSAGE);
    }
    engine.retune({ voiceURI, rate: settingsRate });
  }, [settingsVoice, settingsRate]);

  // Issue #43 (O9) — backgrounding stops playback (spike 0009 F4: "read-aloud
  // controls must treat 'backgrounded' as 'stopped'"): mobile browsers kill
  // the synthesizer on background/lock, so a session that outlives the page
  // would come back as a zombie — a fake "playing" state that never speaks.
  // The session is torn down honestly instead; on return the bar's Play
  // button is the visible resume affordance and the ONE polite region
  // explains the stop — nothing resumes silently (no auto-resume anywhere).
  // Because most screen readers don't announce live-region text that changed
  // while the page was hidden, the explanation is RE-ANNOUNCED on visible
  // return (clear-then-set so the region's text actually changes); a Play
  // press in between supersedes it via the engine guard below.
  // The dual visibilitychange-hidden + pagehide listener pair mirrors the
  // settings-flush discipline (bfcache-safe; no session-end events).
  useEffect(() => {
    const stopForBackground = () => {
      const engine = engineRef.current;
      const continuing = cancelContinuation();
      // The book session also stops between engines, not only while an
      // utterance is active. No hidden arrival may restart speech.
      if (!continuing && (!engine || !transportIsActive(engine.getState()))) return;
      teardown();
      setState("stopped");
      setFollowLevel(FOLLOW_LEVEL_FLOOR);
      backgroundStopRef.current = true;
      setAnnouncement(BACKGROUND_STOP_MESSAGE);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopForBackground();
      } else if (backgroundStopRef.current) {
        backgroundStopRef.current = false;
        setAnnouncement(null);
        window.setTimeout(() => {
          // Only speak the return line if the reader hasn't already pressed
          // Play — never announce over a live session.
          if (engineRef.current === null) setAnnouncement(BACKGROUND_STOP_MESSAGE);
        }, 0);
      }
    };
    const onPageHide = () => stopForBackground();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [teardown, cancelContinuation]);

  return {
    state,
    continuationPending,
    cancelContinuation,
    failure,
    followLevel,
    announcement,
    progressOffset,
    play,
    pauseOrResume,
    stop,
    seek,
    seekToEnd,
    skipSentenceBack,
    skipSentenceForward,
    skipParagraphForward,
    skipPassageBack,
    skipPassageForward,
    continueFromHandoff,
  };
}
