// tests/unit/pagination/lineBoxesBinarySearch.test.ts
// Equivalence + probe-cost proofs for the 260820-beo binary-search line walk.
// The OLD per-character linear walk is replicated test-locally as an ORACLE
// (round-1 replica-oracle discipline — pre-change semantics are the source of
// truth), and the shipped readLineBoxes must deep-equal it on every schedule:
//
//   - call-count bound: a 200-char / 4-break schedule must complete with
//     ≤ lines × ceil(log2(len)) + lines + 2 Range.getClientRects probes (the
//     pre-260820-beo per-character walk does len+1 = 201 and FAILS this).
//   - equivalence: single line; multi-line ASCII; a rounded-top PLATEAU
//     (adjacent tops 20.2 / 20.4 round to the same integer — merged-line
//     detection must match the oracle); multi-text-node container (blockquote
//     with two child <p>, exercising the globalBase accumulator); a schedule
//     yielding no rects (both return []); surrogate-pair text with line
//     boundaries inside multi-code-unit clusters.
//   - contract lock: line 1 charOffset always 0; later charOffsets equal the
//     schedule's break offsets; topPx/bottomPx are the boundary probe's own
//     last-rect fractional values.
//   - aborts: mid-walk (controller aborted from inside the Nth
//     getClientRects call → AbortError) and pre-aborted signal.
//
// Mock discipline mirrors tests/unit/pagination/lineBoxMapping.test.ts
// (document.createRange swap + try/finally restore) but is RICHER: schedules
// carry per-line start offsets AND per-line tops/heights (so plateau rounding
// is expressible), are node-aware (per-text-node schedules keyed on .data),
// count getClientRects invocations, and expose an onProbe hook for the abort
// test. jsdom is NOT authoritative for layout (Pitfall 2) — the real-browser
// proof stays in tests/e2e/**.
import { describe, expect, it } from "vitest";
import {
  blockNormalizedText,
  readLineBoxes,
} from "../../../src/pagination/lineBoxes";
import { AbortError } from "../../../src/measurement/fontGate";
import type { LineBox } from "../../../src/pagination/types";

// ── Richer range-schedule mock ──────────────────────────────────────────────

/** One simulated CSS line: covers [start, nextLine.start) at `top`/`height`. */
export interface LineSpec {
  /** UTF-16 local offset where this line begins (line 1 is always 0). */
  start: number;
  /** Fractional top of this line's DOMRect (plateau schedules use e.g. 20.2). */
  top: number;
  /** Height of this line's DOMRect (bottom = top + height, fractional). */
  height: number;
}

export interface ProbeOptions {
  /**
   * Called on EVERY getClientRects invocation with the 1-based invocation
   * count and the probed end offset. The mid-walk abort test aborts the
   * controller from inside the Nth call.
   */
  onProbe?: (count: number, end: number) => void;
}

export interface MockHandle {
  /** Re-install the real document.createRange. */
  restore: () => void;
  /** Number of getClientRects invocations since install. */
  probeCount: () => number;
}

/**
 * Install a node-aware Range mock over `perNode` (keyed on the text node's
 * .data). For a range [0, end) on a node, returns one DOMRect per line the
 * range covers — each at that line's own fractional top/height, so the last
 * rect's top is the line the range ENDS on (the exact quantity the linear
 * and binary walks compare). The last line extends to the node's data.length.
 */
