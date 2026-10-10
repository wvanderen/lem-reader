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
//   6. The failed state (issue #167): a detected failure lands "failed"
//      (not stopped), carries its kind (start vs playback) and the
//      platform's error reason, and plays like a fresh start (retry) from
//      the offset the host hands in — while skips/seeks/retune stay inert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapBoundaryRangeToCanonical,
  PLAYBACK_FAILURE_MESSAGE,
  ReadAloudEngine,
  START_FAILURE_MESSAGE,
} from "../../../src/readaloud/engine";
import type { SkipUnits, SpeechChunk } from "../../../src/readaloud/chunks";
import type {
  SpeechAdapter,
  SpeakRequest,
  SpeechFailure,
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
// The skip units default to 0/0 — the skip tests below build chunk sets with
// explicit units.
function chunk(
  text: string,
  startGrapheme: number,
  units: SkipUnits = {
    sentenceIndex: 0,
    paragraphIndex: 0,
  },
): SpeechChunk {
  const width = text.length; // 1 unit per cluster
  return {
    text,
    startGrapheme,
    endGrapheme: startGrapheme + width,
    utf16ToGrapheme: Array.from({ length: width + 1 }, (_, i) => Math.min(i, width)),
    units,
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
  /** Issue #167 — the failure reports (message + kind + platform reason). */
  failures: SpeechFailure[];
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
    failures: [],
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
      onFinish: () => (h.finished += 1),
      onError: (failure) => {
        h.errors.push(failure.message);
        h.failures.push(failure);
      },
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
    // Issue #167 — THE WEDGE REGRESSION PIN: the dead (or any) probe is
    // never cancelled — Firefox wedges its synthesizer permanently when a
    // cancel lands on an actively-synthesizing utterance. The first chunk
    // queues BEHIND the probe instead.
    expect(h.adapter.cancelled).toBe(0);
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

  it("a target beyond the final speakable passage finishes instead of wrapping", () => {
    const h = makeEngine();
    playWordCapable(h);
    const count = h.adapter.spoken.length;
    h.engine.seekTo(30); // visible trailing text may follow this speech end
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.finished).toBe(1);
    expect(h.adapter.spoken).toHaveLength(count);
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

// ─── 7b. seekWhilePaused — the paused seek (issue #166) ─────────────────────

describe("seekWhilePaused — the paused seek preserves the paused state (issue #166)", () => {
  it("queues nothing while paused; progress + marker report the target right away", () => {
    const h = makeEngine();
    playWordCapable(h); // chunk 0 live
    h.adapter.last!.events.onend?.(); // chunk 1 live
    h.engine.pause();
    const spokenCount = h.adapter.spoken.length;
    const rangesBefore = h.spokenRanges.length;

    h.engine.seekWhilePaused(21); // into chunk 2 [20,30)
    vi.advanceTimersByTime(5000); // well past any settle — nothing may fire
    expect(h.adapter.spoken).toHaveLength(spokenCount); // no speech started
    expect(h.engine.getState()).toBe("paused"); // paused preserved
    // The canonical save + the marker followed the seek WITHOUT playback.
    expect(h.progress[h.progress.length - 1]).toBe(20); // chunk 2's start
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 20, end: 30 });
    expect(h.spokenRanges.length).toBe(rangesBefore + 1);
  });

  it("resume lands on the SEEK TARGET (the held utterance is replaced, not finished)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.seekWhilePaused(12); // into chunk 1 [9,20)
    h.engine.resume();
    vi.advanceTimersByTime(60);
    // Plain adapter.resume never ran — the held utterance was replaced.
    expect(h.adapter.resumed).toBe(0);
    expect(h.engine.getState()).toBe("playing");
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Three four."); // the target chunk
  });

  it("a target beyond the final speakable passage finishes while paused", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    const count = h.adapter.spoken.length;
    h.engine.seekWhilePaused(30);
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.finished).toBe(1);
    expect(h.adapter.spoken).toHaveLength(count);
  });

  it("late events from the held utterance cannot overwrite a backward paused seek", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 1 held at pause
    const held = h.adapter.last!.events;
    h.engine.pause();
    h.engine.seekWhilePaused(0);
    const progress = [...h.progress];
    const ranges = [...h.spokenRanges];
    held.onstart?.();
    held.onboundary?.({ name: "word", charIndex: 6 });
    held.onend?.();
    held.onerror?.();
    vi.advanceTimersByTime(5000);
    expect(h.progress).toEqual(progress);
    expect(h.spokenRanges).toEqual(ranges);
    expect(h.engine.getState()).toBe("paused");
    h.engine.resume();
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Zero one.");
  });

  it("playing and stopped sessions ignore it", () => {
    const h = makeEngine();
    playWordCapable(h);
    const spokenCount = h.adapter.spoken.length;
    h.engine.seekWhilePaused(20); // playing — seekTo's job
    vi.advanceTimersByTime(60 + 5000);
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    h.engine.stop();
    h.engine.seekWhilePaused(0);
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.adapter.spoken).toHaveLength(spokenCount);
  });

  it("a paused seek then a paused retune: resume lands on the target under the new settings", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.seekWhilePaused(21); // target: chunk 2
    h.engine.retune({ voiceURI: "other-voice", rate: 1.5 }); // also while paused
    h.engine.resume();
    vi.advanceTimersByTime(60);
    // The voice change is unprobed for the new voice — the re-probe runs
    // first, then playback lands on the SEEK TARGET (not the held chunk).
    expect(h.adapter.last!.request.volume).toBe(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request).toMatchObject({
      text: "Six seven.",
      voiceURI: "other-voice",
      rate: 1.5,
      volume: 1,
    });
  });
});

