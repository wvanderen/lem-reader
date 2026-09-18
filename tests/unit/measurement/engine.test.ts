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
import type {
  BlockMeasurement,
  EligibilityState,
  MeasurementResult,
} from "../../../src/measurement/types";
import type { CanonicalArticle } from "../../../src/content/types";
import type { ReaderSettings } from "../../../src/content/schema";
import type { RuntimeDriftGuard } from "../../../src/measurement/driftGuard";

// ── Module mocks ───────────────────────────────────────────────────────────
// Mock the textMeasurer adapter so dispatch tests can stage Pretext
// predictions without a canvas (jsdom has none). fontStringFor keeps a
// deterministic per-kind geometry; measureParagraphHeight throws by default
// so a test that unexpectedly reaches the fast measurer fails loudly.
const textMeasurerMocks = vi.hoisted(() => ({
  fontStringFor: vi.fn(),
  measureParagraphHeight: vi.fn(),
}));
vi.mock("../../../src/measurement/textMeasurer", () => ({
  fontStringFor: textMeasurerMocks.fontStringFor,
  measureParagraphHeight: textMeasurerMocks.measureParagraphHeight,
}));

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

// ── Issue-6 seam: calibration-gated per-block strategy dispatch ────────────

/** A deterministic ReaderSettings stub for the dispatch's geometry reads. */
const settingsStub: ReaderSettings = {
  schemaVersion: 2,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
  readingMode: "paginated",
  rate: 1,
};

/** Seed eligibility mirroring the committed fingerprint: headings eligible. */
const HEADING_ELIGIBLE: EligibilityState = {
  paragraph: { pretextEligible: false },
  heading: { pretextEligible: true },
};
const ALL_DOM: EligibilityState = {
  paragraph: { pretextEligible: false },
  heading: { pretextEligible: false },
};

/** A DOM-truth heading block as measureAllBlocks would produce it. */
function domHeadingBlock(over: Partial<BlockMeasurement> = {}): BlockMeasurement {
  return {
    kind: "heading",
    heightPx: 28.2,
    lineCount: 1,
    lineBoxes: [{ charOffset: 0, topPx: 100, bottomPx: 128.2 }],
    marginBlockStartPx: 12,
    marginBlockEndPx: 12,
    ...over,
  };
}

/**
 * Mount the [data-block-index] elements the dispatch walks for Pretext
 * inputs (textContent + width + heading level). Order must match the mocked
 * measureAllBlocks output — the same contract the real domMeasurer satisfies.
 */
function mountDispatchDom(
  articleEl: HTMLElement,
  specs: { kind: "paragraph" | "heading"; text?: string }[],
): void {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const el = document.createElement(spec.kind === "heading" ? "h2" : "p");
    el.setAttribute("data-block-index", String(i));
    el.textContent =
      spec.text ?? (spec.kind === "heading" ? "A heading" : "Some paragraph text.");
    articleEl.appendChild(el);
  }
}

/** Build an engine wired for dispatch tests + spies on the bus/commits. */
function buildDispatchEngine(
  domBlocks: BlockMeasurement[],
  eligibility: EligibilityState,
  engineOpts: {
    driftGuard?: RuntimeDriftGuard;
    driftTolerancePx?: number;
    getReaderSettings?: () => ReaderSettings;
    diagnostics?: InstanceType<typeof DiagnosticBus>;
  } = {},
) {
  const article = stubArticle(domBlocks.length);
  const articleEl = document.createElement("article");
  mountDispatchDom(
    articleEl,
    domBlocks.map((b) => ({
      kind: b.kind as "paragraph" | "heading",
      text: b.kind === "heading" ? "A heading" : "Some paragraph text.",
    })),
  );
  const diagnostics = engineOpts.diagnostics ?? new DiagnosticBus();
  const engine = new MeasurementEngine({
    article,
    articleEl,
    diagnostics,
    eligibility,
    getReaderSettings:
      "getReaderSettings" in engineOpts
        ? engineOpts.getReaderSettings
        : () => settingsStub,
    driftGuard: engineOpts.driftGuard,
    driftTolerancePx: engineOpts.driftTolerancePx,
  });
  const committed: MeasurementResult[] = [];
  engine.onTrusted((result) => committed.push(result));
  return { engine, articleEl, committed, diagnostics };
}