function installScheduleMock(
  perNode: Map<string, LineSpec[]>,
  options: ProbeOptions = {},
): MockHandle {
  const realCreateRange = document.createRange.bind(document);
  let probes = 0;
  const state = {
    node: null as Text | null,
    start: 0,
    end: 0,
  };
  const stub: Range = {
    setStart: (node: Node, offset: number) => {
      state.node = node as Text;
      state.start = offset;
    },
    setEnd: (_node: Node, offset: number) => {
      state.end = offset;
    },
    getClientRects: (() => {
      if (options.onProbe) options.onProbe(probes + 1, state.end);
      probes += 1;
      if (!state.node) return [] as unknown as DOMRectList;
      const lines = perNode.get(state.node.data);
      if (!lines) return [] as unknown as DOMRectList;
      const rects: DOMRect[] = [];
      const dataLen = state.node.data.length;
      for (let li = 0; li < lines.length; li++) {
        const lineStart = lines[li]!.start;
        const lineEnd =
          li + 1 < lines.length ? lines[li + 1]!.start : dataLen;
        // Range [start, end) overlaps this line iff end > lineStart AND
        // start < lineEnd AND the range is non-empty (end > start).
        if (
          state.end > lineStart &&
          state.start < lineEnd &&
          state.end > state.start
        ) {
          rects.push(
            new DOMRect(0, lines[li]!.top, 100, lines[li]!.height) as DOMRect,
          );
        }
      }
      return rects as unknown as DOMRectList;
    }) as Range["getClientRects"],
  } as unknown as Range;
  document.createRange = () => stub;
  return {
    restore: () => {
      document.createRange = realCreateRange;
    },
    probeCount: () => probes,
  };
}

// ── The ORACLE: verbatim replica of the pre-260820-beo linear walk ─────────

/**
 * ORACLE — replica of the pre-260820-beo implementation of readLineBoxes
 * (round-1 replica-oracle discipline: the old per-character prefix scan is
 * the source of truth the binary-search walk must reproduce byte-identically).
 * Copied VERBATIM from src/pagination/lineBoxes.ts @ 8aca20f — do NOT
 * "modernize"; any divergence from the shipped old walk voids the oracle.
 */
function linearOracleReadLineBoxes(
  el: HTMLElement,
  fullText: string,
  signal: AbortSignal,
): LineBox[] {
  if (signal.aborted) throw new AbortError();
  if (fullText.length === 0) return [];

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    textNodes.push(current as Text);
  }
  if (textNodes.length === 0) return [];

  const range = document.createRange();
  const boxes: LineBox[] = [];
  let lastTop = Number.NaN;
  let globalBase = 0;

  for (const textNode of textNodes) {
    const localLen = textNode.data.length;
    for (let i = 0; i <= localLen; i++) {
      if ((globalBase + i) > 0 && signal.aborted) throw new AbortError();
      range.setStart(textNode, 0);
      range.setEnd(textNode, i);
      const rects = range.getClientRects();
      if (rects.length === 0) continue;
      const lastRect = rects[rects.length - 1]!;
      const top = lastRect.top;
      if (Number.isNaN(lastTop) || Math.round(top) !== Math.round(lastTop)) {
        const isFirst = boxes.length === 0;
        const charOffset = isFirst ? 0 : globalBase + i - 1;
        boxes.push({ charOffset, topPx: top, bottomPx: lastRect.bottom });
        lastTop = top;
      }
    }
    globalBase += localLen;
  }
  return boxes;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Fresh <p> carrying a single text node — the shape BlockRenderer emits. */
function makeParagraphEl(text: string): HTMLParagraphElement {
  const el = document.createElement("p");
  el.textContent = text;
  return el;
}

/** Blockquote with two child <p> — two descendant text nodes in doc order. */
function makeBlockquoteEl(first: string, second: string): HTMLElement {
  const bq = document.createElement("blockquote");
  const p1 = document.createElement("p");
  p1.textContent = first;
  const p2 = document.createElement("p");
  p2.textContent = second;
  bq.appendChild(p1);
  bq.appendChild(p2);
  return bq;
}

/** Simple integer-top schedule helper: line i at start=offsets[i], top=i*20. */
function intSchedule(offsets: number[], lineHeight = 18): LineSpec[] {
  return offsets.map((start, i) => ({
    start,
    top: i * 20,
    height: lineHeight,
  }));
}

/**
 * Run oracle + shipped implementation against the SAME installed schedule
 * (probes are pure functions of (node, end), so one install serves both) and
 * assert deep equality of the full LineBox[] (charOffset, topPx, bottomPx).
 */
function expectEquivalent(
  el: HTMLElement,
  fullText: string,
  perNode: Map<string, LineSpec[]>,
): { oracle: LineBox[]; actual: LineBox[] } {
  const mock = installScheduleMock(perNode);
  try {
    const signal = new AbortController().signal;
    const oracle = linearOracleReadLineBoxes(el, fullText, signal);
    const actual = readLineBoxes(el, fullText, signal);
    expect(actual).toEqual(oracle);
    return { oracle, actual };
  } finally {
    mock.restore();
  }
}

