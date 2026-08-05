// src/measurement/driftGuard.ts
// RuntimeDriftGuard — D3-08: a build-time-only calibration fingerprint cannot
// see runtime drift (font fallback when a web font fails to load, canvas
// metric changes under a different OS, browser-version metric regressions).
// Because Plan 02 promotes Pretext from optional optimization to the PRIMARY
// measurement path for eligible kinds (D3-03), runtime self-correction is
// mandatory: a kind whose Pretext prediction drifts outside tolerance at
// runtime is downgraded Pretext→DOM and the downgrade is emitted as a
// diagnostic (D3-05 — never silently degrade).
//
// The guard samples up to `sampleSize` Pretext-measured blocks per pass and
// compares each prediction to a DOM reference (read by the engine via
// domMeasurer on the same pass). If ANY sampled block of a kind drifts
// beyond `tolerancePx`, the kind's `pretextEligible` flag is flipped to
// false for subsequent passes and a `runtime-guard-downgrade` diagnostic is
// emitted naming the kind and the observed drift.
//
// D3-08 discretion: sampling cadence + sample size + tolerance bound are the
// planner's call. RESEARCH Assumption A3 — the sample must be cheap enough
// not to defeat Pretext's performance purpose. The default sampleSize (5) is
// a starting heuristic; the engine invokes the guard once per measurement
// pass (already debounced by TriggerCoalescer's 400ms window — so the guard
// runs at most ~2.5×/sec under continuous rapid change, not on every frame).
//
// SHAPE NOTE: the DiagnosticEvent `runtime-guard-downgrade` variant uses the
// kebab-cased field name `"kind-downgraded"` (defined that way in
// src/measurement/types.ts Plan 01). The plan text mentioned `kindDowngraded`
// (camelCase) but the committed Zod schema is the source of truth — emit
// with `"kind-downgraded"` so DiagnosticBus.emit's V5 boundary parse passes.

import type { DiagnosticBus } from "./diagnostics";
import type { BlockMeasurement, EligibilityState } from "./types";

/** Constructor args for RuntimeDriftGuard. */
export interface RuntimeDriftGuardOptions {
  /** Max |dom.heightPx − prediction.heightPx| before a kind is downgraded. */
  tolerancePx: number;
  /** Where downgrade diagnostics are emitted (D3-05). */
  diagnostics: DiagnosticBus;
  /** Max blocks sampled per pass (RESEARCH Assumption A3 — keep cheap). */
  sampleSize?: number;
}

/**
 * RuntimeDriftGuard samples Pretext predictions against DOM references per
 * measurement pass and downgrades a kind Pretext→DOM when drift exceeds
 * tolerance.
 *
 * The guard is stateless across passes other than the EligibilityState it
 * mutates; the engine threads the (possibly-mutated) eligibility into the
 * next pass's chooseStrategy calls.
 */
export class RuntimeDriftGuard {
  private readonly tolerancePx: number;
  private readonly diagnostics: DiagnosticBus;
  private readonly sampleSize: number;

  constructor(opts: RuntimeDriftGuardOptions) {
    this.tolerancePx = opts.tolerancePx;
    this.diagnostics = opts.diagnostics;
    this.sampleSize = opts.sampleSize ?? 5;
  }

  /**
   * Compare up to `sampleSize` Pretext predictions to their DOM references.
   * Mutates `eligibility` in place when a kind drifts beyond tolerance and
   * emits one `runtime-guard-downgrade` diagnostic per downgraded kind
   * (D3-05 — never silently degrade). Returns the same eligibility object
   * (possibly mutated) for the engine to thread into the next pass.
   *
   * @param predictions Pretext-predicted measurements for blocks where
   *   chooseStrategy returned "pretext" this pass.
   * @param domReference DOM-measured truth for the same blocks (parallel
   *   array; matched by index).
   * @param eligibility The current EligibilityState; mutated on downgrade.
   */
  sample(
    predictions: BlockMeasurement[],
    domReference: BlockMeasurement[],
    eligibility: EligibilityState,
  ): EligibilityState {
    if (predictions.length !== domReference.length) {
      // Defensive: mismatched arrays mean the engine is mis-wired. Do not
      // silently mis-compare; emit a measurement-error diagnostic and skip
      // sampling this pass. (V7 — never throw to the reader.)
      this.diagnostics.emit({
        kind: "measurement-error",
        message: "driftGuard: predictions/domReference length mismatch",
        ts: new Date().toISOString(),
      });
      return eligibility;
    }

    // Track the worst drift per kind so we emit ONE diagnostic per
    // downgraded kind (not one per sampled block).
    const downgraded = new Map<"paragraph" | "heading", number>();

    let sampled = 0;
    for (let i = 0; i < predictions.length && sampled < this.sampleSize; i++) {
      const prediction = predictions[i]!;
      const dom = domReference[i]!;
      const kind = prediction.kind;
      // Only paragraph + heading can be Pretext-eligible (D3-01); only
      // sample those (the engine should not have produced predictions for
      // other kinds, but guard defensively).
      if (kind !== "paragraph" && kind !== "heading") continue;
      // Skip kinds already downgraded in a prior pass — no point sampling.
      if (!eligibility[kind].pretextEligible) continue;

      const drift = Math.abs(dom.heightPx - prediction.heightPx);
      if (drift > this.tolerancePx) {
        const prior = downgraded.get(kind) ?? 0;
        if (drift > prior) downgraded.set(kind, drift);
      }
      sampled += 1;
    }

    for (const [kind, drift] of downgraded) {
      eligibility[kind].pretextEligible = false;
      // The `kind-downgraded` field name matches the DiagnosticEventSchema
      // variant (kebab-case; see file header note). Emitting the canonical
      // `runtime-guard-downgrade` literal here satisfies the D3-05
      // substrate contract.
      this.diagnostics.emit({
        kind: "runtime-guard-downgrade",
        "kind-downgraded": kind,
        heightDriftPx: drift,
        ts: new Date().toISOString(),
      });
    }

    return eligibility;
  }
}
