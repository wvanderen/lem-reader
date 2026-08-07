// src/measurement/engine.ts
// MeasurementEngine — orchestrates the staleness-safe pipeline:
//
//   bump (epoch) → fontGate (await .ready) → measureAllBlocks (DOM read) →
//     [optional] RuntimeDriftGuard sampling (Pretext prediction vs DOM) →
//     commit-guard (epoch.isCurrent + !signal.aborted) → trustedView | drop
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
//   "dom". All other kinds are DOM by definition (D3-01). The Pretext
//   measurement branch (Plan 02) is invoked when strategy === "pretext";
//   on any Pretext throw, the engine emits a measurement-error diagnostic
//   and falls back to DOM for that block (V7 — never block reading).
//
// RuntimeDriftGuard (D3-08): if injected, the engine samples up to N
// Pretext-predicted eligible blocks per pass, compares to DOM references,
// and downgrades the kind (sets eligibility false + emits
// runtime-guard-downgrade) on drift beyond tolerance. The guard runs AFTER
// the DOM measure step but BEFORE the commit guard so a downgrade feeds
// the diagnostic bus (D3-05) and adjusts eligibility for the next pass.

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
import { fontStringFor, measureParagraphWithBreaks } from "./textMeasurer";

/** DOM-only eligibility default (Plan 01 — Plan 02 seeds from the fingerprint). */
export const DEFAULT_ELIGIBILITY: EligibilityState = {
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
   * present OR any kind is eligible (so Pretext predictions can be computed).
   */
  getReaderSettings?: () => ReaderSettings;
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
      // DOM truth — single read-phase (Pitfall 2). Always computed: it is
      // the calibration reference (D3-03) AND the runtime fallback when a
      // kind is not Pretext-eligible.
      const blocks = measureAllBlocks(this.opts.articleEl, signal);
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
      if (blocks.length !== this.opts.article.blocks.length) {
        return;
      }
      // Plan 02: runtime drift sampling. Only when a guard is configured
      // AND at least one kind is currently Pretext-eligible (otherwise no
      // work to do — guard.sample would short-circuit anyway, but checking
      // here avoids the per-block text walk when not needed).
      const dg = this.opts.driftGuard;
      if (
        dg &&
        this.opts.getReaderSettings &&
        (this.opts.eligibility.paragraph.pretextEligible ||
          this.opts.eligibility.heading.pretextEligible)
      ) {
        this.samplePretextDrift(blocks);
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
        blocks,
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
   * Compute Pretext predictions for sampled eligible blocks and feed them
   * to the drift guard. Mutates `this.opts.eligibility` on downgrade so
   * the next pass dispatches DOM for the downgraded kind. Emits a
   * `runtime-guard-downgrade` diagnostic per downgraded kind (D3-05).
   *
   * Walks the same selector list as domMeasurer (single read-phase already
   * complete above); reads element.textContent + content-box width per
   * sampled block. On any Pretext throw, emits measurement-error and
   * falls back to DOM for that block (V7 — never block reading).
   */
  private samplePretextDrift(domBlocks: BlockMeasurement[]): void {
    const getSettings = this.opts.getReaderSettings;
    const guard = this.opts.driftGuard;
    if (!getSettings || !guard) return;
    const settings = getSettings();
    const paragraphGeometry = fontStringFor("paragraph", 1, settings);
    // letterSpacingPx: parse the spacing preset's CSS (e.g. "0.01em" →
    // 0.01 × size). Pitfall 6: spacious ALSO writes wordSpacing 0.05em
    // which Pretext does NOT model — calibration must include spacious.
    const letterSpacingPx = letterSpacingPxForPreset(settings);

    const elements = Array.from(
      this.opts.articleEl.querySelectorAll<HTMLElement>(
        // Plan 05-05: exclude .page-fragment blocks (they carry data-block-
        // index for D5-08 capture but are a per-page slice, not the full
        // article set; including them would double-count + misalign the
        // drift guard's prediction-vs-DOM arrays).
        "[data-block-index]:not(.page-fragment [data-block-index])",
      ),
    );
    // Build parallel arrays of (prediction, domReference) for the kinds
    // currently eligible. The guard's sample() caps how many it actually
    // compares; we compute predictions for all eligible blocks so the
    // guard can pick the first N (the engine does not need to know N).
    const predictions: BlockMeasurement[] = [];
    const domReference: BlockMeasurement[] = [];
    for (let i = 0; i < elements.length && i < domBlocks.length; i++) {
      const el = elements[i]!;
      const dom = domBlocks[i]!;
      const kind = dom.kind;
      if (kind !== "paragraph" && kind !== "heading") continue;
      if (!this.opts.eligibility[kind].pretextEligible) continue;
      try {
        const text = el.textContent ?? "";
        if (!text) continue;
        const geom =
          kind === "heading"
            ? fontStringFor("heading", headingLevelFor(el), settings)
            : paragraphGeometry;
        const maxWidthPx = el.getBoundingClientRect().width;
        const prediction = measureParagraphWithBreaks({
          text,
          font: geom.font,
          letterSpacingPx,
          lineHeightPx: geom.lineHeightPx,
          maxWidthPx,
        });
        predictions.push({
          kind,
          heightPx: prediction.height,
          lineCount: prediction.lineCount,
          // Predictions are height/lineCount comparisons only — lineBoxes is
          // not part of the drift comparison; default to [] (the guard never
          // reads it). Required because BlockMeasurementSchema made the field
          // non-optional in the inferred type (Plan 04-06 schema evolution).
          lineBoxes: [],
        });
        domReference.push(dom);
      } catch (e) {
        // V7: Pretext threw for this block — emit + DOM-fallback.
        this.opts.diagnostics.emit({
          kind: "measurement-error",
          message: `pretext-sample: ${String(e)}`,
          ts: new Date().toISOString(),
        });
        // Implicitly fall through: this block was not added to predictions,
        // so the guard will not compare it. The committed result still
        // carries the DOM measurement for this block (computed above).
      }
    }
    if (predictions.length > 0) {
      guard.sample(predictions, domReference, this.opts.eligibility);
    }
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
