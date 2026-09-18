// src/readaloud/webSpeech.ts
// Issue #40 — the ONE production SpeechAdapter: real window.speechSynthesis
// behind the seam from src/readaloud/types.ts. Everything browser-specific
// about Web Speech lives here and nowhere else:
//   - capability detection (speechSynthesis may be absent),
//   - utterance construction + event wiring,
//   - the strong-reference discipline (spike 0009 §2.3: an utterance may be
//     garbage-collected mid-speech if nothing holds it — each utterance is
//     retained until its terminal event, then released),
//   - voiceURI → SpeechSynthesisVoice resolution with a calm default fallback
//     (a stale URI for an uninstalled voice degrades to the platform default
//     — never an error, per the honesty constraint the settings UI arrives
//     with the completion ticket).

import type { SpeakRequest, SpeechAdapter, UtteranceEvents } from "./types";

/** Capability check — safe on any environment (jsdom, old browsers). */
export function speechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Create the production adapter over window.speechSynthesis. Call only when
 * speechSynthesisAvailable() is true.
 */
export function createWebSpeechAdapter(): SpeechAdapter {
  const synth = window.speechSynthesis;
  // Strong refs until terminal — the GC discipline from spike 0009 §2.3.
  const live = new Set<SpeechSynthesisUtterance>();

  const speak = (request: SpeakRequest, events: UtteranceEvents) => {
    const utterance = new SpeechSynthesisUtterance(request.text);
    if (request.voiceURI !== null) {
      const voice = synth.getVoices().find((v) => v.voiceURI === request.voiceURI);
      // A stale/uninstalled voiceURI degrades to the platform default voice
      // (utterance.voice stays null) — calm, never an error.
      if (voice) utterance.voice = voice;
    }
    utterance.rate = request.rate;
    utterance.volume = request.volume;
    // Strong-ref discipline (spike 0009 §2.3): hold the utterance from
    // speak() until its terminal event, then release. Without the held ref,
    // engines have garbage-collected mid-speech utterances and events stop.
    live.add(utterance);
    const release = () => live.delete(utterance);
    utterance.onstart = () => events.onstart?.();
    utterance.onboundary = (event) =>
      events.onboundary?.({
        name: event.name,
        charIndex: event.charIndex,
        charLength: event.charLength,
      });
    utterance.onend = () => {
      release();
      events.onend?.();
    };
    utterance.onerror = () => {
      release();
      events.onerror?.();
    };
    synth.speak(utterance);
  };

  return {
    speak,
    cancel: () => synth.cancel(),
    pause: () => synth.pause(),
    resume: () => synth.resume(),
  };
}
