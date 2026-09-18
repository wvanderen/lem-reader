// tests/unit/readaloud/engine.test.ts
// Issue #40 — the transport engine truth table (src/readaloud/engine.ts),
// driven through a fake SpeechAdapter with fake timers. Sections:
//   1. Per-voice probe (spike 0009 F3): word / sentence / passage /
//      progress-only resolution paths — including the bounded timeout (no
//      stalling) and the sentence-boundary-then-end path for sentence-only
//      voices.
//   2. Start semantics: Play starts at the chunk containing the canonical
//      offset; an at-end offset restarts from the top; the probe utterance
//      is silent (volume 0) and playback is audible (volume 1).
//   3. F5 mapping + progress: boundary charIndexes surface as canonical
//      grapheme offsets; progress is monotonic; chunk completion reports the
//      chunk end; the last chunk's end fires onFinish + stopped.
//   4. Transport: pause/resume/stop; stale events after stop/finish never
//      advance a dead session (generation guard).
//   5. Honest refusals: a silently-dropped speak (iOS gesture gating) trips
//      the stall watchdog; three consecutive failed utterances fail the
//      session — never an infinite speak/error loop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapBoundaryRangeToCanonical,
  ReadAloudEngine,
} from "../../../src/readaloud/engine";
import type { SpeechChunk } from "../../../src/readaloud/chunks";
import type {
  SpeechAdapter,
  SpeakRequest,
  UtteranceEvents,
} from "../../../src/readaloud/types";

// ─── fake adapter ────────────────────────────────────────────────────────────

class FakeAdapter implements SpeechAdapter {
  spoken: { request: SpeakRequest; events: UtteranceEvents }[] = [];
  cancelled = 0;
  paused = 0;
  resumed = 0;

  speak(request: SpeakRequest, events: UtteranceEvents): void {
    this.spoken.push({ request, events });
  }
  cancel(): void {
    this.cancelled += 1;
  }
  pause(): void {
    this.paused += 1;
  }
  resume(): void {
    this.resumed += 1;
  }
  get last() {
    return this.spoken[this.spoken.length - 1];
  }
}

// ASCII-only chunks → the UTF-16 → grapheme map is the identity (plus the
// past-the-end entry), keeping engine tests focused on transport behavior.
function chunk(text: string, startGrapheme: number): SpeechChunk {
  const width = text.length; // 1 unit per cluster
  return {
    text,
    startGrapheme,
    endGrapheme: startGrapheme + width,
    utf16ToGrapheme: Array.from({ length: width + 1 }, (_, i) =>
      Math.min(i, width),
    ),
  };
}

function makeChunks(): SpeechChunk[] {
  // ASCII texts whose lengths ARE their canonical widths, so the identity
  // map holds: ranges [0,9) [9,20) [20,30).
  return [
    chunk("Zero one.", 0), // 9
    chunk("Three four.", 9), // 11 → [9,20)
    chunk("Six seven.", 20), // 10 → [20,30)
  ];
}

interface Harness {
  adapter: FakeAdapter;
  states: string[];
  levels: string[];
  progress: number[];
  /** Issue #42 — the spoken-range channel ([start, end) pairs, in order). */
  spokenRanges: { start: number; end: number }[];
  finished: number;
  errors: string[];
  engine: ReadAloudEngine;
}

function makeEngine(chunks = makeChunks()): Harness {
  const adapter = new FakeAdapter();
  const h: Harness = {
    adapter,
    states: [],
    levels: [],
    progress: [],
    spokenRanges: [],
    finished: 0,
    errors: [],
    engine: null as unknown as ReadAloudEngine,
  };
  h.engine = new ReadAloudEngine({
    adapter,
    chunks,
    voiceURI: "test-voice",
    rate: 1,
    callbacks: {
      onStateChange: (s) => h.states.push(s),
      onFollowLevel: (l) => h.levels.push(l),
      onProgress: (o) => h.progress.push(o),
      onSpokenRange: (range) => h.spokenRanges.push(range),
      onFinish: () => h.finished += 1,
      onError: (m) => h.errors.push(m),
    },
  });
  return h;
}

