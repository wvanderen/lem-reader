// src/readaloud/types.ts
// Issue #40 — the minimal speakable path's shared contracts: the follow-level
// ladder, the transport state, and the SpeechAdapter seam that keeps the
// engine unit-testable (jsdom has no speechSynthesis; the engine sees events,
// never the Web Speech API).
//
// Design sources (spike 0009 — docs/spikes/0009-web-speech-word-boundaries.md):
//   - F2: sentence-chunked utterances with a chunk → canonical-offset mapping
//     (the D-05 grapheme substrate — never raw charIndex, never page numbers).
//   - F3: "Never trust the platform; probe the voice" — the follow ladder
//     word → sentence → passage → progress-only, probed per voice at session
//     start, with progress-only as the guaranteed floor.
//   - F5: charIndex (UTF-16 code units into the utterance's own text) is
//     ephemeral; it is mapped to a canonical article grapheme offset on every
//     event and never persisted.

/** How closely playback can follow the spoken position, probed per voice
 * (spike 0009 F3). Displayed as text on the transport bar; the canonical
 * location tracks at the finest granularity events actually provide. */
export type FollowLevel = "word" | "sentence" | "passage" | "progress-only";

/** The transport state. Probing is internal to "playing" — the reader's
 * Play press flips the button to Pause immediately (no dead state). Issue
 * #167 — "failed" is a DETECTED failure the bar keeps showing (the honest
 * refusal stays on screen with Retry + voice selection): neither playback
 * nor rest, and never a fake "playing". */
export type TransportState = "stopped" | "playing" | "paused" | "failed";

/** Issue #167 — which honest failure the engine detected, so the UI can
 * give the reader feedback that names what actually happened: "start" (no
 * utterance ever began — the voice/engine refused or silently dropped) vs
 * "playback" (speech was underway and the queue died partway). */
export type SpeechFailureKind = "start" | "playback";

/** Issue #167 — the ONE honest failure report the engine hands the host:
 * the reader-facing copy, which kind of failure it was, and — when the
 * platform supplied one — its own error reason (diagnostics, never
 * reader-facing copy). */
export interface SpeechFailure {
  message: string;
  kind: SpeechFailureKind;
  reason?: string;
}

/** Whether a transport state owns a live (controllable) session — speech
 * exists to pause/seek/skip, and the anchor-save gate defers to the listened
 * path. "failed" is NOT live: the session has ended (Retry starts a fresh
 * one), so hosts treat it like stopped everywhere except the bar's own
 * keep-open contract. ONE guard, shared by every site that used to re-derive
 * this predicate with alternating polarity. */
export function transportIsActive(state: TransportState): boolean {
  return state === "playing" || state === "paused";
}

/** What the engine asks the adapter to speak. voiceURI is resolved to a
 * SpeechSynthesisVoice by the adapter (null = platform default voice). */
export interface SpeakRequest {
  text: string;
  voiceURI: string | null;
  rate: number;
  /** 0 for the inaudible per-voice probe, 1 for real playback. */
  volume: number;
}

/** The SpeechSynthesisUtterance boundary event surface the engine needs
 * (spec §4.2.6): charIndex is a UTF-16 code-unit offset into the utterance's
 * OWN text; charLength is 0/undefined when the engine cannot determine it;
 * name is "word" or "sentence". All optional in the wild — engines exempt
 * themselves per spec §4.2.5. */
export interface BoundaryEvent {
  name?: string;
  charIndex: number;
  charLength?: number;
}

/** Event surface of one spoken utterance. The engine assigns these before
 * speak() returns; the adapter wires them to the real utterance. Issue
 * #167 — onerror carries the platform's error reason (the
 * SpeechSynthesisErrorEvent.error code: "not-allowed", "synthesis-failed",
 * "interrupted", …) so a refusal is never indistinguishable from a silent
 * stall again; engines/tests that supply no reason arrive as undefined. */
export interface UtteranceEvents {
  onstart?: () => void;
  onboundary?: (event: BoundaryEvent) => void;
  onend?: () => void;
  onerror?: (reason?: string) => void;
}

/**
 * The SpeechAdapter seam (the ONE production implementation wraps real
 * speechSynthesis — src/readaloud/webSpeech.ts). The adapter OWNS utterance
 * object identity and keeps strong references until end/error (spike 0009
 * §2.3: utterance event handlers can be garbage-collected mid-speech).
 */
export interface SpeechAdapter {
  speak(request: SpeakRequest, events: UtteranceEvents): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}
