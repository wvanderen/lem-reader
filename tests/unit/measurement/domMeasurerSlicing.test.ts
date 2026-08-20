// tests/unit/measurement/domMeasurerSlicing.test.ts
// Time-slicing behavior proofs for the 260820-beo async measureAllBlocks.
// The pass must yield to the main thread between ~10ms block slices
// (scheduler.yield when available, setTimeout(0) fallback) so a full
// measurement pass never blocks paint for seconds on long articles
// (symptom A: blank unpainted screens while scrolling during re-measure
// storms), while producing a byte-identical BlockMeasurement[] and
// preserving AbortError semantics at every yield point.
//
// jsdom provides NO globalThis.scheduler, so the spy tests stub it
// structurally on globalThis (the implementation reads it dynamically per
// call — exactly so this stub is effective); the fallback test removes the
// stub entirely. jsdom is NOT authoritative for layout (Pitfall 2) — the
// per-block geometry values are therefore built from the SAME DOM reads the
// implementation performs; what these tests pin is the slicing mechanics:
// yield placement, output completeness/order, abort-at-yield, fallback,
// and the default-budget ceiling.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLICE_BUDGET_MS,
  measureAllBlocks,
} from "../../../src/measurement/domMeasurer";
import type { BlockMeasurement } from "../../../src/measurement/types";

// ── globalThis.scheduler stub management ────────────────────────────────────

/** Install a scheduler.yield spy stub on globalThis; returns the spy. */
function installSchedulerSpy(
  impl?: () => Promise<void>,
): ReturnType<typeof vi.fn> {
  const g = globalThis as { scheduler?: unknown };
  g.scheduler = { yield: vi.fn(impl ?? (async () => {})) };
  return (g.scheduler as { yield: ReturnType<typeof vi.fn> }).yield;
}

/** Remove any scheduler stub (restores the jsdom-native absent state). */
function removeSchedulerStub(): void {
  delete (globalThis as { scheduler?: unknown }).scheduler;
}

/**
 * Stub document.createRange with a Range whose getClientRects always yields
 * NO rects — jsdom does not implement Range.getClientRects (layout is not
 * implemented), and the repo convention (lineBoxMapping.test.ts) is to
 * stub createRange in any unit test that reaches readLineBoxes. With no
 * rects, readLineBoxes deterministically returns [] — matching the
 * lineBoxes: [] expectation below. Returns a restore closure.
 */
function installEmptyRectRangeStub(): () => void {
  const realCreateRange = document.createRange.bind(document);
  const stub: Range = {
    setStart: () => {},
    setEnd: () => {},
    getClientRects: (() => []) as unknown as Range["getClientRects"],
  } as unknown as Range;
  document.createRange = () => stub;
  return () => {
    document.createRange = realCreateRange;
  };
}

let restoreRange: (() => void) | null = null;

afterEach(() => {
  removeSchedulerStub();
  if (restoreRange) {
    restoreRange();
    restoreRange = null;
  }
});

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A stub <article> whose children carry data-block-index (BlockRenderer shape). */
function makeArticleEl(blockTexts: string[]): HTMLElement {
  const article = document.createElement("article");
  blockTexts.forEach((text, i) => {
    const p = document.createElement("p");
    p.dataset.blockIndex = String(i);
    p.textContent = text;
    article.appendChild(p);
  });
  return article;
}

/**
 * The per-block expectation, built from the SAME DOM reads the
 * implementation performs (jsdom returns deterministic zeros/empty rect
 * lists; readLineBoxes yields [] because Range.getClientRects is empty in
 * jsdom). Pins kind mapping, order, completeness, and field shapes.
 */
function expectedFor(articleEl: HTMLElement): BlockMeasurement[] {
  return Array.from(
    articleEl.querySelectorAll<HTMLElement>("[data-block-index]"),
  ).map((el) => ({
    kind: "paragraph",
    heightPx: el.getBoundingClientRect().height,
    marginBlockStartPx:
      Number.parseFloat(getComputedStyle(el).marginBlockStart) || 0,
    marginBlockEndPx:
      Number.parseFloat(getComputedStyle(el).marginBlockEnd) || 0,
    lineCount: el.getClientRects().length,
    lineBoxes: [],
  }));
}

// ── Slicing behavior ────────────────────────────────────────────────────────

describe("measureAllBlocks — time-sliced async pass (260820-beo)", () => {
  it("budget 0: resolves to the full per-block expectation and yields between blocks (scheduler.yield spy)", async () => {
    restoreRange = installEmptyRectRangeStub();
    const articleEl = makeArticleEl([
      "first block of text",
      "second block of text",
      "third block of text",
    ]);
    const expected = expectedFor(articleEl);
    const yieldSpy = installSchedulerSpy();
    // RED driver: the pre-260820-beo measureAllBlocks is synchronous — the
    // call returns a plain array (not a Promise) and the spy never fires.
    const promise = measureAllBlocks(articleEl, new AbortController().signal, 0);
    expect(promise).toBeInstanceOf(Promise);
    const result = await promise;
    // Output deep-equals the unsliced expectation (kind/height/margins/
    // lineCount/lineBoxes per block, in order).
    expect(result).toEqual(expected);
    // First block runs synchronously; every subsequent block follows a yield
    // (budget 0 forces the slice boundary after EVERY block).
    expect(yieldSpy.mock.calls.length).toBeGreaterThanOrEqual(
      expected.length - 1,
    );
  });

  it("aborting from inside the scheduler.yield spy rejects with AbortError at the yield point", async () => {
    restoreRange = installEmptyRectRangeStub();
    const articleEl = makeArticleEl(["aa", "bb", "cc"]);
    const controller = new AbortController();
    // Abort on the FIRST yield (after block 1) — the signal must be
    // re-checked after every yield, before the next block's reads.
    installSchedulerSpy(async () => {
      controller.abort();
    });
    await expect(
      measureAllBlocks(articleEl, controller.signal, 0),
    ).rejects.toThrowError(/abort/i);
  });

  it("fallback path: with NO scheduler stub, budget 0 still resolves the full result via setTimeout(0)", async () => {
    restoreRange = installEmptyRectRangeStub();
    removeSchedulerStub(); // jsdom-native: no globalThis.scheduler
    const articleEl = makeArticleEl(["x", "y", "z"]);
    const expected = expectedFor(articleEl);
    const result = await measureAllBlocks(
      articleEl,
      new AbortController().signal,
      0,
    );
    expect(result).toEqual(expected);
  });

  it("default budget is a ceiling, not a floor: a small article resolves without any yield necessarily occurring", async () => {
    restoreRange = installEmptyRectRangeStub();
    expect(DEFAULT_SLICE_BUDGET_MS).toBe(10);
    const articleEl = makeArticleEl(["tiny"]);
    const expected = expectedFor(articleEl);
    const yieldSpy = installSchedulerSpy();
    const result = await measureAllBlocks(
      articleEl,
      new AbortController().signal,
    );
    // Budget not exceeded → zero or few yields; output still correct.
    expect(result).toEqual(expected);
    expect(yieldSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