// ─── 7c. seekToEnd — finish without wrapping (issue #166) ───────────────────

describe("seekToEnd — the session finishes through the ONE completion seam", () => {
  it("while playing: cancels, reports the end, finishes, and never re-speaks", () => {
    const h = makeEngine();
    playWordCapable(h); // chunk 0 live
    h.engine.seekToEnd();
    expect(h.engine.getState()).toBe("stopped");
    expect(h.finished).toBe(1);
    expect(h.progress[h.progress.length - 1]).toBe(30); // the article end
    const spokenCount = h.adapter.spoken.length;
    vi.advanceTimersByTime(5000);
    // Stale events from the cancelled session cannot wrap to the top.
    h.adapter.last!.events.onend?.();
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    expect(h.finished).toBe(1);
  });

  it("while paused: finishing also holds (the reader asked for the end)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.seekToEnd();
    expect(h.engine.getState()).toBe("stopped");
    expect(h.finished).toBe(1);
    // Resume after the finish is a no-op (the session is over).
    h.engine.resume();
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
  });

  it("a stopped session ignores it", () => {
    const h = makeEngine();
    h.engine.seekToEnd();
    expect(h.finished).toBe(0);
    expect(h.engine.getState()).toBe("stopped");
  });

  it("a pending paused seek is discarded by seekToEnd", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.seekWhilePaused(21);
    h.engine.seekToEnd();
    h.engine.resume(); // must not resurrect the seek target
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.finished).toBe(1);
  });
});

// ─── 7d. previous/next passage (issue #166) ──────────────────────────────────

describe("skipPassageBack/Forward — the utterance-sized step (issue #166)", () => {
  it("next passage moves exactly ONE chunk, even mid-sentence (unlike the sentence skip)", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.seekTo(12); // mid "Gamma" — piece 1 of the over-budget sentence 2
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Gam-1");
    expect(h.engine.skipPassageForward()).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Gam-2"); // one chunk, same sentence
  });

  it("previous passage moves one chunk back and the marker hops with it", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.skipPassageForward(); // → Beta
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Beta");
    expect(h.engine.skipPassageBack()).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Alpha");
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 0, end: 5 });
  });

  it("a step at either session boundary moves nothing and reports false", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h); // first chunk
    expect(h.engine.skipPassageBack()).toBe(false);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Alpha"); // nothing queued
    h.engine.seekTo(20); // last chunk
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Delta");
    h.adapter.last!.events.onstart?.(); // keep the stall watchdog quiet
    expect(h.engine.skipPassageForward()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(h.adapter.last!.request.text).toBe("Delta");
    expect(h.engine.getState()).toBe("playing");
  });

  it("while PAUSED the step resumes the session and jumps (the shared skip composition)", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.pause();
    expect(h.engine.skipPassageForward()).toBe(true);
    expect(h.engine.getState()).toBe("playing");
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Beta");
  });

  it("a stopped session ignores passage steps", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.stop();
    expect(h.engine.skipPassageBack()).toBe(false);
    expect(h.engine.skipPassageForward()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("stopped");
  });
});

