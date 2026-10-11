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
  SpeechFailure,
  TransportState,
  UtteranceEvents,
} from "./types";
import { transportIsActive } from "./types";
import type { SpeechChunk } from "./chunks";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";

/** Probe settings: two short sentences — enough for a voice to demonstrate
 * word boundaries, sentence boundaries, or neither. Silent (volume 0): the
 * probe must not make the reader listen to it. Issue #167 — kept SHORT
 * (~1.5s spoken): the first chunk queues BEHIND the probe (see
 * probeUnresolved), so the probe's natural duration is the audible-start
 * delay. */
const PROBE_TEXT = "Hi. One two three.";
const PROBE_TIMEOUT_MS = 2000;

/** Settle delay after cancel() before the next speak() — the WebKit
 * utterances-queued-right-after-cancel-miss-events race (bug 238189). */
const CANCEL_SETTLE_MS = 60;

/** A queued utterance that produces NO event at all within this window is
 * treated as refused (the iOS RequireUserGestureForSpeechStart silent drop):
 * stop honestly instead of faking playback (spike 0009 F4). */
const FIRST_EVENT_STALL_MS = 3000;

/** Issue #167 — the honest failure copy, exported LIVE so the suites assert
 * the exact strings (one rename site, like FOLLOW_LABELS). Startup names
 * the voice as the first thing to try (the bar's Retry + Voice picker sit
 * right there); playback names the saved place (the preserved position is
 * what Retry resumes from — never silently past unread passages). */
export const START_FAILURE_MESSAGE =
  "Speech didn't start. Try a different voice, then press Retry.";
export const PLAYBACK_FAILURE_MESSAGE =
  "Read aloud stopped partway. Your place is saved — press Retry to continue from there.";

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
  /** Honest refusal (issue #167): the state lands on "failed" (not stopped)
   * so the host can keep the transport open with Retry + voice selection.
   * The SpeechFailure carries the kind (start vs playback) and — when one
   * arrived — the platform's own error reason (diagnostics, never
   * reader-facing copy). */
  onError?(failure: SpeechFailure): void;
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
 * on teardown cancels speech and detaches the callbacks. Issue #165 — the
 * session's voice + rate are RETUNABLE live (retune()); the synthesizer
 * cannot re-voice a held utterance, so a retune re-queues the current
 * passage instead.
 */
export class ReadAloudEngine {
  private readonly adapter: SpeechAdapter;
  private readonly chunks: readonly SpeechChunk[];
  /** Mutable per retune() — the CURRENT passage's next utterance always
   * carries the latest values (issue #165). */
  private voiceURI: string | null;
  private rate: number;
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
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** A cancelled utterance needs a fresh queue, including throughout probing. */
  private requeueTimer: ReturnType<typeof setTimeout> | null = null;
  /** Issue #167 — the probe utterance is IN FLIGHT (spoken, unresolved).
   * From play() until it resolves the engine must NEVER cancel: Firefox/
   * macOS permanently wedges the whole synthesizer when a cancel lands on
   * an actively-synthesizing utterance (spike 0010 — in-page recovery
   * impossible). While this is true, seek/skip/retune RETARGET the queued
   * chunk instead of canceling, and pause freezes the queue. Only terminal
   * paths (stop/fail) still cancel. */
  private probeUnresolved = false;
  /** Issue #167 — the probe resolved while PAUSED (the synth is frozen, so
   * the chunk must not be queued into a frozen queue): resume() queues it. */
  private probeHandoffPending = false;
  /** The first chunk is queued but has produced NO event yet: resume() must
   * re-arm the first-event watchdog (pause clears it — never fail while
   * frozen), and the chunk's own events clear it. */
  private chunkQueuedUnstarted = false;
  /** A retune landed while the probe was in flight: the level the probe
   * resolves describes the PREVIOUS voice, so the next re-probe must not be
   * skipped. */
  private probeRetuned = false;
  /** Issue #166 — a seek landed while PAUSED: the synthesizer holds the old
   * utterance, so resume() must REPLACE it with the seek target instead of
   * finishing the stale passage (the same shape as a paused retune). */
  private pausedSeekPending = false;
  /** Issue #165 — a retune that landed while PAUSED: the synthesizer holds
   * the old utterance, so the new voice/rate can only take effect when
   * speech next starts. Applied by resume() (never by pause — a settings
   * change must not start playback). */
  private retunePending = false;
  /** A voice change landed that the CURRENT follow level has not been
   * probed for — cleared only when a probe resolves, so it ACCUMULATES
   * across consecutive retunes (voice→rate, or rate caught mid-settle by a
   * pause): whichever path re-speaks first re-probes iff this is set. */
  private voiceRetunePending = false;
  /** Issue #167 — whether THIS session has produced any evidence of speech
   * actually underway (a start, a boundary, or a completed chunk). The
   * stall watchdog reads it to classify a silent drop honestly: nothing
   * ever spoken is a START failure; a drop after working speech is a
   * PLAYBACK failure ("stopped partway"), never "Speech didn't start"
   * minutes into an article. */
  private spokenThisSession = false;

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
   * Paused → resume; playing → no-op; stopped OR FAILED → a fresh session
   * probing and speaking the queue starting at the chunk containing the
   * offset — "failed" is the retry shape (issue #167): a fresh start from
   * the position the host hands in (the preserved listened offset). An
   * offset at or past the end restarts from the top (re-listening to a
   * finished article).
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
    this.spokenThisSession = false;
    this.setState("playing");
    this.probe(generation);
  }

