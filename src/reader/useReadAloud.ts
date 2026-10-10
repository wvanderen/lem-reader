// src/reader/useReadAloud.ts
// Issue #40 — the React seam between the reader route and the read-aloud
// engine. One hook owns the per-session engine lifecycle (a fresh engine per
// Play press), applies the v3 settings (voice + rate) at play time, and
// funnels engine events into transport state + the ONE polite transport
// announcement. The listening-is-reading contract (ADR 0001) lands in the
// host: the hook reports listened canonical offsets upward, and ArticleView
// drives the SAME shared location-save discipline the scroll path uses.
//
// Discipline mirrors the sibling hooks (useScrollSave/useReadingSession):
// latest-handler refs so callbacks stay stable, no focus movement anywhere
// (the transport bar's buttons own focus), no global hotkeys (the ONLY start
// is Play), engine torn down on unmount/article swap (speech never survives
// its article).

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import { chunkArticleForSpeech } from "../readaloud/chunks";
import { ReadAloudEngine } from "../readaloud/engine";
import type { FollowLevel, TransportState } from "../readaloud/types";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";
import {
  createWebSpeechAdapter,
  speechSynthesisAvailable,
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
  /** The last chunk finished — the article was completed by ear. */
  onListenFinished: () => void;
}

export interface UseReadAloudReturn {
  state: TransportState;
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
}

export function useReadAloud(
  article: CanonicalArticle | null,
  handlers: UseReadAloudHandlers,
): UseReadAloudReturn {
  const { settings } = useSettings();
  const supportedRef = useRef(speechSynthesisAvailable());
  const [state, setState] = useState<TransportState>("stopped");
  const [followLevel, setFollowLevel] = useState<FollowLevel>(FOLLOW_LEVEL_FLOOR);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  /** Issue #166 — the seek slider's display mirror of the listened position
   * (see UseReadAloudReturn.progressOffset). */
  const [progressOffset, setProgressOffset] = useState<number | null>(null);
  /** O9 — a background-forced stop is awaiting its visible-return
   * re-announcement (set on hide/pagehide, consumed on visible). */
  const backgroundStopRef = useRef(false);

  // Latest-handler refs (useScrollSave pattern): ArticleView's callbacks are
  // re-created per render; the engine must always call the freshest ones.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // Latest settings at play time (the engine is built per Play press).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const articleRef = useRef(article);
  articleRef.current = article;
  const engineRef = useRef<ReadAloudEngine | null>(null);

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

  const play = useCallback(() => {
    if (!supportedRef.current) {
      setAnnouncement("Read aloud isn't available in this browser.");
      return;
    }
    // Resume the paused session first — a second Play never restarts speech.
    const existing = engineRef.current;
    if (existing && existing.getState() === "paused") {
      existing.resume();
      setState("playing");
      setAnnouncement("Reading aloud.");
      return;
    }
    const currentArticle = articleRef.current;
    if (!currentArticle) return;
    // Honest fallback note (once per session start): a stored voice that no
    // longer resolves degrades to the platform default — the adapter does
    // the degrading calmly, but the reader is TOLD rather than left
    // wondering why the voice changed. The stale URI is dropped so playback
    // deterministically matches the announcement.
    const storedVoice = settingsRef.current.voice ?? null;
    let voiceURI = storedVoice;
    if (storedVoice !== null && !storedVoiceAvailable(storedVoice)) {
      voiceURI = null;
      setAnnouncement(VOICE_MISSING_MESSAGE);
    }
    teardown();
    // The fresh session probes from scratch — show the floor until its probe
    // resolves (never the previous session's level), and the seek slider's
    // mirror resets with it. The mirror STARTS at the play anchor (never a
    // false 0%): a resumed mid-article session shows its true position from
    // the first frame — the probe window included — and the first progress
    // event refines it to the speaking chunk.
    setFollowLevel(FOLLOW_LEVEL_FLOOR);
    setProgressOffset(handlersRef.current.getStartOffset());
    const nextEngine = new ReadAloudEngine({
      adapter: createWebSpeechAdapter(),
      chunks: chunkArticleForSpeech(currentArticle),
      voiceURI,
      rate: settingsRef.current.rate,
      callbacks: {
        onStateChange: setState,
        onFollowLevel: setFollowLevel,
        onProgress: (offset) => {
          setProgressOffset(offset);
          handlersRef.current.onListenProgress(offset);
        },
        onSpokenRange: (range) => handlersRef.current.onListenSpoken?.(range),
        onFinish: () => {
          setFollowLevel(FOLLOW_LEVEL_FLOOR);
          setAnnouncement("Read aloud finished.");
          handlersRef.current.onListenFinished();
        },
        onError: (message) => {
          setFollowLevel(FOLLOW_LEVEL_FLOOR);
          setAnnouncement(message);
        },
      },
    });
    engineRef.current = nextEngine;
    // The ONLY start is Play, and Play starts at the reader's current
    // reading position — read live through the host's getter at press time.
    nextEngine.play(handlersRef.current.getStartOffset());
    setState("playing");
    setAnnouncement("Reading aloud.");
  }, [teardown]);

  const pauseOrResume = useCallback(() => {
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
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    teardown();
    setState("stopped");
    setFollowLevel(FOLLOW_LEVEL_FLOOR);
    setAnnouncement("Read aloud stopped.");
  }, [teardown]);

  // Issue #166 — the seek control's transport: playing → the audible jump;
  // paused → the paused seek (state preserved, position + marker move, the
  // canonical save rides onListenProgress immediately); stopped → no-op.
  const seek = useCallback((offset: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getState() === "playing") engine.seekTo(offset);
    else if (engine.getState() === "paused") engine.seekWhilePaused(offset);
  }, []);

  // Issue #166 — seek to the end: the engine finishes through the ONE
  // completion seam (onFinish → the finished announcement + the host's
  // end-pin save). No wrap to the top; no-op while stopped.
  const seekToEnd = useCallback(() => {
    engineRef.current?.seekToEnd();
  }, []);

  // Issue #43 (O3) — the skip wrappers. A successful skip is SILENT (the
  // speech jump + marker hop are the feedback; no per-hop chatter); only a
  // skip at the session boundary announces, once, through the ONE polite
  // region. Skips with no live session are inert (the bar doesn't render
  // them while stopped).
  const runSkip = useCallback(
    (attempt: (engine: ReadAloudEngine) => boolean, boundaryMessage: string) => {
      const engine = engineRef.current;
      if (!engine || engine.getState() === "stopped") return;
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
    if (!engine || engine.getState() === "stopped") return;
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
      if (!engine) return;
      const s = engine.getState();
      if (s !== "playing" && s !== "paused") return;
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
  }, [teardown]);

  return {
    state,
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
  };
}
