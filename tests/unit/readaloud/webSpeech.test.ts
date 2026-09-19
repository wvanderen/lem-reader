// tests/unit/readaloud/webSpeech.test.ts
// Issue #40 — the session-start stored-voice check behind the honest
// fallback announcement (a stale voiceURI degrades to the platform default,
// and the reader is TOLD). Issue #43 (O8) adds the settings picker's voice
// seam: the probed voice list (voiceschanged-bounded) + the local-voice
// filter. jsdom has no speechSynthesis, so the window attribute is shadowed
// with defineProperty — the same discipline the e2e stub uses. The adapter
// itself stays browser-only (untested here).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterVoiceChoices,
  probeVoices,
  speechSynthesisAvailable,
  storedVoiceAvailable,
} from "../../../src/readaloud/webSpeech";
import type { VoiceChoice } from "../../../src/readaloud/webSpeech";

type FakeVoice = {
  voiceURI: string;
  name: string;
  lang: string;
  localService?: boolean;
};

interface FakeSynth {
  getVoices: () => FakeVoice[];
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

function stubSynthesis(voices: FakeVoice[] | null, synth?: Omit<FakeSynth, "getVoices">): void {
  const value: FakeSynth | undefined =
    voices === null
      ? undefined
      : { getVoices: () => voices, ...(synth ?? {}) };
  Object.defineProperty(window, "speechSynthesis", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  vi.useRealTimers();
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

// ── Issue #43 (O8) — the probed, filtered local-voice list ───────────────────

describe("probeVoices", () => {
  it("no speechSynthesis: resolves []", async () => {
    await expect(probeVoices(100)).resolves.toEqual([]);
  });

  it("a loaded list resolves immediately with the plain voice surface", async () => {
    stubSynthesis([
      { voiceURI: "a", name: "A", lang: "en-GB", localService: true },
    ]);
    await expect(probeVoices(100)).resolves.toEqual([
      { voiceURI: "a", name: "A", lang: "en-GB", localService: true },
    ]);
  });

  it("an empty list waits for voiceschanged, then resolves the loaded list", async () => {
    vi.useFakeTimers();
    const listeners: Array<() => void> = [];
    const voices: FakeVoice[] = [];
    stubSynthesis(voices, {
      addEventListener: (type, cb) => {
        if (type === "voiceschanged") listeners.push(cb);
      },
      removeEventListener: () => {},
    });
    let resolved: unknown = "pending";
    probeVoices(2000).then((v) => (resolved = v));
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe("pending"); // still probing
    // Chrome loads the voices: getVoices flips to populated and the event fires.
    voices.push({ voiceURI: "late", name: "Late", lang: "en", localService: true });
    for (const cb of listeners) cb();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toEqual([
      { voiceURI: "late", name: "Late", lang: "en", localService: true },
    ]);
  });

  it("a silent engine (no voices ever) resolves whatever is present at the timeout — never a hang", async () => {
    vi.useFakeTimers();
    stubSynthesis([], {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    let resolved: unknown = "pending";
    probeVoices(2000).then((v) => (resolved = v));
    await vi.advanceTimersByTimeAsync(1999);
    expect(resolved).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toEqual([]);
  });
});

describe("filterVoiceChoices", () => {
  const remote: VoiceChoice = {
    voiceURI: "cloud-1",
    name: "Cloud Voice",
    lang: "en",
    localService: false,
  };
  const localB: VoiceChoice = {
    voiceURI: "local-b",
    name: "Zora",
    lang: "fr",
    localService: true,
  };
  const localA: VoiceChoice = {
    voiceURI: "local-a",
    name: "Albert",
    lang: "en",
    localService: true,
  };

  it("keeps only local voices, sorted by name (lang tiebreak)", () => {
    expect(filterVoiceChoices([remote, localB, localA])).toEqual([localA, localB]);
  });

  it("lifts the filter when the platform has NO local voices — never an empty picker", () => {
    expect(filterVoiceChoices([remote])).toEqual([remote]);
  });

  it("does not mutate the caller's array", () => {
    const input = [remote, localB, localA];
    const snapshot = [...input];
    filterVoiceChoices(input);
    expect(input).toEqual(snapshot);
  });
});
