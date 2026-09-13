// src/measurement/engine.ts
// MeasurementEngine — orchestrates the staleness-safe pipeline:
//
//   bump (epoch) → fontGate (await .ready) → measureAllBlocks (DOM read) →
//     calibration-gated per-block strategy dispatch (chooseStrategy) →
//     [optional] RuntimeDriftGuard sampling →
//     commit-guard (epoch.isCurrent + !signal.aborted) → trustedView | drop
//
// Per-block strategy dispatch (issue 6 — ADR-0001's calibration gate, live):
// the DOM pass above is ALWAYS computed — it is the calibration reference
// (D3-03) AND the fallback. Blocks that chooseStrategy routes to "pretext"
// (paragraph/heading kinds the committed calibration fingerprint seeds
// eligible via useMeasurement) are then measured by the Pretext fast text
// measurer, and the fast result is what the trusted view commits — PROVIDED
// it agrees with the DOM reference (drift ≤ tolerance AND same line count).
// Any disagreement, invalid prediction, or Pretext throw falls back to the
// DOM measurement, which remains the truth; drift beyond tolerance also
// emits a `drift-exceedance` diagnostic (D3-05 — never silently). DOM line
// boxes are kept on every committed block: they are the D-05 split-point
// primitive for splitting kinds (lineBoxes.ts contract), and the only
// currently-eligible kind (heading) is ATOMIC (D4-02), so pagination
// consumes only the fast heightPx/lineCount from dispatched entries.
//
// The post-render overflow guard (PaginatedSurface → refragmentOverflowingPage)
// stays authoritative regardless of which measurer produced a height — it
// re-checks live DOM after render and corrects or falls back.
//
// PAGE-07 lives in the commit guard: a late result computed for older
// constraints is DROPPED (emits `late-epoch-drop`); the trusted view is
// replaced only by a result that survived the font gate AND the epoch
// guard for the CURRENT constraints.
//
// PAGE-06 lives in the hook: the trustedView state is the "last valid
// view"; an engine that drops a result simply does NOT call the trusted
// handler, so the previously-committed view stays mounted.
//
// V7 error classification (RESEARCH §Security Domain): a non-Abort error
// becomes a `measurement-error` diagnostic, NEVER a throw to the reader.
// The reader keeps using the last trusted view; Phase 4's PAGE-09 UI can
// surface the diagnostic for diagnosis without disrupting reading.
//
// Per-kind strategy dispatch (Pattern F — exhaustive switch, NO default):
//   paragraph + heading → "pretext" when eligibility flags them eligible
//   (seeded from calibration/fingerprint.json by useMeasurement); otherwise
//   "dom". All other kinds are DOM by definition (D3-01). On any Pretext
//   throw, the engine emits a measurement-error diagnostic and falls back
//   to DOM for that block (V7 — never block reading).
//
// RuntimeDriftGuard (D3-08): if injected, the dispatch feeds every usable
// (prediction, DOM reference) pair it produced to the guard, which samples
// up to N per pass and downgrades the kind (sets eligibility false + emits
// runtime-guard-downgrade) on drift beyond tolerance. The guard runs AFTER
// the dispatch but BEFORE the commit guard so a downgrade feeds the
// diagnostic bus (D3-05) and adjusts eligibility for the next pass.

import type { CanonicalArticle } from "../content/types";
import type { ReaderSettings } from "../content/schema";
import type {
  Constraints,
  EligibilityState,
  MeasurementResult,
} from "./types";
import type { BlockMeasurement } from "./types";
import { Epoch } from "./epoch";
import { AbortError, awaitFontsReady } from "./fontGate";
import type { DiagnosticBus } from "./diagnostics";
import { measureAllBlocks } from "./domMeasurer";
import type { RuntimeDriftGuard } from "./driftGuard";
import { fontStringFor, measureParagraphHeight } from "./textMeasurer";
import { COMMITTED_FINGERPRINT } from "./fingerprint";

/**
 * Default per-block drift tolerance for the dispatch's agreement gate.
 * Derived from the committed fingerprint's own toleranceBound (the same
 * bound the calibration gate measured the corpus against) with a
 * conservative 1.0px fallback for an unbounded artifact; the hook passes
 * its RUNTIME_DRIFT_TOLERANCE_PX explicitly so the dispatch and the drift
 * guard share one bound in production.
 */
const DEFAULT_DRIFT_TOLERANCE_PX =
  COMMITTED_FINGERPRINT.toleranceBound?.heightDriftPx ?? 1.0;

