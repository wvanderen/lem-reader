// tests/e2e/readaloud/_speech.ts
// The shared controllable-fake speechSynthesis harness for the read-aloud
// e2e specs (REUSE-DO-NOT-FORK). speechSynthesis is engine-owned and voice-
// dependent (spike 0009 F3: never trust the platform), so the specs install
// a CONTROLLABLE fake via addInitScript and drive its events
// programmatically — deterministic across chromium/firefox/webkit and CI
// machines with no voices at all.
import type { Page } from "@playwright/test";

export type SpeechMode = "word" | "sentence" | "dead";

interface SpokenRecord {
  text: string;
  rate: number;
  volume: number;
  /** Issue #43 — the resolved voiceURI (null = platform default), so the
   * settings-picker tests can assert the voice applied to playback. */
  voice: string | null;
  done: boolean;
  cancelled: boolean;
  utterance: {
    onstart: ((...a: unknown[]) => void) | null;
    onboundary: ((...a: unknown[]) => void) | null;
    onend: ((...a: unknown[]) => void) | null;
    onerror: ((...a: unknown[]) => void) | null;
  };
}

/** Install the fake BEFORE app code loads. The fake records every spoken
 * utterance (text/rate/volume + live event wiring) and exposes
 * window.__speechFire(event, charIndex) for the tests. `mode` seeds the
 * PROBE's outcome (the first, volume-0 utterance):
 *   - "word": a word boundary fires (word-capable voice)
 *   - "sentence": a sentence boundary fires, then the probe ends
 *   - "dead": nothing ever fires (silently-dropped speech)
 * Playback utterances are ALWAYS test-driven — no automatic events. */
export async function installFakeSpeech(page: Page, mode: SpeechMode): Promise<void> {
  // AWAITED: registration is asynchronous — an un-awaited call races the
  // first goto and the stub silently never installs.
  await page.addInitScript((probeMode: SpeechMode) => {
    const spoken: SpokenRecord[] = [];

    class FakeUtterance {
      text: string;
      rate = 1;
      volume = 1;
      voice = null;
      lang = "en";
      onstart: SpokenRecord["utterance"]["onstart"] = null;
      onboundary: SpokenRecord["utterance"]["onboundary"] = null;
      onend: SpokenRecord["utterance"]["onend"] = null;
      onerror: SpokenRecord["utterance"]["onerror"] = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const synth = {
      pending: [] as FakeUtterance[],
      speak(u: FakeUtterance): void {
        const record: SpokenRecord = {
          text: u.text,
          rate: u.rate,
          volume: u.volume,
          voice: (u.voice as { voiceURI?: string } | null)?.voiceURI ?? null,
          done: false,
          cancelled: false,
          utterance: u,
        };
        spoken.push(record);
        // The PROBE (the first volume-0 utterance) auto-fires per mode so
        // the follow level resolves without test timing coupling. Playback
        // utterances are always test-driven.
        if (u.volume === 0 && probeMode !== "dead") {
          window.setTimeout(() => {
            if (record.cancelled) return;
            if (probeMode === "word") {
              u.onboundary?.({ name: "word", charIndex: 0 });
            } else {
              u.onboundary?.({ name: "sentence", charIndex: 7 });
            }
          }, 30);
          if (probeMode === "sentence") {
            window.setTimeout(() => {
              if (record.cancelled) return;
              record.done = true;
              u.onend?.();
            }, 60);
          }
        }
      },
      cancel(): void {
        for (const r of spoken) {
          if (!r.done) r.cancelled = true;
        }
        this.pending = [];
      },
      pause(): void {},
      resume(): void {},
      getVoices(): unknown[] {
        // Issue #43 (O8) — two voices so the settings picker's FILTER is
        // observable in e2e: one local (selectable) and one remote cloud
        // voice (filtered out of the picker's local-voice list).
        return [
          {
            voiceURI: "stub-voice",
            name: "Stub Voice",
            lang: "en",
            localService: true,
            default: true,
          },
          {
            voiceURI: "cloud-voice",
            name: "Cloud Voice",
            lang: "en",
            localService: false,
          },
        ];
      },
      onvoiceschanged: null,
    };
    // speechSynthesis is a getter-only WebIDL attribute on window — a plain
    // assignment fails silently in every engine; defineProperty shadows it.
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FakeUtterance,
      configurable: true,
      writable: true,
    });
    (window as unknown as { __speechSpoken: SpokenRecord[] }).__speechSpoken = spoken;
    (window as unknown as {
      __speechFire: (event: string, charIndex?: number) => void;
    }).__speechFire = (event: string, charIndex = 0) => {
      const record = [...spoken].reverse().find((r) => !r.done && !r.cancelled);
      if (!record) return;
      const u = record.utterance;
      if (event === "boundary") {
        u.onboundary?.({ name: "word", charIndex });
      } else if (event === "end") {
        record.done = true;
        u.onend?.();
      } else if (event === "start") {
        u.onstart?.();
      }
    };
  }, mode);
}
