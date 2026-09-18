// src/readaloud/engine.ts
// Issue #40 — the read-aloud transport engine: sentence-chunked playback,
// the per-voice follow probe, and canonical-offset progress reporting.
//
// spike 0009 findings implemented here:
//   - F2/F3: a short inaudible calibration utterance at session start probes
//     the SELECTED voice's boundary reality and sets the follow level
//     (word → sentence → passage → progress-only, the guaranteed floor).
//     Word-capable and sentence-only voices both resolve without stalling
//     (bounded probe timer); a dead engine degrades to progress-only.
//   - F5: every boundary charIndex (UTF-16 into the utterance's own text) is
//     mapped through the chunk's UTF-16 → grapheme map to a canonical
//     article-global grapheme offset before it leaves this module. Raw
//     charIndex never escapes, is never extrapolated, and is re-anchored on
//     every event (bug 1441503 discipline).
//   - §2.3: each utterance reference stays alive until its terminal event
//     (the adapter owns that); a small settle delay after cancel() dodges the
//     WebKit cancel→queue race (WebKit bug 238189).
//   - F4: a stall watchdog treats a silently-dropped speak() (iOS without a
//     user gesture) as an honest refusal instead of a fake "playing" state.
//
// The engine is framework-free and speaks through the SpeechAdapter seam —
// unit-testable with a fake adapter; the Web Speech API exists only in
// src/readaloud/webSpeech.ts.

import type {
  BoundaryEvent,
  FollowLevel,
  SpeechAdapter,
  SpeakRequest,
  TransportState,
  UtteranceEvents,
} from "./types";
import type { SpeechChunk } from "./chunks";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";

/** Probe settings: short, two sentences, several words — enough for a voice
 * to demonstrate word boundaries, sentence boundaries, or neither. Silent
 * (volume 0): the probe must not make the reader listen to it. */
const PROBE_TEXT = "Listen. One two three four five.";
const PROBE_TIMEOUT_MS = 2000;

/** Settle delay after cancel() before the next speak() — the WebKit
 * utterances-queued-right-after-cancel-miss-events race (bug 238189). */
const CANCEL_SETTLE_MS = 60;

/** A queued utterance that produces NO event at all within this window is
 * treated as refused (the iOS RequireUserGestureForSpeechStart silent drop):
 * stop honestly instead of faking playback (spike 0009 F4). */
const FIRST_EVENT_STALL_MS = 3000;

/** Consecutive failed utterances before playback gives up honestly (one
 * failed chunk may be a token blip; a failing queue is a dead engine). */
const MAX_CONSECUTIVE_ERRORS = 3;

export interface ReadAloudEngineCallbacks {
  onStateChange?(state: TransportState): void;
  onFollowLevel?(level: FollowLevel): void;
  /** Canonical article-global grapheme offset of the listened position. */
  onProgress?(canonicalGrapheme: number): void;
  /** Issue #42 — the spoken-range channel for the visual marker: the
   * canonical [start, end) grapheme range speech is currently inside. A word
   * boundary emits the word's range; an utterance start emits the whole
   * chunk (the passage marker until the first boundary arrives); a chunk
   * completion emits a zero-width [end, end) sentinel that carries progress
   * but must NOT move the marker (the next utterance's start immediately
   * replaces it). Starts never move backward within a session — a skip-BACK
   * transport (#43) resets the floor explicitly by routing through seekTo()
   * (or stop→play for a fresh session), never through this channel alone. */
  onSpokenRange?(range: GraphemeRange): void;
  /** The last chunk finished — the article was completed by ear. */
  onFinish?(): void;
  /** Honest refusal (speech refused to start / queue failed). */
  onError?(message: string): void;
}

export interface ReadAloudEngineOptions {
  adapter: SpeechAdapter;
  chunks: readonly SpeechChunk[];
  voiceURI: string | null;
  rate: number;
  callbacks: ReadAloudEngineCallbacks;
}

/**
 * ReadAloudEngine — one playback session per instance (play → … → terminal).
 * The host (useReadAloud) constructs a fresh engine per Play press; stop()
 * on teardown cancels speech and detaches the callbacks.
 */
