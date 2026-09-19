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
 * Whether a stored voiceURI still resolves to an installed voice — the
 * session-start check behind the honest fallback announcement (a stale URI
 * for an uninstalled voice degrades to the platform default; the reader is
 * TOLD, not left guessing why the voice changed). Conservative when the
 * voice list has not loaded yet (empty getVoices, Chrome's async
 * voiceschanged): nothing can be known, so report available and let the
 * adapter's per-speak lookup decide — never a false "voice not found".
 */
export function storedVoiceAvailable(voiceURI: string): boolean {
  if (!speechSynthesisAvailable()) return false;
  const voices = window.speechSynthesis.getVoices();
  return voices.length === 0 || voices.some((v) => v.voiceURI === voiceURI);
}

/** The plain voice surface the settings picker consumes (issue #43, O8) —
 * the four fields the filtered list and its option labels need, nothing
 * more. */
export interface VoiceChoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

/**
 * Probe the platform voice list (issue #43, O8 — the "probed" voice list).
 * Chrome populates getVoices() asynchronously (the voiceschanged event), so
 * an empty first read is NOT the truth: wait for voiceschanged until voices
 * appear, bounded by a timeout that resolves with whatever is present (an
 * engine with no voices at all resolves empty — the picker shows its calm
 * fallback, never a hang). Resolves immediately when the list is already
 * loaded. Safe on any environment (resolves [] without speechSynthesis).
 */
export function probeVoices(timeoutMs = 2000): Promise<VoiceChoice[]> {
  return new Promise((resolve) => {
    if (!speechSynthesisAvailable()) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const collect = (): VoiceChoice[] =>
      synth.getVoices().map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
      }));
    let settled = false;
    const finish = (voices: VoiceChoice[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = () => {
      const voices = collect();
      if (voices.length > 0) finish(voices);
    };
    const timer = setTimeout(() => finish(collect()), timeoutMs);
    // EventTarget methods are spec'd on speechSynthesis, but a non-throwing
    // probe is the contract (this runs inside the settings panel).
    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    const first = collect();
    if (first.length > 0) finish(first);
  });
}

/**
 * The filtered LOCAL-voice list for the settings picker (spike 0009 §5.3:
 * prefer localService voices; online/effect voices exist to be filtered).
 * Local voices only, sorted by name (lang tiebreak) for a predictable,
 * calm order. When the platform exposes NO local voices the filter lifts
 * rather than showing an empty picker — an honest fallback, never a silent
 * dead-end control.
 */
export function filterVoiceChoices(voices: readonly VoiceChoice[]): VoiceChoice[] {
  const local = voices.filter((v) => v.localService);
  const chosen = local.length > 0 ? local : [...voices];
  return chosen.sort(
    (a, b) => a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang),
  );
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