// ─── 8. retune — live voice/rate changes (issue #165) ────────────────────────
describe("retune — rate change on the PLAYING session", () => {
  it("re-queues the CURRENT passage under the new rate (no re-probe, no restart from top)", () => {
    const h = makeEngine();
    playWordCapable(h); // chunk 0 live
    h.adapter.last!.events.onend?.(); // advance to chunk 1
    expect(h.adapter.last!.request.text).toBe("Three four.");

    h.engine.retune({ voiceURI: "test-voice", rate: 1.5 });
    vi.advanceTimersByTime(60); // the post-cancel settle
    // No re-probe: no new volume-0 utterance, the follow level survives.
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(1);
    expect(h.levels).toEqual(["word"]);
    // The CURRENT chunk (not the article top) re-queues at the new rate.
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Three four.");
    expect(h.adapter.last!.request.rate).toBe(1.5);
    expect(h.adapter.last!.request.voiceURI).toBe("test-voice");
    // The floors reset: the re-queued utterance's start re-emits the marker.
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 9, end: 20 });
  });

  it("is a no-op when nothing changed", () => {
    const h = makeEngine();
    playWordCapable(h);
    const spokenCount = h.adapter.spoken.length;
    const cancelled = h.adapter.cancelled;
    h.engine.retune({ voiceURI: "test-voice", rate: 1 });
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    expect(h.adapter.cancelled).toBe(cancelled);
  });

  it("a stopped session ignores it (the host rebuilds with fresh settings on play)", () => {
    const h = makeEngine();
    const spokenCount = h.adapter.spoken.length;
    h.engine.retune({ voiceURI: null, rate: 2 });
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    // The engine keeps its constructor values — applying them is the HOST's
    // job (a fresh engine per Play press reads the settings store).
    h.engine.play(0);
    expect(h.adapter.last!.request.rate).toBe(1);
    expect(h.adapter.last!.request.voiceURI).toBe("test-voice");
  });
});

describe("retune — voice change on the PLAYING session (re-probe)", () => {
  it("re-probes the new voice, then continues the CURRENT passage under it", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 1 live

    h.engine.retune({ voiceURI: "other-voice", rate: 1 });
    vi.advanceTimersByTime(60); // the settle BEFORE the probe (WebKit race)
    // A fresh silent probe carries the NEW voice + rate...
    expect(h.adapter.last!.request.volume).toBe(0);
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    expect(h.levels).toEqual(["word", "word"]); // the level re-resolves
    vi.advanceTimersByTime(60);
    // ...and playback continues from the CURRENT chunk with the new voice.
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Three four.");
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
  });

  it("a rate-only retune never re-probes; a voice+rate retune probes once", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.retune({ voiceURI: "test-voice", rate: 2 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(1);

    h.engine.retune({ voiceURI: "next-voice", rate: 2.5 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(2);
  });
});

describe("retune handoff races", () => {
  it.each(["during probe", "after probe"])(
    "resume requeues the current passage when paused %s",
    (phase) => {
      const h = makeEngine();
      playWordCapable(h);
      h.adapter.last!.events.onend?.();
      h.engine.retune({ voiceURI: "other-voice", rate: 1.5 });
      vi.advanceTimersByTime(60);
      const probe = h.adapter.last!;
      if (phase === "after probe") probe.events.onend?.();
      h.engine.pause();
      const count = h.adapter.spoken.length;
      vi.advanceTimersByTime(5000);
      probe.events.onend?.();
      expect(h.adapter.spoken).toHaveLength(count);
      expect(h.engine.getState()).toBe("paused");
      h.engine.resume();
      vi.advanceTimersByTime(60);
      if (h.adapter.last!.request.volume === 0) {
        h.adapter.last!.events.onend?.();
        vi.advanceTimersByTime(60);
      }
      expect(h.adapter.last!.request).toMatchObject({
        text: "Three four.",
        voiceURI: "other-voice",
        rate: 1.5,
        volume: 1,
      });
      // Issue #167 — the pause froze the queue and NEVER cancelled it (the
      // Firefox wedge): resume physically un-pauses the synthesizer.
      expect(h.adapter.resumed).toBe(1);
    },
  );

  it("a skip supersedes a voice retune and probes only the current generation", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.retune({ voiceURI: "other-voice", rate: 1 });
    h.engine.skipSentences(1);
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(2);
    h.adapter.last!.events.onend?.();
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request).toMatchObject({
      text: "Beta",
      voiceURI: "other-voice",
      volume: 1,
    });
  });
});