  pause(): void {
    if (this.state !== "playing") return;
    // Issue #167 — NO cancel, even while the probe is in flight: the synth
    // freezes (probe + any queued chunk stay parked in the queue) and the
    // first-event watchdog stops — never a failure while frozen.
    this.clearStallTimer();
    this.adapter.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    // Issue #166 — a seek landed while paused: the synthesizer still holds
    // the OLD utterance, so plain resume() would finish the stale passage.
    // Re-queue the seek TARGET chunk instead (never starts speech here — the
    // paused state only flips when the reader resumes).
    if (this.pausedSeekPending) {
      this.pausedSeekPending = false;
      this.setState("playing");
      this.requeueCurrentPassage();
      return;
    }
    // Issue #165 — a retune landed while paused: the synthesizer still holds
    // the OLD utterance, so plain resume() would finish the passage at the
    // stale settings. Re-queue the current passage under the new ones instead
    // (re-probing first iff a voice change is still unprobed — the follow
    // level must match the voice actually speaking).
    if (this.retunePending) {
      this.retunePending = false;
      this.setState("playing");
      this.requeueCurrentPassage();
      return;
    }
    // Issue #167 — the probe resolved while paused: unpause the synth (the
    // probe resumes; the chunk follows it in the queue) and queue the chunk.
    if (this.probeHandoffPending) {
      this.probeHandoffPending = false;
      this.adapter.resume();
      this.setState("playing");
      this.startPlayback(this.generation);
      return;
    }
    this.adapter.resume();
    this.setState("playing");
    // The queued chunk may still be waiting behind the frozen probe — re-arm
    // the first-event watchdog now that the queue is moving again.
    if (this.chunkQueuedUnstarted) {
      this.armStallTimer(this.generation, () => this.failSpeech(this.generation));
    }
  }

  stop(): void {
    this.abortSession();
    this.setState("stopped");
  }

  /**
   * Issue #42 — the track the #43 skip controls ride: jump the PLAYING
   * session to the chunk containing `fromOffset` without a stop→play
   * round-trip (re-probing only when a voice change is unresolved). The
   * monotonic floors reset here, so the spoken-range channel may move
   * BACKWARD (skip-back) as well as forward, and the pre-seek utterance's
   * late events no-op via the generation guard. No-op while paused/stopped —
   * a paused seek is resume-then-seek for the caller (#43 owns that
   * composition). An offset beyond the final speakable passage finishes.
   */
  seekTo(fromOffset: number): void {
    if (this.state !== "playing") return;
    const startIndex = this.chunks.findIndex((c) => c.endGrapheme > fromOffset);
    if (startIndex === -1) {
      this.seekToEnd();
      return;
    }
    this.nextChunkIndex = startIndex;
    // Issue #167 — while the probe is in flight the first chunk is only
    // QUEUED, not speaking: retarget it and let the probe's resolve queue
    // the right one. Canceling the live probe is the Firefox wedge.
    if (this.probeUnresolved) {
      this.lastReported = -1;
      this.lastSpokenStart = -1;
      return;
    }
    this.requeueCurrentPassage();
  }

