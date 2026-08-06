// tests/unit/measurement/engine.test.ts
// MeasurementEngine unit coverage — locks the staleness + partial-DOM defense
// contract that Plan 04-06 added and Plan 04-08 preserves.
//
// The engine has three commit gates that compose:
//   1. D3-06 font gate (awaitFontsReady) — mocked to resolve immediately.
//   2. Plan 04-06 partial-DOM defense — drops commits where the measured
//      blocks.length !== article.blocks.length (PaginatedSurface replaces
//      ArticleBody → measureAllBlocks reads 0 [data-block-index] elements).
//      Plan 04-08 keeps this defense as a safety net: the ArticleView now
//      also renders a hidden ArticleBody alongside PaginatedSurface so the
//      defense never fires in normal operation, but the contract is locked
//      here so a future regression to the partial-DOM path surfaces loudly.
//   3. D3-07 epoch guard — drops late-epoch results (PAGE-07 stale drop).
//
// These tests mock measureAllBlocks + awaitFontsReady so they can run in jsdom
// (which does NOT implement Range.getClientRects — the real measurement path
// is proven by tests/e2e/measurement/* in real browsers; Pitfall 2).

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BlockMeasurement, MeasurementResult } from "../../../src/measurement/types";
import type { CanonicalArticle } from "../../../src/content/types";

// ── Module mocks ───────────────────────────────────────────────────────────
// Mock the font gate so run() does not block on document.fonts.ready. The
// engine imports awaitFontsReady + AbortError from ./fontGate; we replace
// awaitFontsReady with a fast-resolving no-op so tests stay synchronous-ish.
vi.mock("../../../src/measurement/fontGate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/measurement/fontGate")>();
  return {
    ...actual,
    awaitFontsReady: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock domMeasurer.measureAllBlocks so we can control the block count per
// pass (partial vs full). The default returns a full block list; individual
// tests override measureAllBlocksMock.mockImplementationOnce for partial-DOM
// scenarios. The real measureAllBlocks queries [data-block-index] on a live
// DOM element — not viable in jsdom.
const measureAllBlocksMock = vi.fn<
  (articleEl: HTMLElement, signal: AbortSignal) => BlockMeasurement[]
>();
vi.mock("../../../src/measurement/domMeasurer", () => ({
  measureAllBlocks: (articleEl: HTMLElement, signal: AbortSignal): BlockMeasurement[] =>
    measureAllBlocksMock(articleEl, signal),
}));

// Import the engine AFTER mocks are registered so the engine's closure picks
// up the mocked measureAllBlocks + awaitFontsReady.
const { MeasurementEngine } = await import("../../../src/measurement/engine");
const { DiagnosticBus } = await import("../../../src/measurement/diagnostics");

// ── Stubs ──────────────────────────────────────────────────────────────────

/** A minimal stub CanonicalArticle with N top-level blocks. */
function stubArticle(blockCount: number): CanonicalArticle {
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Test article",
      author: null,
      publishedAt: null,
      savedAt: "2026-08-06T00:00:00.000Z",
    },
    blocks: Array.from({ length: blockCount }, (_, i) => ({
      kind: "paragraph",
      content: [{ type: "text", text: `Paragraph ${i}` }],
    })),
    footnotes: [],
  } as unknown as CanonicalArticle;
}

/** A stub BlockMeasurement for one paragraph block. */
function stubBlock(): BlockMeasurement {
  return {
    kind: "paragraph",
    heightPx: 24,
    lineCount: 1,
    lineBoxes: [{ charOffset: 0, topPx: 0, bottomPx: 24 }],
  };
}

/** A full block list of length N (the article.blocks.length case). */
function fullBlocks(n: number): BlockMeasurement[] {
  return Array.from({ length: n }, () => stubBlock());
}

/** A constraints snapshot — only .size matters for the PAGE-07 size-24 probe. */
function constraintsFor(size: number) {
  return {
    font: "serif" as const,
    size: size as 16 | 18 | 20 | 22 | 24,
    measure: 64 as const,
    spacing: "comfortable" as const,
    viewportWidthPx: 700,
    lang: "en",
  };
}

/** Build a fresh engine + spy handler + diagnostics bus for one test. */
function buildEngine(blockCount: number) {
  const article = stubArticle(blockCount);
  const articleEl = document.createElement("article");
  const diagnostics = new DiagnosticBus();
  const engine = new MeasurementEngine({ article, articleEl, diagnostics });
  const committed: MeasurementResult[] = [];
  const unsubscribe = engine.onTrusted((result) => committed.push(result));
  return { engine, article, committed, unsubscribe };
}

beforeEach(() => {
  measureAllBlocksMock.mockReset();
  // Default: return a full block list matching whatever article is asked.
  // Individual tests override via mockImplementationOnce for partial-DOM.
  measureAllBlocksMock.mockImplementation(() => fullBlocks(3));
});