describe("retune — PAUSED changes preserve the paused state (issue #165)", () => {
  it("queues nothing while paused; resume applies at the current passage", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.adapter.last!.events.onend?.(); // chunk 1 live
    h.engine.pause();
    const spokenCount = h.adapter.spoken.length;

    h.engine.retune({ voiceURI: "test-voice", rate: 1.5 });
    vi.advanceTimersByTime(5000); // well past any settle — nothing fires
    expect(h.adapter.spoken).toHaveLength(spokenCount); // no speech started
    expect(h.engine.getState()).toBe("paused"); // paused preserved

    h.engine.resume();
    vi.advanceTimersByTime(60);
    // The CURRENT chunk re-queues under the new rate (plain adapter.resume
    // never ran — the held utterance is replaced, not continued).
    expect(h.adapter.resumed).toBe(0);
    expect(h.adapter.last!.request.text).toBe("Three four.");
    expect(h.adapter.last!.request.rate).toBe(1.5);
    expect(h.engine.getState()).toBe("playing");
  });

  it("a paused voice change re-probes on resume and lands the new voice", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.retune({ voiceURI: "other-voice", rate: 1 });
    vi.advanceTimersByTime(5000);
    expect(h.engine.getState()).toBe("paused");

    h.engine.resume(); // play-from-paused rides the same path
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.volume).toBe(0); // the re-probe
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Zero one."); // still chunk 0
  });

  it("a pause caught mid-retune-settle defers cleanly — resume still lands the retune", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.retune({ voiceURI: "test-voice", rate: 1.5 }); // settle armed
    h.engine.pause(); // inside the 60ms settle window
    vi.advanceTimersByTime(60 + 5000); // the armed timer must NOT fire
    expect(h.adapter.spoken.filter((s) => s.request.volume === 1)).toHaveLength(1);
    expect(h.engine.getState()).toBe("paused");

    h.engine.resume();
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Zero one."); // current chunk
    expect(h.adapter.last!.request.rate).toBe(1.5);
  });

  it("a pause caught mid-retune-settle after a VOICE change still re-probes on resume", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.retune({ voiceURI: "other-voice", rate: 1 }); // settle armed, reprobe due
    h.engine.pause(); // inside the 60ms settle window
    vi.advanceTimersByTime(60 + 5000);
    expect(h.engine.getState()).toBe("paused");
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(1); // no probe yet

    h.engine.resume();
    vi.advanceTimersByTime(60);
    // The deferred re-probe fired — the follow level must match the voice
    // that is about to speak (the review finding: a stale reprobe flag must
    // not skip it).
    expect(h.adapter.last!.request.volume).toBe(0);
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Zero one."); // current chunk
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
  });

  it("a voice change stays unprobed across a following rate-only retune (the flag accumulates)", () => {
    const h = makeEngine();
    playWordCapable(h); // paused path
    h.engine.pause();
    h.engine.retune({ voiceURI: "other-voice", rate: 1 }); // unprobed voice change
    h.engine.retune({ voiceURI: "other-voice", rate: 2 }); // rate-only follow-up
    h.engine.resume();
    vi.advanceTimersByTime(60);
    // The rate-only retune must NOT clear the pending voice re-probe.
    expect(h.adapter.last!.request.volume).toBe(0);
    expect(h.adapter.last!.request.voiceURI).toBe("other-voice");
    expect(h.adapter.last!.request.rate).toBe(2);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.rate).toBe(2);
  });

  it("stop discards a pending paused retune (nothing resumes)", () => {
    const h = makeEngine();
    playWordCapable(h);
    h.engine.pause();
    h.engine.retune({ voiceURI: "test-voice", rate: 1.5 });
    h.engine.stop();
    h.engine.resume(); // stopped → no-op
    vi.advanceTimersByTime(60 + 5000);
    expect(h.engine.getState()).toBe("stopped");
    expect(h.adapter.spoken.filter((s) => s.request.volume === 1)).toHaveLength(1);
  });
});

/** A 3-paragraph article: p0 has two sentences (each one chunk), p1 one
 * sentence split over budget into two pieces, p2 one sentence. Ranges are
 * ASCII (identity maps): p0s0 [0,5) "Alpha", p0s1 [5,10) "Beta", p1s0
 * pieces [10,15) "Gam-1" [15,20) "Gam-2", p2s0 [20,25) "Delta". */