  /**
   * Issue #166 — seek while PAUSED: the paused state is preserved (no speech
   * starts), the held utterance is discarded in favor of the target chunk at
   * resume (pausedSeekPending), and the new position reports through the
   * progress + spoken-range channels right away — the canonical save and the
   * visual marker follow the seek without playback. A target beyond the final
   * speakable passage finishes through seekToEnd(), including trailing text
   * that is visible but not spoken.
   */
  seekWhilePaused(fromOffset: number): void {
    if (this.state !== "paused") return;
    const startIndex = this.chunks.findIndex((c) => c.endGrapheme > fromOffset);
    if (startIndex === -1) {
      this.seekToEnd();
      return;
    }
    // Keep speech held until resume, but retire every callback from the old
    // utterance before resetting the floors for a backward seek.
    this.generation += 1;
    this.clearStallTimer();
    this.clearRequeueTimer();
    this.probeHandoffPending = false;
    this.probeUnresolved = false;
    this.chunkQueuedUnstarted = false;
    this.pausedSeekPending = true;
    this.nextChunkIndex = startIndex;
    const chunk = this.chunks[startIndex]!;
    // Fresh floors: the reported seek position is the new session truth.
    this.lastReported = -1;
    this.lastSpokenStart = -1;
    this.reportProgress(chunk.startGrapheme);
    // The whole-chunk passage range (an utterance start never fires while
    // paused, so the seek itself emits the marker's landing range).
    this.reportSpoken({ start: chunk.startGrapheme, end: chunk.endGrapheme });
  }

  /**
   * Issue #166 — seek to the end: the session FINISHES through the same seam
   * as a natural by-ear finish (stopped + onFinish — the host's ONE completion
   * contract: the finished announcement + the end-pin save). No wrap to the
   * top; the final progress/spoken emissions mirror a natural finish's last
   * chunk advance. No-op while stopped or failed (issue #167 — a failed
   * session does not fake a finish; Retry or Stop are the exits).
   */
  seekToEnd(): void {
    // Issue #167 — a failed session does not fake a finish; Retry or Stop
    // are the exits (the shared live-session guard).
    if (!transportIsActive(this.state)) return;
    this.abortSession();
    // The end reports once, like a natural finish's last advance: progress at
    // the final chunk's end + the zero-width sentinel (marker clearing is the
    // host's session-end job, not this channel's).
    const end = this.chunks[this.chunks.length - 1]?.endGrapheme ?? -1;
    if (end >= 0) {
      this.lastReported = -1;
      this.lastSpokenStart = -1;
      this.reportProgress(end);
      this.reportSpoken({ start: end, end });
    }
    this.setState("stopped");
    this.callbacks.onFinish?.();
  }

  /** The shared terminal abort behind stop() and seekToEnd(): supersede every
   * in-flight closure (generation bump), clear the timers, drop every pending
   * handoff/retune/seek flag, and cancel the synthesizer. */
  private abortSession(): void {
    this.generation += 1;
    this.clearStallTimer();
    this.clearRequeueTimer();
    this.retunePending = false;
    this.voiceRetunePending = false;
    this.pausedSeekPending = false;
    this.probeUnresolved = false;
    this.probeHandoffPending = false;
    this.chunkQueuedUnstarted = false;
    this.probeRetuned = false;
    this.adapter.cancel();
  }