describe("MeasurementEngine — calibration-gated strategy dispatch (issue 6)", () => {
  const { fontStringFor: fontStringForMock, measureParagraphHeight: measureParagraphHeightMock } =
    textMeasurerMocks;

  beforeEach(() => {
    fontStringForMock.mockReset().mockImplementation(
      (kind: "paragraph" | "heading") =>
        kind === "heading"
          ? { font: "600 22px serif", lineHeightPx: 28.6 }
          : { font: "400 18px serif", lineHeightPx: 28.8 },
    );
    measureParagraphHeightMock.mockReset();
    measureParagraphHeightMock.mockImplementation(() => {
      throw new Error("measureParagraphHeight not stubbed for this test");
    });
  });

  it("ineligible-only corpus commits byte-identical DOM blocks with zero Pretext calls", async () => {
    const dom = [domHeadingBlock(), stubBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, ALL_DOM);

    await engine.run(constraintsFor(18));

    expect(committed).toHaveLength(1);
    expect(committed[0]!.blocks).toEqual(dom);
    expect(measureParagraphHeightMock).not.toHaveBeenCalled();
    expect(diagnostics.recent()).toHaveLength(0);
  });

  it("no settings reader → all-DOM even when the fingerprint seeds eligibility", async () => {
    const dom = [domHeadingBlock(), stubBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE, {
      getReaderSettings: undefined,
    });

    await engine.run(constraintsFor(18));

    expect(committed).toHaveLength(1);
    expect(committed[0]!.blocks).toEqual(dom);
    expect(measureParagraphHeightMock).not.toHaveBeenCalled();
    expect(diagnostics.recent()).toHaveLength(0);
  });

  it("agreement commits the fast measurement with DOM margins + line boxes", async () => {
    const dom = [domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    // DOM truth 28.2px vs prediction 28.6px — inside the 1.0px tolerance, so
    // the committed height MUST be the fast measurer's 28.6 (discriminates
    // dispatch from a pure-DOM commit).
    measureParagraphHeightMock.mockReturnValue({ height: 28.6, lineCount: 1 });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await engine.run(constraintsFor(18));

    expect(measureParagraphHeightMock).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(1);
    const block = committed[0]!.blocks[0]!;
    expect(block.heightPx).toBe(28.6);
    expect(block.lineCount).toBe(1);
    // Margins + line boxes stay DOM truth (atomic kinds consume margins;
    // splitting kinds keep the D-05 DOM split primitive).
    expect(block.marginBlockStartPx).toBe(12);
    expect(block.marginBlockEndPx).toBe(12);
    expect(block.lineBoxes).toEqual(dom[0]!.lineBoxes);
    expect(diagnostics.recent()).toHaveLength(0);
  });

  it("drift exactly at the tolerance boundary agrees (strictly-greater rule)", async () => {
    const dom = [domHeadingBlock({ heightPx: 28.6 })];
    measureAllBlocksMock.mockImplementation(() => dom);
    // |28.6 − 29.6| = 1.0 == tolerance → agreement, mirroring the drift
    // guard's boundary semantics.
    measureParagraphHeightMock.mockReturnValue({ height: 29.6, lineCount: 1 });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await engine.run(constraintsFor(18));

    expect(committed[0]!.blocks[0]!.heightPx).toBe(29.6);
    expect(diagnostics.recent()).toHaveLength(0);
  });

  it("beyond-tolerance drift falls back to DOM and emits drift-exceedance", async () => {
    const dom = [domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    measureParagraphHeightMock.mockReturnValue({ height: 40.5, lineCount: 2 });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await engine.run(constraintsFor(18));

    expect(committed).toHaveLength(1);
    expect(committed[0]!.blocks).toEqual(dom);
    const drifts = diagnostics.recent().filter((e) => e.kind === "drift-exceedance");
    expect(drifts).toHaveLength(1);
    expect(diagnostics.recent().some((e) => e.kind === "measurement-error")).toBe(false);
  });

  it("lineCount mismatch falls back to DOM even when height agrees", async () => {
    const dom = [domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    measureParagraphHeightMock.mockReturnValue({ height: 28.2, lineCount: 2 });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await engine.run(constraintsFor(18));

    expect(committed[0]!.blocks).toEqual(dom);
    expect(diagnostics.recent().some((e) => e.kind === "drift-exceedance")).toBe(true);
  });

  it("a Pretext throw falls back to DOM with measurement-error (V7), no drift-exceedance", async () => {
    const dom = [domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    measureParagraphHeightMock.mockImplementation(() => {
      throw new Error("canvas unavailable");
    });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await expect(engine.run(constraintsFor(18))).resolves.toBeUndefined();

    expect(committed).toHaveLength(1);
    expect(committed[0]!.blocks).toEqual(dom);
    expect(diagnostics.recent().some((e) => e.kind === "drift-exceedance")).toBe(false);
    const errors = diagnostics.recent().filter((e) => e.kind === "measurement-error");
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toContain("canvas unavailable");
  });

  it("an empty-text heading uses DOM silently — not applicable, not drift", async () => {
    const dom = [domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    const { engine, articleEl, committed, diagnostics } = buildDispatchEngine(
      dom,
      HEADING_ELIGIBLE,
    );
    // Empty the mounted heading text — the fast measurer has nothing to
    // canvas-measure, so the block is not applicable (DOM, no diagnostics).
    articleEl.querySelector<HTMLElement>("[data-block-index='0']")!.textContent = "";

    await engine.run(constraintsFor(18));

    expect(measureParagraphHeightMock).not.toHaveBeenCalled();
    expect(committed[0]!.blocks).toEqual(dom);
    expect(diagnostics.recent()).toHaveLength(0);
  });

  it("paragraphs stay DOM when only headings are eligible", async () => {
    const dom = [stubBlock(), domHeadingBlock()];
    measureAllBlocksMock.mockImplementation(() => dom);
    measureParagraphHeightMock.mockReturnValue({ height: 28.6, lineCount: 1 });
    const { engine, committed } = buildDispatchEngine(dom, HEADING_ELIGIBLE);

    await engine.run(constraintsFor(18));

    expect(measureParagraphHeightMock).toHaveBeenCalledTimes(1);
    expect(committed[0]!.blocks[0]).toEqual(dom[0]);
    expect(committed[0]!.blocks[1]!.heightPx).toBe(28.6);
  });

  it("driftTolerancePx tightens the agreement gate", async () => {
    const dom = [domHeadingBlock({ heightPx: 28.6 })];
    measureAllBlocksMock.mockImplementation(() => dom);
    // Drift 1.0px would agree at the default tolerance but not at 0.5.
    measureParagraphHeightMock.mockReturnValue({ height: 29.6, lineCount: 1 });
    const { engine, committed, diagnostics } = buildDispatchEngine(dom, HEADING_ELIGIBLE, {
      driftTolerancePx: 0.5,
    });

    await engine.run(constraintsFor(18));

    expect(committed[0]!.blocks).toEqual(dom);
    expect(diagnostics.recent().some((e) => e.kind === "drift-exceedance")).toBe(true);
  });

  it("runtime guard downgrade flips eligibility so the next pass is all-DOM", async () => {
    const { RuntimeDriftGuard } = await import("../../../src/measurement/driftGuard");
    const dom = [domHeadingBlock({ heightPx: 28.6 })];
    measureAllBlocksMock.mockImplementation(() => dom);
    measureParagraphHeightMock.mockReturnValue({ height: 40.5, lineCount: 2 });
    // The guard MUST share the engine's bus (T-04 threading contract) so its
    // downgrade diagnostics land where the test (and the UI) reads them.
    const diagnostics = new DiagnosticBus();
    const { engine, committed } = buildDispatchEngine(dom, HEADING_ELIGIBLE, {
      driftGuard: new RuntimeDriftGuard({ tolerancePx: 1.0, diagnostics }),
      diagnostics,
    });

    // Pass 1: drift → per-block DOM fallback + drift-exceedance + the guard's
    // kind-level downgrade diagnostic.
    await engine.run(constraintsFor(18));
    expect(diagnostics.recent().some((e) => e.kind === "drift-exceedance")).toBe(true);
    const downgrades = diagnostics
      .recent()
      .filter((e) => e.kind === "runtime-guard-downgrade");
    expect(downgrades).toHaveLength(1);
    expect((downgrades[0] as { "kind-downgraded": string })["kind-downgraded"]).toBe("heading");

    // Pass 2: the downgraded kind dispatches DOM — no Pretext call, no new
    // diagnostics.
    measureParagraphHeightMock.mockClear();
    await engine.run(constraintsFor(18));
    expect(measureParagraphHeightMock).not.toHaveBeenCalled();
    expect(committed).toHaveLength(2);
    expect(committed[1]!.blocks).toEqual(dom);
    expect(
      diagnostics.recent().filter((e) => e.kind === "runtime-guard-downgrade"),
    ).toHaveLength(1);
  });
});