// Drive the probe to a word-boundary resolution and settle the post-cancel
// delay — the standard "word-capable voice" entry into playback.
function playWordCapable(h: Harness): void {
  h.engine.play(0);
  h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
  vi.advanceTimersByTime(60);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── 1. the per-voice probe ──────────────────────────────────────────────────

describe("probe — follow level resolution (spike 0009 F3)", () => {
  it("a word boundary resolves 'word' immediately and starts playback", () => {
    const h = makeEngine();
    h.engine.play(0);
    expect(h.adapter.spoken).toHaveLength(1);
    expect(h.adapter.spoken[0]!.request.volume).toBe(0); // silent probe
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 2 });
    expect(h.levels).toEqual(["word"]);
    expect(h.engine.getFollowLevel()).toBe("word");
    vi.advanceTimersByTime(60);
    // Playback utterance: audible, chunk 0.
    expect(h.adapter.spoken).toHaveLength(2);
    expect(h.adapter.spoken[1]!.request.volume).toBe(1);
    expect(h.adapter.spoken[1]!.request.text).toBe("Zero one.");
  });

  it("a sentence-only voice (sentence boundary then end) resolves 'sentence'", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "sentence", charIndex: 7 });
    h.adapter.last!.events.onend?.();
    expect(h.levels).toEqual(["sentence"]);
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken).toHaveLength(2);
  });

  it("end with no boundaries resolves 'passage'", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onend?.();
    expect(h.levels).toEqual(["passage"]);
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken).toHaveLength(2);
  });

  it("a dead probe (timeout, nothing fired) degrades to 'progress-only' without stalling", () => {
    const h = makeEngine();
    h.engine.play(0);
    vi.advanceTimersByTime(2000); // PROBE_TIMEOUT_MS
    expect(h.levels).toEqual(["progress-only"]);
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken).toHaveLength(2); // playback still starts
    expect(h.adapter.cancelled).toBeGreaterThanOrEqual(1); // probe cancelled
  });

  it("a probe error resolves 'progress-only'", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onerror?.();
    expect(h.levels).toEqual(["progress-only"]);
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken).toHaveLength(2);
  });
});

// ─── 2. start semantics ──────────────────────────────────────────────────────

describe("play — start offset semantics", () => {
  it("starts at the chunk containing the canonical offset", () => {
    const h = makeEngine();
    // The first playback utterance after a play(12) is the chunk [9,20).
    h.engine.play(12);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Three four.");
  });

  it("an offset at/past the article end restarts from the top", () => {
    const h = makeEngine();
    h.engine.play(999);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Zero one.");
  });

  it("play while playing is a no-op; play while paused resumes", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.play(0); // already playing — no new utterance
    expect(h.adapter.spoken).toHaveLength(2);
    h.engine.pause();
    h.engine.play(0); // paused → resume
    expect(h.adapter.resumed).toBe(1);
    expect(h.engine.getState()).toBe("playing");
  });

  it("playback uses the configured voice + rate from settings", () => {
    const h = makeEngine();
    h.engine.play(0);
    expect(h.adapter.spoken[0]!.request.voiceURI).toBe("test-voice");
    expect(h.adapter.spoken[0]!.request.rate).toBe(1);
  });
});

// ─── 3. F5 mapping + progress ────────────────────────────────────────────────

describe("progress — canonical mapping + monotonicity (F5)", () => {
  it("boundary charIndexes surface as canonical grapheme offsets", () => {
    const h = makeEngine();
    playWordCapable(h);
    // chunk 0 starts at canonical 0; "Zero| one" — charIndex 5 → canonical 5.
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 5 });
    expect(h.progress).toContain(5);
  });

  it("a corrupt charIndex clamps to the chunk instead of a wrong passage", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 9999 });
    // chunk 0 = [0,9) — clamped to its end, never another chunk's range.
    expect(h.progress[h.progress.length - 1]).toBeLessThanOrEqual(9);
    // A negative charIndex (never per spec, defensive) reports nothing.
    const before = h.progress.length;
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: -4 });
    expect(h.progress.length).toBe(before);
  });

  it("progress is monotonic — a chunk's start event never undoes its boundary", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 8 });
    h.adapter.last!.events.onstart?.(); // would regress to 0 without the guard
    expect(h.progress[h.progress.length - 1]).toBe(8);
  });

  it("chunk completion reports the chunk end and advances; the last end finishes", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 0 done → canonical 9
    expect(h.progress).toContain(9);
    expect(h.adapter.last!.request.text).toBe("Three four.");
    h.adapter.last!.events.onend?.(); // chunk 1 done → canonical 20
    h.adapter.last!.events.onend?.(); // chunk 2 done → finish
    expect(h.progress[h.progress.length - 1]).toBe(30); // total end
    expect(h.finished).toBe(1);
    expect(h.engine.getState()).toBe("stopped");
  });
});

