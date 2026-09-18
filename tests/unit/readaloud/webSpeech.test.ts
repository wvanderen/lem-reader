// tests/unit/readaloud/webSpeech.test.ts
// Issue #40 — the session-start stored-voice check behind the honest
// fallback announcement (a stale voiceURI degrades to the platform default,
// and the reader is TOLD). jsdom has no speechSynthesis, so the window
// attribute is shadowed with defineProperty — the same discipline the e2e
// stub uses. The adapter itself stays browser-only (untested here).
import { afterEach, describe, expect, it } from "vitest";
import {
  speechSynthesisAvailable,
  storedVoiceAvailable,
} from "../../../src/readaloud/webSpeech";

type FakeVoice = { voiceURI: string; name: string; lang: string };

function stubSynthesis(voices: FakeVoice[] | null): void {
  const synth = voices === null ? undefined : { getVoices: () => voices };
  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
});

describe("storedVoiceAvailable", () => {
  it("no speechSynthesis: false (playback is refused before this runs)", () => {
    expect(speechSynthesisAvailable()).toBe(false);
    expect(storedVoiceAvailable("some-voice")).toBe(false);
  });

  it("URI among installed voices: true", () => {
    stubSynthesis([{ voiceURI: "a", name: "A", lang: "en" }]);
    expect(storedVoiceAvailable("a")).toBe(true);
    expect(storedVoiceAvailable("b")).toBe(false);
  });

  it("voice list not loaded yet (empty getVoices): true — never a false 'not found'", () => {
    stubSynthesis([]);
    expect(storedVoiceAvailable("a")).toBe(true);
  });
});
