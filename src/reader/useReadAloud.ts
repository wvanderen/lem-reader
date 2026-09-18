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
import {
  createWebSpeechAdapter,
  speechSynthesisAvailable,
} from "../readaloud/webSpeech";
import { useSettings } from "../settings/SettingsContext";

export interface UseReadAloudHandlers {
  /** The reader's live canonical position, read at press time (the only
   * start is Play, and Play starts at the current reading location). */
  getStartOffset: () => number;
  /** The listened position moved — canonical article-global grapheme offset. */
  onListenProgress: (offset: number) => void;
  /** The last chunk finished — the article was completed by ear. */
  onListenFinished: () => void;
}

export interface UseReadAloudReturn {
  /** speechSynthesis exists in this browser (the bar renders regardless). */
  supported: boolean;
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
    teardown();
    const nextEngine = new ReadAloudEngine({
      adapter: createWebSpeechAdapter(),
      chunks: chunkArticleForSpeech(currentArticle),
      voiceURI: settingsRef.current.voice ?? null,
      rate: settingsRef.current.rate,
      callbacks: {
        onStateChange: setState,
        onFollowLevel: setFollowLevel,
        onProgress: (offset) => handlersRef.current.onListenProgress(offset),
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

  return {
    supported: supportedRef.current,
    state,
    followLevel,
    announcement,
    play,
    pauseOrResume,
    stop,
  };
}
