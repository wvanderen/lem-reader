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
  /** The probed follow level — null until the first probe of the session. */
  followLevel: FollowLevel | null;
  /** The ONE polite transport announcement (role=status copy). */
  announcement: string | null;
  /** Start (or resume after pause) — the only start is Play. */
  play: () => void;
  /** Pause while playing; resume while paused. */
  pauseOrResume: () => void;
  stop: () => void;
  /**
   * Issue #42 — the track the #43 skip controls ride: jump the PLAYING
   * session to the chunk containing the canonical offset (no re-probe; the
   * spoken marker may move backward). No-op while paused/stopped — #43
   * composes resume-then-seek for a paused skip.
   */
  seek: (fromOffset: number) => void;
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
}

export function useReadAloud(
  article: CanonicalArticle | null,
  handlers: UseReadAloudHandlers,
): UseReadAloudReturn {
  const { settings } = useSettings();
  const supportedRef = useRef(speechSynthesisAvailable());
  const [state, setState] = useState<TransportState>("stopped");
  const [followLevel, setFollowLevel] = useState<FollowLevel | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

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
      setAnnouncement("Saved voice not found — using the default voice.");
    }
    teardown();
    const nextEngine = new ReadAloudEngine({
      adapter: createWebSpeechAdapter(),
      chunks: chunkArticleForSpeech(currentArticle),
      voiceURI,
      rate: settingsRef.current.rate,
      callbacks: {
        onStateChange: setState,
        onFollowLevel: setFollowLevel,
        onProgress: (offset) => handlersRef.current.onListenProgress(offset),
        onSpokenRange: (range) => handlersRef.current.onListenSpoken?.(range),
        onFinish: () => {
          setAnnouncement("Read aloud finished.");
          handlersRef.current.onListenFinished();
        },
        onError: (message) => setAnnouncement(message),
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
    setAnnouncement("Read aloud stopped.");
  }, [teardown]);

  const seek = useCallback((fromOffset: number) => {
    engineRef.current?.seekTo(fromOffset);
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

  // Issue #43 (O9) — backgrounding stops playback (spike 0009 F4: "read-aloud
  // controls must treat 'backgrounded' as 'stopped'"): mobile browsers kill
  // the synthesizer on background/lock, so a session that outlives the page
  // would come back as a zombie — a fake "playing" state that never speaks.
  // The session is torn down honestly instead; on return the bar's Play
  // button is the visible resume affordance and the ONE polite region
  // explains the stop — nothing resumes silently (no auto-resume anywhere).
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
      setAnnouncement(
        "Read aloud stopped while the reader was in the background. Press Play to continue.",
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopForBackground();
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
    play,
    pauseOrResume,
    stop,
    seek,
    skipSentenceBack,
    skipSentenceForward,
    skipParagraphForward,
  };
}