/** DOM-only eligibility default (seeded from the fingerprint by the hook). */
const DEFAULT_ELIGIBILITY: EligibilityState = {
  paragraph: { pretextEligible: false },
  heading: { pretextEligible: false },
};

/**
 * The block-kind strings the renderer emits (mirrors src/content/schema.ts
 * Block union kinds). Used by chooseStrategy's exhaustive switch — do NOT
 * add a default branch (Pattern F: TS flags missing cases at compile time).
 */
export type BlockKind =
  | "heading"
  | "paragraph"
  | "blockquote"
  | "bulleted-list"
  | "numbered-list"
  | "figure"
  | "code-block"
  | "footnote-reference"
  | "unsupported";

export interface MeasurementEngineOptions {
  article: CanonicalArticle;
  articleEl: HTMLElement;
  diagnostics: DiagnosticBus;
  /** Defaults to DOM-only; Plan 02 seeds from the calibration fingerprint. */
  eligibility?: EligibilityState;
  /**
   * Optional runtime drift guard (D3-08). When present, the engine samples
   * Pretext-predicted eligible blocks against DOM references each pass and
   * downgrades drifting kinds. Optional so the engine is constructible
   * without it (e.g. when no kind is eligible — no point sampling).
   */
  driftGuard?: RuntimeDriftGuard;
  /**
   * Reads the current ReaderSettings — needed to derive the canvas font
   * shorthand + line-height per block kind for Pretext measurement. The
   * hook supplies this from its settingsRef. Required when driftGuard is
   * present OR any kind is eligible (so Pretext predictions can be computed);
   * absent → every pass is all-DOM regardless of eligibility.
   */
  getReaderSettings?: () => ReaderSettings;
  /**
   * Max |DOM heightPx − fast-measurer heightPx| for a dispatched block to
   * count as agreement (the fast result is committed). Blocks beyond it —
   * or with a line-count mismatch — fall back to the DOM measurement and
   * emit drift-exceedance. Defaults to DEFAULT_DRIFT_TOLERANCE_PX; the hook
   * passes its RUNTIME_DRIFT_TOLERANCE_PX so the dispatch and the drift
   * guard share one bound.
   */
  driftTolerancePx?: number;
}

/**
 * MeasurementEngine owns its own Epoch — each run() captures the latest
 * bumped epoch, so a trigger fired during a previous run invalidates that
 * previous run at its commit guard. (The TriggerCoalescer has its own
 * Epoch for trigger-coalescing; this one is for engine-internal commit
 * guards when the engine is invoked directly.)
 */
export class MeasurementEngine {
  private readonly opts: {
    article: CanonicalArticle;
    articleEl: HTMLElement;
    diagnostics: DiagnosticBus;
    eligibility: EligibilityState;
    driftGuard?: RuntimeDriftGuard;
    getReaderSettings?: () => ReaderSettings;
  };
  private readonly driftTolerancePx: number;
  private readonly epoch = new Epoch();
  private trustedHandler: ((result: MeasurementResult) => void) | null = null;

  constructor(opts: MeasurementEngineOptions) {
    this.opts = {
      article: opts.article,
      articleEl: opts.articleEl,
      diagnostics: opts.diagnostics,
      // Defensive copy so the drift guard can mutate eligibility in place
      // without affecting the caller's seed state across remounts.
      eligibility: opts.eligibility
        ? {
            paragraph: { ...opts.eligibility.paragraph },
            heading: { ...opts.eligibility.heading },
          }
        : DEFAULT_ELIGIBILITY,
      driftGuard: opts.driftGuard,
      getReaderSettings: opts.getReaderSettings,
    };
    this.driftTolerancePx = opts.driftTolerancePx ?? DEFAULT_DRIFT_TOLERANCE_PX;
  }