// ─── 4. transport ────────────────────────────────────────────────────────────

describe("transport — pause / resume / stop + stale-event guards", () => {
  it("pause/resume flip state and drive the adapter", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    expect(h.engine.getState()).toBe("paused");
    expect(h.adapter.paused).toBe(1);
    h.engine.resume();
    expect(h.engine.getState()).toBe("playing");
    expect(h.adapter.resumed).toBe(1);
  });

  it("events from a stopped session never advance it (generation guard)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.stop();
    expect(h.engine.getState()).toBe("stopped");
    const spokenCount = h.adapter.spoken.length;
    h.adapter.last!.events.onend?.(); // stale end from the cancelled session
    vi.advanceTimersByTime(5000);
    expect(h.finished).toBe(0);
    expect(h.adapter.spoken).toHaveLength(spokenCount); // nothing new queued
    expect(h.progress.filter((p) => p > 0)).toHaveLength(0);
  });

  it("events after a natural finish cannot restart the queue", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.();
    h.adapter.last!.events.onend?.();
    h.adapter.last!.events.onend?.(); // finish
    expect(h.finished).toBe(1);
    const spokenCount = h.adapter.spoken.length;
    h.adapter.last!.events.onend?.(); // stale
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    expect(h.finished).toBe(1);
  });
});

// ─── 6. spoken-range channel (issue #42) ─────────────────────────────────────

describe("spoken ranges — the visual marker channel (issue #42)", () => {
  it("an utterance start emits the whole chunk as the passage marker", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onstart?.();
    // chunk 0 = [0,9): the passage marker spans the utterance.
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 0, end: 9 });
  });

  it("a word boundary emits the word's range via charLength", () => {
    const h = makeEngine();
    playWordCapable(h);
    // "Zero| one." — charIndex 5, charLength 3 → canonical [5, 8).
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 5, charLength: 3 });
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 5, end: 8 });
  });

  it("a missing charLength falls back to the next whitespace (word-sized marker)", () => {
    const h = makeEngine();
    playWordCapable(h);
    // chunk 0 "Zero one.": charIndex 0 ("Zero"), no charLength → whitespace
    // at text index 4 → canonical [0, 4).
    h.adapter.last!.events.onboundary?.({ name: "sentence", charIndex: 0 });
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 0, end: 4 });
  });

  it("a word range never leaves the chunk (corrupt charLength clamps)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0, charLength: 9999 });
    const range = h.spokenRanges[h.spokenRanges.length - 1]!;
    expect(range.start).toBe(0);
    expect(range.end).toBe(9); // chunk 0's end, never chunk 1's territory
  });

  it("spoken starts never move backward within a session", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 5, charLength: 3 });
    const forward = h.spokenRanges[h.spokenRanges.length - 1]!;
    h.adapter.last!.events.onstart?.(); // would regress to the chunk start
    const last = h.spokenRanges[h.spokenRanges.length - 1]!;
    expect(last).toEqual(forward);
  });

  it("chunk completion emits a zero-width sentinel; the next start replaces it (equal start)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 0 done → sentinel [9,9)
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 9, end: 9 });
    // chunk 1's start event carries the SAME start (9) — the equal-start
    // rule lets the passage marker replace the sentinel instead of dropping.
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 9, end: 20 });
  });

  it("stale events from a stopped session emit nothing (generation guard)", () => {
    const h = makeEngine();
    playWordCapable(h);
    const count = h.spokenRanges.length;
    h.engine.stop();
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 2, charLength: 3 });
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges).toHaveLength(count);
  });
});

// ─── 7. seekTo — the #43 skip-controls track (issue #42 review) ─────────────