function makeSkipChunks(): SpeechChunk[] {
  return [
    chunk("Alpha", 0, { sentenceIndex: 0, paragraphIndex: 0 }),
    chunk("Beta", 5, { sentenceIndex: 1, paragraphIndex: 0 }),
    chunk("Gam-1", 10, { sentenceIndex: 2, paragraphIndex: 1 }),
    chunk("Gam-2", 15, { sentenceIndex: 2, paragraphIndex: 1 }),
    chunk("Delta", 20, { sentenceIndex: 3, paragraphIndex: 2 }),
  ];
}

// ─── 9. skip controls (issue #43, O3) ────────────────────────────────────────

describe("skipSentences — skip sentence backward/forward (issue #43, O3)", () => {
  it("skip forward lands on the first chunk of the NEXT sentence, no re-probe", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h); // chunk 0 live ("Alpha", sentence 0)
    expect(h.engine.skipSentences(1)).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.levels).toEqual(["word"]); // the follow level survives
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.last!.request.text).toBe("Beta");
    // The monotonic floors reset — the onstart marker re-emits the target.
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 5, end: 9 });
  });

  it("skip backward lands on the PREVIOUS sentence (strict ±1)", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.skipSentences(1);
    vi.advanceTimersByTime(60);
    h.engine.skipSentences(-1);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Alpha");
  });

  it("skipping from a mid-sentence piece of an over-budget sentence jumps past the whole sentence", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.seekTo(12); // mid "Gamma" — piece 1 of sentence 2
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Gam-1");
    // Skip forward from sentence 2 → sentence 3, past the "Gam-2" piece.
    expect(h.engine.skipSentences(1)).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Delta");
  });

  it("a skip at the session boundary moves nothing and reports false", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    expect(h.engine.skipSentences(-1)).toBe(false); // before the first sentence
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Alpha"); // nothing queued
    // Jump to the last sentence; skip forward past it.
    h.engine.seekTo(20);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Delta");
    h.adapter.last!.events.onstart?.(); // keep the stall watchdog quiet
    expect(h.engine.skipSentences(1)).toBe(false); // past the last sentence
    vi.advanceTimersByTime(5000);
    expect(h.adapter.last!.request.text).toBe("Delta"); // nothing queued
    expect(h.engine.getState()).toBe("playing");
  });

  it("while PAUSED the skip resumes the session and jumps (resume-then-seek)", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.pause();
    expect(h.engine.getState()).toBe("paused");
    expect(h.engine.skipSentences(1)).toBe(true);
    expect(h.engine.getState()).toBe("playing");
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Beta");
  });

  it("a stopped session ignores skips", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.stop();
    const spokenCount = h.adapter.spoken.length;
    expect(h.engine.skipSentences(1)).toBe(false);
    expect(h.engine.skipParagraphForward()).toBe(false);
    vi.advanceTimersByTime(60 + 5000);
    expect(h.adapter.spoken).toHaveLength(spokenCount);
    expect(h.engine.getState()).toBe("stopped");
  });
});