  /**
   * Run one measurement pass for `constraints`. The font gate + epoch
   * commit guard run inside; on success the trusted handler is invoked
   * with a fresh MeasurementResult. On staleness or cancel, the result is
   * dropped silently (late-epoch-drop diagnostic emitted for staleness).
   *
   * PAGE-07: a late-epoch result NEVER replaces the trusted view.
   */
  async run(constraints: Constraints): Promise<void> {
    const { epoch: captured, signal } = this.epoch.bump();
    try {
      await awaitFontsReady(signal);
      if (signal.aborted) return; // cancelled mid-gate
      // DOM truth — read-phase per ~10ms slice (Pitfall 2 within a slice;
      // 260820-beo: the pass is async and yields between slices so it never
      // blocks paint). Always computed: it is the calibration reference
      // (D3-03) AND the runtime fallback when a kind is not Pretext-eligible
      // or the fast measurer disagrees with it.
      const domBlocks = await measureAllBlocks(this.opts.articleEl, signal);
      // Plan 04-06 contract defense: MeasurementResult.blocks MUST be 1:1
      // with article.blocks. PaginatedSurface replaces ArticleBody with a
      // single page fragment in paginated mode — when the ResizeObserver
      // fires after that swap, this measurement would capture only the
      // page's [data-block-index] elements (or none, since PageFragmentView
      // doesn't emit the attribute). Rather than overwrite the GOOD
      // trustedView (captured earlier against the full ArticleBody) with
      // bad data, SILENTLY SKIP this commit. The previous trustedView stays;
      // PaginatedSurface keeps rendering correct pages. Repagination still
      // works on viewport changes (pageContentBoxHeightPx re-derives);
      // typography-change re-measure is a known MVP scope limit under this
      // defense. No diagnostic emitted — this is expected behavior in
      // paginated mode, not an error condition (emitting measurement-error
      // would trigger ArticleView's fallback subscription → unwanted flip).
      if (domBlocks.length !== this.opts.article.blocks.length) {
        return;
      }
      // Calibration-gated per-block strategy dispatch (issue 6): eligible
      // kinds are measured by the fast text measurer; every disagreement —
      // and every non-eligible kind — keeps the DOM measurement. Produces
      // the committed block list AND the (prediction, DOM reference) pairs
      // for the runtime drift guard.
      const dispatch = this.dispatchPretextStrategies(domBlocks);
      // D3-08 runtime drift sampling: feed the guard the pairs the dispatch
      // produced. The guard caps how many it compares (sampleSize), downgrades
      // drifting kinds in place, and emits runtime-guard-downgrade per kind —
      // the NEXT pass then dispatches DOM for the downgraded kind.
      const dg = this.opts.driftGuard;
      if (dg && dispatch.predictions.length > 0) {
        dg.sample(dispatch.predictions, dispatch.domReference, this.opts.eligibility);
      }
      // Commit guard — PAGE-07.
      if (!this.epoch.isCurrent(captured) || signal.aborted) {
        this.opts.diagnostics.emit({
          kind: "late-epoch-drop",
          captured,
          current: this.epoch.current(),
          ts: new Date().toISOString(),
        });
        return; // stale → DROP (the trusted view is retained by the hook)
      }
      const result: MeasurementResult = {
        schemaVersion: 2,
        constraints,
        blocks: dispatch.blocks,
        computedAt: new Date().toISOString(),
      };
      // V7: any handler error becomes a measurement-error diagnostic, never
      // a throw to the reader. (Defensive — the hook's handler is plain
      // setState and should not throw.)
      try {
        this.trustedHandler?.(result);
      } catch (e) {
        this.opts.diagnostics.emit({
          kind: "measurement-error",
          message: `trusted-handler: ${String(e)}`,
          ts: new Date().toISOString(),
        });
      }
    } catch (e) {
      // V7 classification: AbortError → silent cancel; anything else →
      // measurement-error diagnostic. The reader is NEVER blocked by a
      // measurement failure (PAGE-06 — last trusted view retained).
      if (e instanceof AbortError) return;
      this.opts.diagnostics.emit({
        kind: "measurement-error",
        message: String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  /**
   * Calibration-gated per-block strategy dispatch (issue 6 — the seam the
   * ADR-0001 gate feeds).
   *
   * For each DOM-measured block, chooseStrategy picks the measurer:
   *   - "dom" (non-eligible kinds, or kinds the runtime guard downgraded)
   *     → the DOM measurement is committed unchanged.
   *   - "pretext" → the fast text measurer produces height + lineCount from
   *     the block's text (canvas-measured, no reflow). The fast result is
   *     committed ONLY when it agrees with the DOM reference: finite,
   *     positive, line-count equal, and |Δheight| ≤ driftTolerancePx.
   *     Committed entries keep the DOM margins AND the DOM line boxes —
   *     line boxes are the D-05 split-point primitive for splitting kinds
   *     (lineBoxes.ts), and the sole currently-eligible kind (heading) is
   *     atomic, so pagination consumes only the fast height/lineCount.
   *     Every usable pair (agreement or not) is also returned for the
   *     runtime drift guard, which owns kind-level downgrade (D3-08).
   *
   * Disagreement/throw handling (never silent):
   *   - usable prediction + drift beyond tolerance or line-count mismatch
   *     → DOM committed; ONE `drift-exceedance` diagnostic per pass.
   *   - Pretext throw → DOM committed; `measurement-error` diagnostic (V7).
   *   - empty text / non-finite numbers → DOM committed, no diagnostic
   *     (the fast measurer is not applicable — calibration never exercised
   *     such blocks; this is expected fallback, not drift).
   *
   * When no settings reader is configured (or no block routes to "pretext")
   * the returned blocks ARE the DOM measurements — byte-identical output to
   * a dispatch-free pass (zero behavior change for ineligible-only corpora).
   */
  private dispatchPretextStrategies(domBlocks: BlockMeasurement[]): {
    blocks: BlockMeasurement[];
    predictions: BlockMeasurement[];
    domReference: BlockMeasurement[];
  } {
    const blocks: BlockMeasurement[] = [];
    const predictions: BlockMeasurement[] = [];
    const domReference: BlockMeasurement[] = [];
    const getSettings = this.opts.getReaderSettings;
    if (!getSettings) {
      // No canvas geometry derivable → the pass is all-DOM by construction.
      return { blocks: domBlocks, predictions, domReference };
    }
    const settings = getSettings();
    // letterSpacingPx: parse the spacing preset's CSS (e.g. "0.01em" →
    // 0.01 × size). Pitfall 6: spacious ALSO writes wordSpacing 0.05em
    // which Pretext does NOT model — calibration must include spacious.
    const letterSpacingPx = letterSpacingPxForPreset(settings);
    const elements = Array.from(
      this.opts.articleEl.querySelectorAll<HTMLElement>(
        // Same selector as domMeasurer and the former drift-sampler walk
        // (Plan 05-05): the page-fragment's blocks carry data-block-index for
        // D5-08 capture but are a per-page slice, not the full article set.
        // The 1:1 length defense in run() already passed, so elements[i]
        // aligns with domBlocks[i] by the domMeasurer's document-order
        // contract.
        "[data-block-index]:not(.page-fragment [data-block-index])",
      ),
    );
    let sawDrift = false;

    for (let i = 0; i < domBlocks.length; i++) {
      const dom = domBlocks[i]!;
      const kind = dom.kind;
      const el = elements[i];
      // BlockMeasurement.kind is a free-form string (domMeasurer maps
      // arbitrary tags), so narrow to the two Pretext-capable kinds BEFORE
      // consulting the strategy seam; everything else is DOM by definition
      // (D3-01).
      if (!el || (kind !== "paragraph" && kind !== "heading")) {
        blocks.push(dom);
        continue;
      }
      if (chooseStrategy(kind as BlockKind, this.opts.eligibility) !== "pretext") {
        blocks.push(dom);
        continue;
      }
      try {
        const text = el.textContent ?? "";
        if (text.length === 0) {
          // Nothing to canvas-measure — DOM stays (see header note).
          blocks.push(dom);
          continue;
        }
        const geom =
          kind === "heading"
            ? fontStringFor("heading", headingLevelFor(el), settings)
            : fontStringFor("paragraph", 1, settings);
        // Border-box width — the exact convention the calibration harness
        // measures with (calibration.harness.spec.ts), so the runtime gate
        // sees the same geometry the eligibility cells were computed against.
        const maxWidthPx = el.getBoundingClientRect().width;
        const prediction = measureParagraphHeight({
          text,
          font: geom.font,
          letterSpacingPx,
          lineHeightPx: geom.lineHeightPx,
          maxWidthPx,
        });
        const usable =
          Number.isFinite(prediction.height) &&
          prediction.height > 0 &&
          Number.isInteger(prediction.lineCount) &&
          prediction.lineCount >= 1;
        if (!usable) {
          blocks.push(dom);
          continue;
        }
        const predictionBlock: BlockMeasurement = {
          kind,
          heightPx: prediction.height,
          lineCount: prediction.lineCount,
          // Predictions are height/lineCount comparisons only — lineBoxes is
          // not part of the drift comparison; default to [] (the guard never
          // reads it). Required because BlockMeasurementSchema made the field
          // non-optional in the inferred type (Plan 04-06 schema evolution).
          lineBoxes: [],
        };
        const drift = Math.abs(dom.heightPx - prediction.height);
        const agrees =
          drift <= this.driftTolerancePx && prediction.lineCount === dom.lineCount;
        // Feed the guard every usable pair; its sampleSize cap decides how
        // many actually get compared (D3-08 — the engine need not know N).
        predictions.push(predictionBlock);
        domReference.push(dom);
        if (!agrees) {
          sawDrift = true;
          blocks.push(dom); // DOM remains the truth on any disagreement.
          continue;
        }
        blocks.push({
          kind,
          heightPx: prediction.height,
          marginBlockStartPx: dom.marginBlockStartPx,
          marginBlockEndPx: dom.marginBlockEndPx,
          lineCount: prediction.lineCount,
          // DOM line boxes stay: the D-05 split primitive for splitting
          // kinds; the eligible heading kind is atomic (D4-02) and never
          // splits on them.
          lineBoxes: dom.lineBoxes,
        });
      } catch (e) {
        // V7: Pretext threw for this block — emit + DOM-fallback.
        this.opts.diagnostics.emit({
          kind: "measurement-error",
          message: `pretext-dispatch: ${String(e)}`,
          ts: new Date().toISOString(),
        });
        blocks.push(dom);
      }
    }
    if (sawDrift) {
      // D3-05: DOM-vs-fast-measurer drift surfaced through the existing
      // diagnostics, never silently. One event per pass — the per-kind
      // consequence arrives via runtime-guard-downgrade when the guard
      // downgrades.
      this.opts.diagnostics.emit({
        kind: "drift-exceedance",
        ts: new Date().toISOString(),
      });
    }
    return { blocks, predictions, domReference };
  }

  /**
   * Register the trusted-view handler. Returns an unsubscribe. The hook
   * calls this once per mount; the engine invokes the handler only with a
   * result that survived the commit guard.
   */
  onTrusted(handler: (result: MeasurementResult) => void): () => void {
    this.trustedHandler = handler;
    return () => {
      if (this.trustedHandler === handler) {
        this.trustedHandler = null;
      }
    };
  }

  /** Cancel any in-flight pass by bumping the epoch past the captured one. */
  cancel(): void {
    this.epoch.bump();
  }
}

/**
 * Map a heading element to its level (h1→1, h2→2, … ; default 2 if unknown).
 */
function headingLevelFor(el: HTMLElement): 1 | 2 | 3 | 4 | 5 | 6 {
  const tag = el.tagName.toLowerCase();
  if (tag === "h1") return 1;
  if (tag === "h2") return 2;
  if (tag === "h3") return 3;
  if (tag === "h4") return 4;
  if (tag === "h5") return 5;
  if (tag === "h6") return 6;
  return 2;
}

/**
 * Per-spacing-preset letter-spacing in pixels, as a function of the active
 * font size. SPACING_PRESETS stores CSS strings ("0", "0.01em"); Pretext
 * takes px. Parses the em value relative to the active size (compact/
 * comfortable = 0px; spacious = 0.01em = 0.01 × size).
 *
 * Pitfall 6 (RESEARCH): Pretext has NO wordSpacing option, only
 * letterSpacing. The spacious preset ALSO writes wordSpacing 0.05em —
 * unmodeled here. Calibration MUST include spacious; if drift exceeds
 * tolerance, the kind is marked ineligible under spacious per-(kind,font).
 */
function letterSpacingPxForPreset(settings: ReaderSettings): number {
  // mirror SPACING_PRESETS[settings.spacing].letterSpacing parsing
  if (settings.spacing === "spacious") return settings.size * 0.01;
  return 0; // compact + comfortable both write "0"
}

/**
 * Choose the measurement strategy for a block kind. Exhaustive switch — NO
 * default branch — so TypeScript flags any missing case at compile time
 * (Pattern F, mirrors BlockRenderer.tsx L21–113). paragraph + heading
 * dispatch to "pretext" when their eligibility flag is true (seeded from
 * calibration/fingerprint.json); all other kinds are DOM by definition
 * (D3-01 — rich/non-text kinds have no Pretext fast path).
 *
 * Production caller: MeasurementEngine.run() → dispatchPretextStrategies
 * invokes this per block (issue 6 wiring); the runtime drift guard's
 * downgrades mutate the eligibility the next pass consults here.
 */
export function chooseStrategy(
  kind: BlockKind,
  eligibility: EligibilityState,
): "pretext" | "dom" {
  switch (kind) {
    case "heading":
      return eligibility.heading.pretextEligible ? "pretext" : "dom";
    case "paragraph":
      return eligibility.paragraph.pretextEligible ? "pretext" : "dom";
    case "blockquote":
      return "dom";
    case "bulleted-list":
      return "dom";
    case "numbered-list":
      return "dom";
    case "figure":
      return "dom";
    case "code-block":
      return "dom";
    case "footnote-reference":
      return "dom";
    case "unsupported":
      return "dom";
  }
}