describe("MeasurementEngine — Plan 04-06 partial-DOM defense", () => {
  it("commits a full-DOM result and invokes the trusted handler", async () => {
    const { engine, committed } = buildEngine(3);
    await engine.run(constraintsFor(18));
    expect(committed).toHaveLength(1);
    expect(committed[0]!.constraints.size).toBe(18);
    expect(committed[0]!.blocks).toHaveLength(3);
  });

  it("partial-DOM result does NOT commit but preserves the prior trustedView", async () => {
    // Plan 04-08 contract: when PaginatedSurface replaces ArticleBody (or any
    // path that yields fewer [data-block-index] elements than article.blocks),
    // the engine SILENTLY skips the commit. The previously-committed view
    // stays; no diagnostic is emitted (emitting measurement-error would
    // trigger ArticleView's fallback subscription → unwanted mode flip).
    const { engine, committed } = buildEngine(3);

    // First pass: full DOM → commit succeeds. (trustedView established.)
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    await engine.run(constraintsFor(18));
    expect(committed).toHaveLength(1);

    // Second pass: partial DOM (1 of 3 blocks). Defense skips; no commit.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(1));
    await engine.run(constraintsFor(20));
    expect(committed).toHaveLength(1); // still the prior commit
    expect(committed[0]!.constraints.size).toBe(18); // prior size preserved
  });

  it("full-DOM result with newer constraints DOES commit after a partial-DOM skip", async () => {
    // Plan 04-07 regression guard: a partial-DOM skip must NOT poison the
    // engine for subsequent full-DOM passes. Plan 04-08 makes this scenario
    // unreachable in production (ArticleBody stays mounted via the hidden
    // .article-body-measurement wrapper), but the contract is locked here.
    const { engine, committed } = buildEngine(3);

    // Pass 1: full DOM, size 18 → commit.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    await engine.run(constraintsFor(18));
    expect(committed).toHaveLength(1);

    // Pass 2: partial DOM, size 20 → defense skips.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(1));
    await engine.run(constraintsFor(20));
    expect(committed).toHaveLength(1);

    // Pass 3: full DOM, size 24 (the FINAL constraints in a rapid-trigger
    // race). The engine MUST commit this — the prior partial-DOM skip did
    // not lock the trustedView at size 18.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    await engine.run(constraintsFor(24));
    expect(committed).toHaveLength(2);
    expect(committed[1]!.constraints.size).toBe(24);
  });
});

describe("MeasurementEngine — D3-07 epoch guard (PAGE-07 stale drop)", () => {
  it("a late-epoch result is dropped and never replaces the trusted view", async () => {
    // The engine owns its own Epoch. Each run() captures the current epoch;
    // a newer run() bumps past it. When the older run's awaitFontsReady
    // resolves, the commit guard sees the captured epoch is no longer
    // current and DROPS the result (emits late-epoch-drop diagnostic).
    //
    // We force the race by awaiting the first run() AFTER the second run()
    // has already committed. The first run's commit guard then drops it.
    const { engine, committed, article } = buildEngine(3);
    // article ref kept to satisfy the engine's expected article shape; we
    // don't read it in this assertion but the linter would flag the unused
    // binding if removed.
    void article;

    // Pass 1: full DOM, size 18 — let it commit normally.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    await engine.run(constraintsFor(18));
    expect(committed).toHaveLength(1);
    expect(committed[0]!.constraints.size).toBe(18);

    // Pass 2: full DOM, size 24 — commits and bumps the epoch past pass 1.
    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    await engine.run(constraintsFor(24));
    expect(committed).toHaveLength(2);
    expect(committed[1]!.constraints.size).toBe(24);

    // Pass 3: full DOM, size 20 — a "late" result that arrives after size
    // 24 already committed. Under the engine's contract this represents a
    // stale-epoch result (a race loser). The commit guard drops it; the
    // trusted view stays at size 24 (the newer constraints).
    //
    // We simulate the race by stubbing awaitFontsReady to delay the third
    // pass until after the second pass has committed. The simplest way: the
    // third pass captures an epoch, then we run a fourth pass that bumps
    // past it before the third's commit guard runs. Since we await each
    // run() sequentially here, the natural ordering already makes the THIRD
    // pass the newest — to test the DROP path we need the third to be OLD.
    //
    // Restructure: run two passes concurrently where the second bumps past
    // the first before the first reaches its commit guard.
    const { engine: e2, committed: c2 } = buildEngine(3);
    measureAllBlocksMock.mockImplementation(() => fullBlocks(3));

    // Kick off pass A (size 18) WITHOUT awaiting.
    const passA = e2.run(constraintsFor(18));
    // Kick off pass B (size 24) — bumps the epoch past pass A.
    const passB = e2.run(constraintsFor(24));
    // Await both; pass A's commit guard should drop its result.
    await Promise.all([passA, passB]);

    // Only ONE commit survives — the newer (size 24). Pass A was dropped by
    // the epoch guard (emits a late-epoch-drop diagnostic, observable on
    // the diagnostics bus).
    expect(c2).toHaveLength(1);
    expect(c2[0]!.constraints.size).toBe(24);
  });
});

describe("MeasurementEngine — V7 error classification", () => {
  it("a non-Abort error in the trusted handler becomes a measurement-error diagnostic", async () => {
    // V7: any handler error is caught and classified — the reader is NEVER
    // blocked by a measurement failure. The engine emits a measurement-error
    // diagnostic and continues (does NOT re-throw).
    const { engine, article, unsubscribe } = buildEngine(3);
    void article;
    // Replace the trusted handler with one that throws.
    unsubscribe();
    const diagnostics = (engine as unknown as { opts: { diagnostics: { recent: () => unknown[] } } }).opts.diagnostics;
    engine.onTrusted(() => {
      throw new Error("handler explosion");
    });

    measureAllBlocksMock.mockImplementationOnce(() => fullBlocks(3));
    // Must NOT throw — the engine catches + classifies.
    await expect(engine.run(constraintsFor(18))).resolves.toBeUndefined();
    // The diagnostic was emitted.
    expect(diagnostics.recent().some((e) => (e as { kind: string }).kind === "measurement-error")).toBe(true);
  });
});