describe("skipParagraphForward — skip paragraph forward (issue #43, O3)", () => {
  it("jumps to the first chunk of the NEXT paragraph unit, crossing sentence boundaries", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h); // paragraph 0, sentence 0
    expect(h.engine.skipParagraphForward()).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Gam-1"); // paragraph 1's first chunk
  });

  it("from a mid-sentence piece, the jump still lands on the next paragraph's first chunk", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.seekTo(12); // mid paragraph 1
    vi.advanceTimersByTime(60);
    expect(h.engine.skipParagraphForward()).toBe(true);
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Delta"); // paragraph 2
  });

  it("at the last paragraph the jump moves nothing and reports false", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.seekTo(20); // paragraph 2 — the last
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Delta");
    h.adapter.last!.events.onstart?.(); // keep the stall watchdog quiet
    expect(h.engine.skipParagraphForward()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(h.adapter.last!.request.text).toBe("Delta");
    expect(h.engine.getState()).toBe("playing");
  });

  it("rapid skips settle on the LAST target (the generation guard supersedes stale starts)", () => {
    const h = makeEngine(makeSkipChunks());
    playWordCapable(h);
    h.engine.skipSentences(1); // → Beta
    h.engine.skipParagraphForward(); // → Gam-1 (bumps generation again)
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Gam-1");
    h.adapter.last!.events.onstart?.();
    expect(h.spokenRanges[h.spokenRanges.length - 1]).toEqual({ start: 10, end: 15 });
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
      units: { sentenceIndex: 0, paragraphIndex: 0 },
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
    expect(h.errors).toEqual([START_FAILURE_MESSAGE]);
    // Issue #167 — the failure lands "failed" (the transport stays open
    // with Retry), kind "start" (no utterance ever began).
    expect(h.engine.getState()).toBe("failed");
    expect(h.failures[0]).toEqual({ message: START_FAILURE_MESSAGE, kind: "start" });
  });

  it("three consecutive failed utterances fail the session (no infinite loop)", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    // Every playback utterance errors before speaking — the third one ends
    // the session as a PLAYBACK failure carrying the platform's reason.
    h.adapter.last!.events.onerror?.("synthesis-failed");
    h.adapter.last!.events.onerror?.("synthesis-failed");
    h.adapter.last!.events.onerror?.("not-allowed");
    expect(h.errors).toEqual([PLAYBACK_FAILURE_MESSAGE]);
    expect(h.engine.getState()).toBe("failed");
    expect(h.failures[0]).toEqual({
      message: PLAYBACK_FAILURE_MESSAGE,
      kind: "playback",
      reason: "not-allowed",
    });
    // Fewer than three consecutive errors keep going.
    expect(h.adapter.spoken).toHaveLength(2 + 2); // probe + first + 2 retries
  });

  it("a silent stall AFTER working speech is a playback failure, never 'didn't start'", () => {
    // Issue #167 — the watchdog classifies honestly: chunk 1 speaks fine,
    // chunk 2 is silently dropped → "stopped partway" (kind "playback"),
    // because "Speech didn't start" would be a lie minutes into an article.
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    h.adapter.last!.events.onend?.(); // chunk 1 is heard
    expect(h.adapter.last!.request.text).toBe("Three four."); // chunk 2 queued
    vi.advanceTimersByTime(3000); // the first-event stall window, no events
    expect(h.engine.getState()).toBe("failed");
    expect(h.failures[0]).toEqual({ message: PLAYBACK_FAILURE_MESSAGE, kind: "playback" });
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

// ─── 5b. startup — the probe is never cancelled (issue #167 wedge fix) ──────

describe("startup probe — never cancel (issue #167)", () => {
  it("a word-capable startup produces ZERO cancels (the Firefox wedge regression pin)", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    // The chunk queued immediately behind the (still speaking) probe.
    expect(h.adapter.spoken).toHaveLength(2);
    expect(h.adapter.last!.request.volume).toBe(1);
    expect(h.adapter.cancelled).toBe(0);
    // The probe ends naturally; nothing else to cancel through playback.
    h.adapter.spoken[0]!.events.onend?.();
    h.adapter.last!.events.onend?.();
    expect(h.adapter.cancelled).toBe(0);
  });

  it("a retune during the probe retargets the queued chunk with NO cancel; the re-probe stays pending", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.engine.retune({ voiceURI: "other-voice", rate: 1.5 }); // mid-probe
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    expect(h.adapter.cancelled).toBe(0);
    // The queued chunk carries the NEW voice + rate.
    expect(h.adapter.last!.request).toMatchObject({
      text: "Zero one.",
      voiceURI: "other-voice",
      rate: 1.5,
      volume: 1,
    });
    // The resolved level describes the OLD voice — the re-probe must still
    // be pending: the next post-audible requeue re-probes (2nd silent probe).
    h.adapter.spoken[0]!.events.onend?.(); // probe ends
    h.adapter.last!.events.onend?.(); // chunk 1 speaks
    h.engine.seekTo(12); // chunk 2 — post-audible requeue
    vi.advanceTimersByTime(60);
    expect(h.adapter.spoken.filter((s) => s.request.volume === 0)).toHaveLength(2);
  });

  it("a seek during the probe retargets the queued chunk with NO cancel", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.engine.seekTo(12); // chunk containing 12 = "Three four."
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    expect(h.adapter.cancelled).toBe(0);
    expect(h.adapter.last!.request.text).toBe("Three four.");
  });

  it("pause during the probe freezes; the resolve parks; resume unpauses and queues", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.engine.pause(); // probe in flight — frozen, not cancelled
    expect(h.adapter.cancelled).toBe(0);
    vi.advanceTimersByTime(2000); // the timeout resolves while paused
    expect(h.engine.getState()).toBe("paused");
    expect(h.adapter.spoken).toHaveLength(1); // nothing queued into the freeze
    h.engine.resume();
    expect(h.adapter.resumed).toBe(1); // the frozen queue physically resumes
    expect(h.adapter.spoken).toHaveLength(2); // the chunk queues behind it
    expect(h.engine.getState()).toBe("playing");
  });

  it("pause after the chunk queued does not stall-fail while frozen; resume re-arms the watchdog", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.spoken[0]!.events.onboundary?.({ name: "word", charIndex: 0 }); // the PROBE resolves
    expect(h.engine.getState()).toBe("playing");
    expect(h.adapter.spoken).toHaveLength(2); // the chunk queues behind it
    h.engine.pause(); // chunk queued, not yet audible
    vi.advanceTimersByTime(60_000); // far past any stall — frozen never fails
    expect(h.engine.getState()).toBe("paused");
    h.engine.resume(); // re-arms the first-event watchdog
    vi.advanceTimersByTime(3000);
    expect(h.engine.getState()).toBe("failed"); // silent frozen queue: honest
    expect(h.failures[0]).toEqual({
      message: START_FAILURE_MESSAGE,
      kind: "start",
    });
  });
});