// ── Probe-cost bound (RED driver — the linear walk does len+1 and fails) ────

describe("readLineBoxes — O(lines × log L) probe bound", () => {
  it("200-char / 4-break schedule completes within lines × ceil(log2(len)) + lines + 2 probes", () => {
    const text = "x".repeat(200);
    const lines = intSchedule([0, 40, 80, 120, 160]); // 5 lines, 4 breaks
    const mock = installScheduleMock(new Map([[text, lines]]));
    try {
      const boxes = readLineBoxes(
        makeParagraphEl(text),
        text,
        new AbortController().signal,
      );
      expect(boxes).toHaveLength(5);
      // The bound: 5 × ceil(log2(200)) + 5 + 2 = 5×8+7 = 47. The old
      // per-character walk performs 201 probes and fails this assertion.
      const bound = lines.length * Math.ceil(Math.log2(text.length)) + lines.length + 2;
      expect(mock.probeCount()).toBeGreaterThan(0);
      expect(mock.probeCount()).toBeLessThanOrEqual(bound);
    } finally {
      mock.restore();
    }
  });
});

// ── Byte-identical equivalence vs the linear oracle ─────────────────────────

describe("readLineBoxes — binary-search walk equals the linear oracle", () => {
  it("single line", () => {
    const text = "short";
    const { actual } = expectEquivalent(
      makeParagraphEl(text),
      text,
      new Map([[text, [{ start: 0, top: 0.5, height: 18.25 }]]]),
    );
    expect(actual).toEqual([
      { charOffset: 0, topPx: 0.5, bottomPx: 18.75 },
    ]);
  });

  it("multi-line ASCII (breaks at 0/7/14)", () => {
    const text = "aaaaaa bbbbbb ccccc";
    const { actual } = expectEquivalent(
      makeParagraphEl(text),
      text,
      new Map([[text, intSchedule([0, 7, 14])]]),
    );
    expect(actual.map((b) => b.charOffset)).toEqual([0, 7, 14]);
    expect(actual.map((b) => b.topPx)).toEqual([0, 20, 40]);
  });

  it("rounded-top PLATEAU: adjacent tops 20.2/20.4 merge identically to the oracle", () => {
    // Lines 2 and 3 round to the same integer top (20) — the walk must merge
    // them (no box at offset 14) and emit the line-4 box from the probe's own
    // last rect at the fractional 40.1, exactly like the linear scan.
    const text = "aaaaaa bbbbbbb ccccccc ddddddd"; // 28 chars, 7-char segments
    const schedule: LineSpec[] = [
      { start: 0, top: 0, height: 18 },
      { start: 7, top: 20.2, height: 17.9 },
      { start: 14, top: 20.4, height: 17.8 },
      { start: 21, top: 40.1, height: 18 },
    ];
    const { actual } = expectEquivalent(
      makeParagraphEl(text),
      text,
      new Map([[text, schedule]]),
    );
    // Line 2's box is emitted (20 ≠ 0); line 3 rounds equal (20 === 20) →
    // merged (no box at 14); line 4 emitted at fractional top.
    expect(actual.map((b) => b.charOffset)).toEqual([0, 7, 21]);
    expect(actual.map((b) => b.topPx)).toEqual([0, 20.2, 40.1]);
  });

  it("multi-text-node container (blockquote with two child <p>) — globalBase accumulator", () => {
    const first = "aaaa bbb"; // 8 chars — lines at local 0, 5 (tops 0, 20)
    const second = "cccc dddd"; // 9 chars — lines at local 0, 5 (tops 40, 60)
    const el = makeBlockquoteEl(first, second);
    const fullText = blockNormalizedText(el); // "aaaa bbbcccc dddd"
    const { actual } = expectEquivalent(el, fullText, new Map([
      [first, intSchedule([0, 5])],
      [second, [
        { start: 0, top: 40, height: 18 },
        { start: 5, top: 60, height: 18 },
      ]]],
    ));
    // GLOBAL offsets across text nodes: 0, 5 (node 1), 8 (node 2 start), 13.
    expect(actual.map((b) => b.charOffset)).toEqual([0, 5, 8, 13]);
    expect(actual.map((b) => b.topPx)).toEqual([0, 20, 40, 60]);
  });

  it("schedule yielding no rects at all → both return []", () => {
    const text = "ignored";
    const { actual } = expectEquivalent(
      makeParagraphEl(text),
      text,
      new Map([[text, []]]),
    );
    expect(actual).toEqual([]);
  });

  it("surrogate pairs: line boundaries inside multi-code-unit clusters", () => {
    // "a😀b😀c" — 😀 occupies UTF-16 offsets (1,2) and (4,5). Line 2 starts
    // at offset 2 (INSIDE the first emoji's low surrogate), line 3 at offset
    // 5 (inside the second's). Boundary probes and charOffsets must match
    // the oracle exactly — no grapheme-aware special-casing exists in either
    // walk (charOffsetToGrapheme handles the mapping downstream).
    const text = "a😀b😀c";
    const { actual } = expectEquivalent(
      makeParagraphEl(text),
      text,
      new Map([[text, intSchedule([0, 2, 5])]]),
    );
    expect(actual.map((b) => b.charOffset)).toEqual([0, 2, 5]);
  });
});