  /**
   * Issue #165 — apply a new voice/rate to the ACTIVE session. The
   * synthesizer cannot re-voice or re-pace a held utterance, so the retune
   * re-queues the CURRENT passage (never the article top): playing → cancel,
   * settle, re-speak the current chunk under the new values (re-probing
   * first on a voice change — the follow level must match the voice actually
   * speaking); paused → deferred to resume(), so a settings change NEVER
   * starts playback and the paused state + position are preserved; stopped →
   * no-op (the next play() reads the values fresh). A no-op when nothing
   * changed. Position granularity is the passage: the interrupted sentence
   * restarts from its top — the same contract as the #43 skip transport.
   */
  retune(next: { voiceURI: string | null; rate: number }): void {
    // Issue #167 — a FAILED session retunes nothing: the change persists in
    // settings and the next play() (Retry) reads it fresh (the shared
    // live-session guard).
    if (!transportIsActive(this.state)) return;
    const voiceChanged = next.voiceURI !== this.voiceURI;
    const rateChanged = next.rate !== this.rate;
    if (!voiceChanged && !rateChanged) return;
    this.voiceURI = next.voiceURI;
    this.rate = next.rate;
    // Issue #167 — while the probe is in flight the first chunk is only
    // QUEUED: the new values apply when it queues (speakNext reads them)
    // with NO cancel. The level the probe resolves describes the OLD voice,
    // so the re-probe stays pending (probeRetuned keeps it alive).
    if (this.probeUnresolved) {
      this.probeRetuned = true;
      return;
    }
    // The flag ACCUMULATES: a voice change is unprobed until a probe
    // resolves for it, no matter how many rate-only retunes follow or
    // whether a pause catches the handoff mid-settle.
    if (voiceChanged) this.voiceRetunePending = true;
    if (this.state === "paused") {
      this.retunePending = true;
      return;
    }
    this.requeueCurrentPassage();
  }

  /** The shared seek/retune transport: cancel, reset the floors,
   * then settle → re-probe (iff a voice change is still unprobed) or
   * straight into the current chunk. Both actions observe the same settle
   * discipline (WebKit cancel→queue race). */
  private requeueCurrentPassage(): void {
    const reprobe = this.voiceRetunePending;
    this.generation += 1;
    const generation = this.generation;
    this.clearStallTimer();
    this.clearRequeueTimer();
    this.adapter.cancel();
    this.lastReported = -1;
    this.lastSpokenStart = -1;
    this.probeUnresolved = false;
    this.probeHandoffPending = false;
    this.chunkQueuedUnstarted = false;
    this.probeRetuned = false;
    this.scheduleHandoff(generation, reprobe);
  }

  private scheduleHandoff(generation: number, reprobe = false): void {
    this.clearRequeueTimer();
    this.requeueTimer = setTimeout(() => {
      this.requeueTimer = null;
      if (this.isStale(generation)) return;
      // Issue #167 — pause() can land inside the settle window (the queue
      // was ALREADY cancelled here, post-audible): resume must REQUEUE with
      // fresh values — mark it, never speak while frozen.
      if (this.state === "paused") {
        this.retunePending = true;
        return;
      }
      if (this.state !== "playing") return;
      if (reprobe) this.probe(generation);
      else this.startPlayback(generation);
    }, CANCEL_SETTLE_MS);
  }

  /**
   * Issue #43 — skip sentence backward/forward (O3): jump the session to the
   * first chunk of the sentence `delta` steps from the one currently being
   * spoken. While PAUSED the composition is resume-then-seek (speech
   * halts/resumes and audibly jumps); while stopped it is a no-op. Returns
   * false when there is no sentence in that direction (the session boundary)
   * so the host can give the ONE polite region a single honest line — a
   * successful skip itself stays silent (no per-hop chatter, O3).
   */
  skipSentences(delta: -1 | 1): boolean {
    return this.skipByUnit((c) => c.units.sentenceIndex, delta);
  }

  /**
   * Issue #43 — skip paragraph forward (O3): jump the session to the first
   * chunk of the NEXT speakable paragraph unit (top-level body block or
   * footnote body). Same paused/stopped semantics and return contract as
   * skipSentences. Skipped blocks (code/unsupported) own no unit, so the
   * jump crosses them and the marker visibly hops the gap.
   */
  skipParagraphForward(): boolean {
    return this.skipByUnit((c) => c.units.paragraphIndex, 1);
  }

  /**
   * Issue #166 — previous/next passage: jump exactly one utterance-sized step
   * (the chunk — the same "passage" unit the follow ladder names). The
   * finest, most predictable navigation step: from a mid-sentence piece of an
   * over-budget sentence it moves a single piece, unlike the sentence skips.
   * Same paused/stopped semantics and return contract as the other skips:
   * paused → resume-then-jump, stopped → false, boundary → false (the host
   * gives the ONE polite region its single honest line).
   */
  skipPassageBack(): boolean {
    return this.skipByChunkDelta(-1);
  }