// ─── 6. the failed state (issue #167) ────────────────────────────────────────

describe("failed state — recoverable, honest, inert to transport (issue #167)", () => {
  function failAtStartup(h: Harness): void {
    h.engine.play(0);
    vi.advanceTimersByTime(2000 + 60 + 3000); // probe timeout + settle + stall
    expect(h.engine.getState()).toBe("failed");
  }

  it("play() after a failure is a fresh session from the given offset (retry)", () => {
    const h = makeEngine();
    failAtStartup(h);
    const sessionsBefore = h.adapter.spoken.length;
    // Retry from the middle of chunk 1 (the preserved listened position).
    h.engine.play(12);
    expect(h.engine.getState()).toBe("playing");
    // Fresh probe (silent) then the chunk CONTAINING the offset — never a
    // restart from the top, never a resume of the dead queue.
    expect(h.adapter.spoken).toHaveLength(sessionsBefore + 1);
    expect(h.adapter.last!.request.volume).toBe(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    expect(h.adapter.last!.request.text).toBe("Three four."); // [9,20) ∋ 12
    expect(h.adapter.last!.request.volume).toBe(1);
  });

  it("skips, seeks, seekToEnd and retune are inert while failed", () => {
    const h = makeEngine();
    failAtStartup(h);
    const spokenBefore = h.adapter.spoken.length;
    expect(h.engine.skipSentences(1)).toBe(false);
    expect(h.engine.skipParagraphForward()).toBe(false);
    expect(h.engine.skipPassageForward()).toBe(false);
    h.engine.seekTo(20);
    h.engine.seekToEnd();
    h.engine.retune({ voiceURI: null, rate: 2 });
    expect(h.engine.getState()).toBe("failed");
    expect(h.adapter.spoken).toHaveLength(spokenBefore); // nothing new queued
    expect(h.finished).toBe(0); // seekToEnd did not fake a finish
    expect(h.adapter.cancelled).toBeLessThan(3); // no extra cancel churn
  });

  it("stop() after a failure returns to the honest rest state", () => {
    const h = makeEngine();
    failAtStartup(h);
    h.engine.stop();
    expect(h.engine.getState()).toBe("stopped");
    expect(h.failures).toHaveLength(1); // the failure copy stands; stop adds none
  });

  it("a pause during a live session does not mask a later failure's kind", () => {
    const h = makeEngine();
    h.engine.play(0);
    h.adapter.last!.events.onboundary?.({ name: "word", charIndex: 0 });
    vi.advanceTimersByTime(60);
    // Chunk 1 speaks, then the reader pauses; the error loop cap still
    // reports "playback" (speech WAS underway) after resume.
    h.engine.pause();
    h.engine.resume();
    h.adapter.last!.events.onerror?.();
    h.adapter.last!.events.onerror?.();
    h.adapter.last!.events.onerror?.();
    expect(h.failures[0]?.kind).toBe("playback");
    expect(h.engine.getState()).toBe("failed");
  });
});