export class ReadAloudEngine {
  private readonly adapter: SpeechAdapter;
  private readonly chunks: readonly SpeechChunk[];
  private readonly voiceURI: string | null;
  private readonly rate: number;
  private readonly callbacks: ReadAloudEngineCallbacks;

  private state: TransportState = "stopped";
  /** Session generation — bumped by play/stop/finish; event closures capture
   * their generation and no-op when stale, so cancelled sessions' late
   * events (end/error stragglers) can never drive a newer session. */
  private generation = 0;
  private nextChunkIndex = 0;
  private followLevel: FollowLevel = "progress-only";
  private lastReported = -1;
  /** Issue #42 — the spoken-range channel's own monotonic floor: equal
   * starts ARE re-reported (a chunk-start passage refresh after the previous
   * chunk's zero-width end sentinel), only backward starts are dropped. */
  private lastSpokenStart = -1;
  private consecutiveErrors = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ReadAloudEngineOptions) {
    this.adapter = options.adapter;
    this.chunks = options.chunks;
    this.voiceURI = options.voiceURI;
    this.rate = options.rate;
    this.callbacks = options.callbacks;
  }

  getState(): TransportState {
    return this.state;
  }

  /** The probed follow level for the current/last session (defaults to the
   * guaranteed floor until the probe resolves). */
  getFollowLevel(): FollowLevel {
    return this.followLevel;
  }

  /**
   * Play from a canonical grapheme offset (the reader's current location).
   * Paused → resume; playing → no-op; stopped → probe the voice, then speak
   * the queue starting at the chunk containing the offset. An offset at or
   * past the end restarts from the top (re-listening to a finished article).
   */
  play(fromOffset: number): void {
    if (this.state === "playing") return;
    if (this.state === "paused") {
      this.resume();
      return;
    }
    this.generation += 1;
    const generation = this.generation;
    let startIndex = this.chunks.findIndex((c) => c.endGrapheme > fromOffset);
    if (startIndex === -1) startIndex = 0; // at/past the end → start over
    this.nextChunkIndex = startIndex;
    this.lastReported = -1;
    this.lastSpokenStart = -1;
    this.consecutiveErrors = 0;
    this.setState("playing");
    this.probe(generation);
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.adapter.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.adapter.resume();
    this.setState("playing");
  }

  stop(): void {
    this.generation += 1;
    this.clearStallTimer();
    this.adapter.cancel();
    this.setState("stopped");
  }

  /**
   * Issue #42 — the track the #43 skip controls ride: jump the PLAYING
   * session to the chunk containing `fromOffset` without a stop→play
   * round-trip (no re-probe — the follow level is already known). The
   * monotonic floors reset here, so the spoken-range channel may move
   * BACKWARD (skip-back) as well as forward, and the pre-seek utterance's
   * late events no-op via the generation guard. No-op while paused/stopped —
   * a paused seek is resume-then-seek for the caller (#43 owns that
   * composition). An offset at/past the end restarts from the top.
   */
  seekTo(fromOffset: number): void {
    if (this.state !== "playing") return;
    this.generation += 1;
    const generation = this.generation;
    this.clearStallTimer();
    // Same settle discipline as the probe's post-cancel handoff (WebKit
    // cancel→queue race, bug 238189).
    this.adapter.cancel();
    let startIndex = this.chunks.findIndex((c) => c.endGrapheme > fromOffset);
    if (startIndex === -1) startIndex = 0;
    this.nextChunkIndex = startIndex;
    this.lastReported = -1;
    this.lastSpokenStart = -1;
    this.consecutiveErrors = 0;
    setTimeout(() => this.startPlayback(generation), CANCEL_SETTLE_MS);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** True when an event/timer closure carries a superseded session
   * generation: it must no-op, so cancelled sessions' late events (end/error
   * stragglers) can never drive a newer session. */
  private isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  /**
   * The per-voice calibration utterance (spike 0009 F3). Silent, short,
   * bounded: word boundary → word; sentence boundary then end → sentence;
   * end with neither → passage; nothing at all within the timer →
   * progress-only. Every path converges on startPlayback().
   */
  private probe(generation: number): void {
    let resolved = false;
    let sentenceSeen = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resolve = (level: FollowLevel) => {
      if (resolved || this.isStale(generation)) return;
      resolved = true;
      if (timer !== null) clearTimeout(timer);
      this.followLevel = level;
      this.callbacks.onFollowLevel?.(level);
      // Cancel the probe (a boundary-resolved probe is still speaking; cancel
      // on an already-finished synthesis is a harmless no-op) and let the
      // queue settle before the first real utterance.
      this.adapter.cancel();
      setTimeout(() => this.startPlayback(generation), CANCEL_SETTLE_MS);
    };

    timer = setTimeout(() => {
      resolve(sentenceSeen ? "sentence" : "progress-only");
    }, PROBE_TIMEOUT_MS);

    const events: UtteranceEvents = {
      onboundary: (event) => {
        if (resolved) return;
        if (event.name === "word") {
          resolve("word");
        } else if (event.name === "sentence") {
          sentenceSeen = true;
        }
      },
      onend: () => resolve(sentenceSeen ? "sentence" : "passage"),
      onerror: () => resolve("progress-only"),
    };
    this.armStallTimer(generation, () => resolve("progress-only"));
    this.adapter.speak(this.probeRequest(), events);
  }

  private probeRequest(): SpeakRequest {
    return { text: PROBE_TEXT, voiceURI: this.voiceURI, rate: this.rate, volume: 0 };
  }

  private startPlayback(generation: number): void {
    if (this.isStale(generation) || this.state !== "playing") return;
    this.speakNext(generation);
  }

  private speakNext(generation: number): void {
    if (this.isStale(generation) || this.state !== "playing") return;
    const chunk = this.chunks[this.nextChunkIndex];
    if (!chunk) {
      this.finish(generation);
      return;
    }
    const utteranceProgress = (canonical: number) => {
      if (this.isStale(generation)) return;
      this.reportProgress(canonical);
    };
    const advance = () => {
      if (this.isStale(generation) || this.state !== "playing") return;
      this.clearStallTimer();
      this.consecutiveErrors = 0;
      this.reportProgress(chunk.endGrapheme);
      // Zero-width spoken sentinel: carries the progress currency only — the
      // marker must NOT collapse; the next utterance's start range (same
      // start offset, permitted by the equal-start rule) replaces it.
      this.reportSpoken({ start: chunk.endGrapheme, end: chunk.endGrapheme });
      this.nextChunkIndex += 1;
      this.speakNext(generation);
    };
    const advanceAfterError = () => {
      if (this.isStale(generation) || this.state !== "playing") return;
      this.clearStallTimer();
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.fail(generation, "Read aloud couldn't keep playing.");
        return;
      }
      this.nextChunkIndex += 1;
      this.speakNext(generation);
    };

    this.armStallTimer(generation, () => {
      this.fail(generation, "Speech didn't start. Press Play to try again.");
    });
    this.adapter.speak(
      { text: chunk.text, voiceURI: this.voiceURI, rate: this.rate, volume: 1 },
      {
        onstart: () => {
          if (this.isStale(generation)) return;
          // Speech began — the utterance is alive; the first-event watchdog
          // has done its job (a non-boundary voice's only early signal is
          // start, and a slow long passage must not read as a stall).
          this.clearStallTimer();
          utteranceProgress(chunk.startGrapheme);
          // Passage marker until the first boundary arrives (for a
          // progress-only voice this IS the marker: the whole chunk).
          this.reportSpoken({ start: chunk.startGrapheme, end: chunk.endGrapheme });
        },
        onboundary: (event) => {
          if (this.isStale(generation)) return;
          // Any boundary event proves the engine is alive — clear the stall
          // watchdog; the utterance is speaking.
          this.clearStallTimer();
          const canonical = mapBoundaryToCanonical(chunk, event);
          if (canonical !== null) this.reportProgress(canonical);
          // Issue #42 — the word-level marker range (never extrapolated:
          // both edges map through the chunk's own UTF-16 → grapheme map).
          const range = mapBoundaryRangeToCanonical(chunk, event);
          if (range !== null) this.reportSpoken(range);
        },
        onend: advance,
        onerror: advanceAfterError,
      },
    );
  }

  private finish(generation: number): void {
    if (this.isStale(generation)) return;
    this.generation += 1;
    this.clearStallTimer();
    this.setState("stopped");
    this.callbacks.onFinish?.();
  }

  private fail(generation: number, message: string): void {
    if (this.isStale(generation)) return;
    this.generation += 1;
    this.clearStallTimer();
    this.adapter.cancel();
    this.setState("stopped");
    this.callbacks.onError?.(message);
  }

  /** Monotonic guard: the listened position never moves backward within a
   * session (an utterance's start event must not undo its own boundary). */
  private reportProgress(canonical: number): void {
    if (canonical <= this.lastReported) return;
    this.lastReported = canonical;
    this.callbacks.onProgress?.(canonical);
  }

  /** Issue #42 spoken-range guard: backward starts are dropped; equal starts
   * pass (the chunk-boundary passage refresh after the zero-width end
   * sentinel), so the marker always reflects the CURRENT utterance. */
  private reportSpoken(range: GraphemeRange): void {
    if (range.start < this.lastSpokenStart) return;
    this.lastSpokenStart = range.start;
    this.callbacks.onSpokenRange?.(range);
  }

  private setState(state: TransportState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /** Watchdog from speak() until the utterance's FIRST event: a silent drop
   * (iOS gesture gating) reads as an honest error, never a fake playing
   * state. Cleared by any event (start/boundary/end/error). */
  private armStallTimer(generation: number, onStall: () => void): void {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      if (!this.isStale(generation) && this.state === "playing") {
        onStall();
      }
    }, FIRST_EVENT_STALL_MS);
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }
}