describe("seekTo — jump the playing session; the floors reset", () => {
  it("moves the queue + marker BACK to an earlier chunk without re-probing", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 0 done → chunk 1 live
    expect(h.adapter.last!.request.text).toBe("Three four.");
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0, charLength: 5 });

    h.engine.seekTo(0); // skip BACK to chunk 0
    vi.advanceTimersByTime(60); // the post-cancel settle
    // No re-probe: the follow level survives, the new utterance is audible.
    expect(h.levels).toEqual(["word"]);
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Zero one.");
    // onstart emits the whole chunk — a BACKWARD spoken start accepted,
    // because seekTo reset the monotonic floor.
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 0, end: 9 });
    expect(h.progress[h.progress.length - 1]).toBe(0);
  });

  it("jumps FORWARD too; pre-seek events are stale (generation guard)", () => {
    const h = makeEngine();
    playWordCapable(h); // chunk 0 live
    const spokenCount = h.spokenRanges.length;
    const progressCount = h.progress.length;
    h.engine.seekTo(20); // straight to chunk 2
    // Stragglers from the pre-seek utterance must report nothing.
    h.adapter.spoken[1]!.events.onboundary?.({ name: "word", charIndex: 5, charLength: 3 });
    expect(h.spokenRanges).toHaveLength(spokenCount);
    expect(h.progress).toHaveLength(progressCount);
    vi.advanceTimersByTime(60);
    h.adapter.last!.events.onstart?.();
    expect(h.adapter.last!.request.text).toBe("Six seven.");
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 20, end: 30 });
  });

  it("an offset at/past the end restarts from the top", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.seekTo(999);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Zero one.");
  });

  it("is playing-only: a paused or stopped session ignores it", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    const spokenCount = h.adapter.spoken.length;
    h.engine.seekTo(20);
    vi.advanceTimersByTime(60 + 5000);
    expect(h.adapter.spoken).toHaveLength(spokenCount); // nothing new queued
    expect(h.engine.getState()).toBe("paused");

    h.engine.stop();
    h.engine.seekTo(0);
    vi.advanceTimersByTime(60 + 5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.adapter.spoken).toHaveLength(spokenCount);
  });
});

describe("mapBoundaryRangeToCanonical — pure mapping truth table", () => {
  it("maps both edges through the UTF-16 → grapheme map (astral-safe)", () => {
    // "𐐀𐐀 x" — 2 astral clusters (2 UTF-16 units each) + " x". The map
    // (length text.length + 1): utf16 0→0, 1→0 (mid-astral), 2→1, 3→1,
    // 4→2, 5→3, 6→4 (past-the-end). Word "x" at charIndex 5, charLength 1
    // → graphemes [3, 4) → canonical [103, 104).
    const c: SpeechChunk = {
      text: "\u{10300}\u{10300} x",
      startGrapheme: 100,
      endGrapheme: 104,
      utf16ToGrapheme: [0, 0, 1, 1, 2, 3, 4],
    };
    const range = mapBoundaryRangeToCanonical(c, { name: "word", charIndex: 5, charLength: 1 });
    expect(range).toEqual({ start: 103, end: 104 });
  });

  it("returns null when the start itself is unmappable (negative charIndex)", () => {
    const h = makeChunks();
    expect(mapBoundaryRangeToCanonical(h[0]!, { charIndex: -1 })).toBeNull();
  });
});

// ─── 5. honest refusals ──────────────────────────────────────────────────────

describe("refusals — stall watchdog + error loop cap", () => {
  it("a silently-dropped utterance (no events) fails honestly, never fake-playing", () => {
    const h = makeEngine();
    h.engine.play(0);
    // Probe resolves via timeout; playback utterance is dropped silently.
    vi.advanceTimersByTime(2000 + 60 + 3000); // probe + settle + stall
    expect(h.errors).toEqual(["Speech didn't start. Press Play to try again."]);
    expect(h.engine.getState()).toBe("stopped");
  });

  it("three consecutive failed utterances stop the session (no infinite loop)", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    // Every playback utterance errors before speaking.
    h.adapter.last!.events.onerror?.();
    h.adapter.last!.events.onerror?.();
    h.adapter.last!.events.onerror?.();
    expect(h.errors).toEqual(["Read aloud couldn't keep playing."]);
    expect(h.engine.getState()).toBe("stopped");
    // Fewer than three consecutive errors keep going.
    expect(h.adapter.spoken).toHaveLength(2 + 2); // probe + first + 2 retries
  });

  it("an isolated error is skipped, not fatal", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    h.adapter.last!.events.onerror?.(); // chunk 0 fails
    expect(h.engine.getState()).toBe("playing");
    expect(h.adapter.last!.request.text).toBe("Three four."); // chunk 1 next
    h.adapter.last!.events.onend?.(); // chunk 1 speaks fine
    expect(h.finished).toBe(0);
    expect(h.adapter.last!.request.text).toBe("Six seven.");
  });
});
