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
 * Play press flips the button to Pause immediately (no dead state). */
export type TransportState = "stopped" | "playing" | "paused";

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
 * speak() returns; the adapter wires them to the real utterance. */
export interface UtteranceEvents {
  onstart?: () => void;
  onboundary?: (event: BoundaryEvent) => void;
  onend?: () => void;
  onerror?: () => void;
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