/**
 * F5 mapping — utterance charIndex (UTF-16 into the chunk's own text) →
 * canonical article-global grapheme offset. Clamped on both ends; a corrupt
 * charIndex degrades to the chunk edge instead of a wrong passage. Returns
 * null only for a negative charIndex (spec: engines that cannot supply one
 * return 0 — never treat 0 as "unsupported" mid-stream).
 */
export function mapBoundaryToCanonical(
  chunk: SpeechChunk,
  event: BoundaryEvent,
): number | null {
  if (event.charIndex < 0) return null;
  const clamped = Math.min(event.charIndex, chunk.utf16ToGrapheme.length - 1);
  const ordinal = chunk.utf16ToGrapheme[clamped];
  if (ordinal === undefined) return null;
  const canonical = chunk.startGrapheme + ordinal;
  return Math.max(chunk.startGrapheme, Math.min(canonical, chunk.endGrapheme));
}

/**
 * Issue #42 — the spoken-range mapping behind the visual marker: both edges
 * of the currently-spoken span in canonical article-global graphemes.
 *
 *   start — the boundary's own charIndex mapped by mapBoundaryToCanonical.
 *   end   — charIndex + charLength when the engine supplies a positive
 *           charLength; otherwise the next whitespace in the chunk's own
 *           text (spec §4.2.6: charLength is 0/undefined when the engine
 *           cannot determine it — the whitespace fallback keeps the marker
 *           word-sized for sentence boundaries and length-less voices
 *           instead of collapsing to an invisible zero-width slice).
 *
 * Both edges clamp to the chunk (a corrupt length degrades to the chunk
 * edge, never a wrong passage), and end is never behind start. Returns null
 * only when the start itself is unmappable (same contract as
 * mapBoundaryToCanonical).
 */
export function mapBoundaryRangeToCanonical(
  chunk: SpeechChunk,
  event: BoundaryEvent,
): GraphemeRange | null {
  const start = mapBoundaryToCanonical(chunk, event);
  if (start === null) return null;
  let endUtf16: number;
  if (event.charLength !== undefined && event.charLength > 0) {
    endUtf16 = event.charIndex + event.charLength;
  } else {
    endUtf16 = chunk.text.length;
    for (let i = event.charIndex + 1; i < chunk.text.length; i++) {
      const ch = chunk.text[i];
      if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
        endUtf16 = i;
        break;
      }
    }
  }
  const clampedEndUtf16 = Math.max(
    event.charIndex + 1,
    Math.min(endUtf16, chunk.utf16ToGrapheme.length - 1),
  );
  const endOrdinal = chunk.utf16ToGrapheme[clampedEndUtf16];
  if (endOrdinal === undefined) return { start, end: start };
  const end = chunk.startGrapheme + endOrdinal;
  return { start, end: Math.max(start, Math.min(end, chunk.endGrapheme)) };
}
