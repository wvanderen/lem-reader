// src/measurement/epoch.ts
// Monotonic epoch counter paired with an AbortController (PAGE-07 + D3-07).
//
// Each new trigger (viewport resize, typography change, font swap, asset
// load) calls bump(), which (a) aborts the previous controller — cancelling
// any in-flight measurement for older constraints — and (b) returns a fresh
// epoch number + AbortSignal. The engine captures the epoch at start and,
// before committing to the trusted view, checks isCurrent(captured); if a
// newer trigger has bumped past it, the late result is dropped at the commit
// guard (never replaces the trusted view).
//
// Structured upgrade of the cancelled-flag pattern at
// src/routes/ArticleView.tsx L93–117 (and SettingsContext L81–105). The
// boolean flag is the simpler form for short single-shot loads; the Epoch
// is for long-running measurement where multiple generations may race
// (RESEARCH §Architecture Patterns 2).
//
// AbortController is Baseline-widely-available (MDN) — first introduction in
// this codebase (grep-verified in 03-PATTERNS.md). No polyfill required.
//
// (Controller is inline-initialized — `private controller = new
// AbortController()` — NOT definite-assignment `!`. PATTERNS §LOW-risk
// note: definite-assignment is reserved for framework-owned late-init
// properties like Dexie's store handles. The Epoch's controller is always
// present from construction.)
//
// AbortError (the sentinel for cancelled measurement) lives in fontGate.ts —
// the engine imports it from there to classify catch-path errors.

/**
 * Epoch — a monotonic counter + AbortController. The single source of
 * "what is the newest in-flight measurement" so the commit guard can drop
 * stale results (PAGE-07).
 */
export class Epoch {
  private epochCount = 0;
  private controller = new AbortController();

  /**
   * Cancel in-flight work for the previous epoch and start a new one.
   * Returns the new epoch number and a fresh AbortSignal that the engine
   * threads through the font gate + DOM measurer.
   */
  bump(): { epoch: number; signal: AbortSignal } {
    this.controller.abort(); // cancel in-flight (D3-07)
    this.controller = new AbortController();
    this.epochCount += 1;
    return { epoch: this.epochCount, signal: this.controller.signal };
  }

  /**
   * True iff `candidate` is the newest epoch. The engine's commit guard
   * calls this with the epoch captured at run() start; a false return means
   * a newer trigger has invalidated this work and the result MUST be
   * dropped (PAGE-07 — late epoch cannot win).
   */
  isCurrent(candidate: number): boolean {
    return candidate === this.epochCount;
  }

  /** The newest epoch number issued so far (0 before any bump). */
  current(): number {
    return this.epochCount;
  }
}