  /** Issue #166 — next passage (see skipPassageBack). */
  skipPassageForward(): boolean {
    return this.skipByChunkDelta(1);
  }

  /** The shared chunk-step walk behind the passage skips: the chunk exactly
   * `delta` indices from the current one, then the shared skip transport.
   * False at either session boundary (no chunk in that direction). */
  private skipByChunkDelta(delta: -1 | 1): boolean {
    const target = this.chunks[this.nextChunkIndex + delta];
    if (!target) return false;
    return this.skipToChunk(target);
  }

  /** The shared skip walk behind both skip controls: land on the first chunk
   * whose unit ordinal is exactly `delta` steps from the current chunk's,
   * then the shared skip transport. False when there is no chunk in that
   * direction (the session boundary) or no session at all. */
  private skipByUnit(unit: (chunk: SpeechChunk) => number, delta: number): boolean {
    const current = this.chunks[this.nextChunkIndex];
    if (!current) return false;
    const target = this.chunks.find((c) => unit(c) === unit(current) + delta);
    if (!target) return false;
    return this.skipToChunk(target);
  }

  /** The shared skip transport: paused → resume first (the acceptance
   * flow's "speech halts/resumes"), then the seekTo jump (no re-probe; the
   * monotonic floors reset so the marker may hop backward). False when the
   * session is stopped — nothing to skip. */
  private skipToChunk(target: SpeechChunk): boolean {
    // Issue #167 — "failed" is not a session: no skip transport out of a
    // detected failure (Retry or Stop are the exits).
    if (!transportIsActive(this.state)) return false;
    if (this.state === "paused") this.resume();
    this.seekTo(target.startGrapheme);
    return true;
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
   * progress-only.
   *
   * Issue #167 — the probe is NEVER canceled. The first chunk QUEUES behind
   * it and the synthesizer plays it when the probe completes naturally:
   * Firefox/macOS permanently wedges the synthesizer when a cancel lands on
   * an actively-synthesizing utterance (the reported "no audible speech,
   * then it closes" — every Play re-wedged via the probe cancel). While the
   * probe is in flight, seek/skip/retune retarget the queued chunk and
   * pause freezes the queue; nothing cancels.
   */
  private probe(generation: number): void {
    if (this.isStale(generation) || this.state !== "playing") return;
    this.probeUnresolved = true;
    this.probeRetuned = false;
    this.voiceRetunePending = true;
    let resolved = false;
    let sentenceSeen = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resolve = (level: FollowLevel) => {
      if (resolved || this.isStale(generation)) return;
      resolved = true;
      if (timer !== null) clearTimeout(timer);
      this.probeUnresolved = false;
      this.followLevel = level;
      // A retune landed mid-probe: the queued chunk carries the new voice,
      // but the level describes the OLD one — keep the re-probe pending.
      if (!this.probeRetuned) this.voiceRetunePending = false;
      this.callbacks.onFollowLevel?.(level);
      // NO cancel, NO settle (the WebKit settle stays for the POST-audible
      // requeue paths, which cancel speech that was actually heard): queue
      // the first chunk behind the probe now.
      this.startPlayback(generation);
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
    this.adapter.speak(this.probeRequest(), events);
  }

  private probeRequest(): SpeakRequest {
    return { text: PROBE_TEXT, voiceURI: this.voiceURI, rate: this.rate, volume: 0 };
  }

  private startPlayback(generation: number): void {
    if (this.isStale(generation)) return;
    // Issue #167 — resolve() can fire while PAUSED (the timeout does not
    // care about the transport): park the handoff for resume() instead of
    // queueing into a frozen synth.
    if (this.state !== "playing") {
      this.probeHandoffPending = true;
      return;
    }
    this.speakNext(generation);
  }

  /** Errors and silent stalls share the same verdict: no speech evidence
   * means a START failure; a failure after speech began is PLAYBACK. */
  private failSpeech(generation: number, reason?: string): void {
    this.fail(
      generation,
      this.spokenThisSession
        ? { message: PLAYBACK_FAILURE_MESSAGE, kind: "playback", reason }
        : { message: START_FAILURE_MESSAGE, kind: "start", reason },
    );
  }

  private speakNext(generation: number): void {
    if (this.isStale(generation)) return;
    if (this.state === "paused") {
      // Issue #167 — resolve() while paused parks the handoff instead.
      this.probeHandoffPending = true;
      return;
    }
    if (this.state !== "playing") return;
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
      this.spokenThisSession = true; // an end IS speech evidence (issue #167)
      this.chunkQueuedUnstarted = false;
      this.reportProgress(chunk.endGrapheme);
      // Zero-width spoken sentinel: carries the progress currency only — the
      // marker must NOT collapse; the next utterance's start range (same
      // start offset, permitted by the equal-start rule) replaces it.
      this.reportSpoken({ start: chunk.endGrapheme, end: chunk.endGrapheme });
      this.nextChunkIndex += 1;
      this.speakNext(generation);
    };
    // Issue #167 — the utterance's error reason (the platform's own code)
    // flows through for diagnosis; the HONEST message is chosen by what the
    // reader can do next, not by the engine's internals.
    const failAfterError = (reason?: string) => {
      if (this.isStale(generation) || this.state !== "playing") return;
      // Never advance past an unheard passage. Retry starts from the last
      // listened offset; a pre-start refusal uses the same verdict as a stall.
      this.failSpeech(generation, reason);
    };

    this.armStallTimer(generation, () => this.failSpeech(generation));
    this.adapter.speak(
      { text: chunk.text, voiceURI: this.voiceURI, rate: this.rate, volume: 1 },
      {
        onstart: () => {
          if (this.isStale(generation)) return;
          // Speech began — the utterance is alive; the first-event watchdog
          // has done its job (a non-boundary voice's only early signal is
          // start, and a slow long passage must not read as a stall).
          this.clearStallTimer();
          this.chunkQueuedUnstarted = false;
          this.spokenThisSession = true;
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
          this.chunkQueuedUnstarted = false;
          this.spokenThisSession = true;
          const canonical = mapBoundaryToCanonical(chunk, event);
          if (canonical !== null) this.reportProgress(canonical);
          // Issue #42 — the word-level marker range (never extrapolated:
          // both edges map through the chunk's own UTF-16 → grapheme map).
          const range = mapBoundaryRangeToCanonical(chunk, event);
          if (range !== null) this.reportSpoken(range);
        },
        onend: advance,
        onerror: failAfterError,
      },
    );
    // Issue #167 — the chunk is queued (possibly behind the still-speaking
    // probe): pause() freezes it and clears the watchdog; resume() re-arms
    // while this flag says the first event is still outstanding.
    this.chunkQueuedUnstarted = true;
  }

  private finish(generation: number): void {
    if (this.isStale(generation)) return;
    this.generation += 1;
    this.clearStallTimer();
    this.setState("stopped");
    this.callbacks.onFinish?.();
  }

  /**
   * Issue #167 — the ONE honest failure terminal: supersede the session
   * (generation bump, timers cleared, synthesizer cancelled) and land the
   * state on "failed" — NOT stopped, so the host's transport stays open
   * with the calm explanation, Retry, and voice selection. The failure kind
   * (start vs playback) plus the platform's own error reason (when one
   * arrived) ride to the host; the position is NOT rewound: the last
   * reported listened offset stands, and a fresh play() (Retry) resumes
   * from it — never silently past unread passages.
   */
  private fail(generation: number, failure: SpeechFailure): void {
    if (this.isStale(generation)) return;
    this.generation += 1;
    this.clearStallTimer();
    this.adapter.cancel();
    this.setState("failed");
    this.callbacks.onError?.(failure);
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

  /** Discard a superseded post-cancel handoff. */
  private clearRequeueTimer(): void {
    if (this.requeueTimer === null) return;
    clearTimeout(this.requeueTimer);
    this.requeueTimer = null;
  }
}

/**
 * F5 mapping — utterance charIndex (UTF-16 into the chunk's own text) →
 * canonical article-global grapheme offset. Clamped on both ends; a corrupt
 * charIndex degrades to the chunk edge instead of a wrong passage. Returns
 * null only for a negative charIndex (spec: engines that cannot supply one
 * return 0 — never treat 0 as "unsupported" mid-stream).
 */
export function mapBoundaryToCanonical(chunk: SpeechChunk, event: BoundaryEvent): number | null {
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