// ── Existing-contract lock (semantics the current suite pins) ───────────────

describe("readLineBoxes — contract lock under the binary-search walk", () => {
  it("line 1 charOffset is always 0; later offsets equal the schedule breaks; topPx/bottomPx are fractional from the boundary probe's last rect", () => {
    const text = "one two three four five"; // 23 chars
    const schedule: LineSpec[] = [
      { start: 0, top: 0.05, height: 18.1 },
      { start: 8, top: 20.15, height: 18.2 },
      { start: 16, top: 40.25, height: 18.3 },
    ];
    const mock = installScheduleMock(new Map([[text, schedule]]));
    try {
      const boxes = readLineBoxes(
        makeParagraphEl(text),
        text,
        new AbortController().signal,
      );
      expect(boxes).toHaveLength(3);
      expect(boxes[0]!.charOffset).toBe(0);
      expect(boxes[1]!.charOffset).toBe(8);
      expect(boxes[2]!.charOffset).toBe(16);
      // Each box carries its OWN line's rect (the boundary probe [0, start+1)
      // ends on that line, so its last rect is that line's rect).
      expect(boxes[0]!.topPx).toBe(0.05);
      expect(boxes[0]!.bottomPx).toBeCloseTo(0.05 + 18.1, 10);
      expect(boxes[1]!.topPx).toBe(20.15);
      expect(boxes[1]!.bottomPx).toBeCloseTo(20.15 + 18.2, 10);
      expect(boxes[2]!.topPx).toBe(40.25);
      expect(boxes[2]!.bottomPx).toBeCloseTo(40.25 + 18.3, 10);
    } finally {
      mock.restore();
    }
  });
});

// ── Abort semantics ─────────────────────────────────────────────────────────

describe("readLineBoxes — abort semantics preserved", () => {
  it("aborting the controller from inside the 3rd getClientRects call throws AbortError mid-walk", () => {
    const text = "y".repeat(120);
    const lines = intSchedule([0, 30, 60, 90]); // ≥ 4 probes guaranteed
    const controller = new AbortController();
    const mock = installScheduleMock(new Map([[text, lines]]), {
      onProbe: (count) => {
        if (count === 3) controller.abort();
      },
    });
    try {
      expect(() =>
        readLineBoxes(makeParagraphEl(text), text, controller.signal),
      ).toThrowError(/abort/i);
    } finally {
      mock.restore();
    }
  });

  it("pre-aborted signal throws AbortError immediately", () => {
    const text = "some text";
    const mock = installScheduleMock(
      new Map([[text, intSchedule([0])]]),
    );
    try {
      const controller = new AbortController();
      controller.abort();
      expect(() =>
        readLineBoxes(makeParagraphEl(text), text, controller.signal),
      ).toThrowError(/abort/i);
    } finally {
      mock.restore();
    }
  });
});
