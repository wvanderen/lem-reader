// src/measurement/engine.ts
// MeasurementEngine — orchestrates the staleness-safe pipeline:
//
//   bump (epoch) → fontGate (await .ready) → measureAllBlocks (DOM read) →
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
//   in Plan 01 every kind returns "dom" — the Pretext branch is wired in
//   Plan 02 (textMeasurer.ts owns the @chenglou/pretext import).

import type { CanonicalArticle } from "../content/types";
import type {
  Constraints,
  EligibilityState,
  MeasurementResult,
} from "./types";
import { Epoch } from "./epoch";
import { AbortError, awaitFontsReady } from "./fontGate";
import type { DiagnosticBus } from "./diagnostics";
import { measureAllBlocks } from "./domMeasurer";

/** DOM-only eligibility default for Plan 01 (Plan 02 seeds from the fingerprint). */
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
  /** Defaults to DOM-only (Plan 01); Plan 02 seeds from the fingerprint. */
  eligibility?: EligibilityState;
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
  };
  private readonly epoch = new Epoch();
  private trustedHandler: ((result: MeasurementResult) => void) | null = null;

  constructor(opts: MeasurementEngineOptions) {
    this.opts = {
      article: opts.article,
      articleEl: opts.articleEl,
      diagnostics: opts.diagnostics,
      eligibility: opts.eligibility ?? DEFAULT_ELIGIBILITY,
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
      const blocks = measureAllBlocks(this.opts.articleEl, signal);
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
        schemaVersion: 1,
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
 * Choose the measurement strategy for a block kind. Exhaustive switch — NO
 * default branch — so TypeScript flags any missing case at compile time
 * (Pattern F, mirrors BlockRenderer.tsx L21–113). Plan 01 returns "dom"
 * for every kind; Plan 02 routes paragraph + heading to "pretext" when
 * the calibration fingerprint marked them eligible.
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
