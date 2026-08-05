// src/measurement/triggers.ts
// TriggerCoalescer — subscribes to all four measurement-trigger sources and
// emits a coalesced Constraints snapshot + a fresh epoch on every debounced
// fire (D3-07). Mirrors the project's listener+cleanup discipline
// (SettingsContext L154–165, useScrollSave L172–214): passive listeners,
// ref-stable closures, dual-flush cleanup on disconnect().
//
// Trigger sources (locked by Phase 3 SC1 — all four are in scope):
//   1. ResizeObserver on articleEl content box — viewport reflow.
//   2. SettingsContext (consumed via the `getSettings` callback the hook
//      layer passes in — the coalescer receives a fresh snapshot on every
//      fire; the React layer wires a settings-change listener that calls
//      `scheduleTrigger()` so typography changes are observed here too).
//   3. document.fonts — re-await `.ready` and fire when the font set changes
//      (D3-06 — the same primitive awaitFontsReady uses; here we OBSERVE a
//      change rather than gate on it).
//   4. articleEl "load" event (capture) — bubbling img load from <figure>.
//
// RESEARCH §Common Pitfalls 1 (ResizeObserver loop): NEVER write
// measurement-derived geometry back to the observed element synchronously —
// write to async React state, or defer via requestAnimationFrame (the
// rAF-defer pattern in ArticleView L142–160 is the geometry-write
// mitigation if ever needed). The coalescer only schedules a debounced
// trigger; the engine's commit lands in React state via useMeasurement.
//
// The 400ms default matches the project precedent (SAVE_DEBOUNCE_MS in
// SettingsContext L58 — D3-07 discretion explicitly cites "Phase 2's 400ms
// precedent"). Tunable via constructor for tests.

import type { ReaderSettings } from "../content/schema";
import type { Constraints } from "./types";
import { Epoch } from "./epoch";

/** Project precedent for a debounce window on user-driven change (D3-07). */
export const DEBOUNCE_MS = 400;

export interface TriggerCoalescerOptions {
  articleEl: HTMLElement;
  /** Read the latest settings snapshot (the hook wires this to useSettings). */
  getSettings: () => ReaderSettings;
  /** Invoked on every coalesced trigger with a fresh Constraints + epoch. */
  onTrigger: (constraints: Constraints, epoch: number, signal: AbortSignal) => void;
  /** Override the 400ms default (tests only). */
  debounceMs?: number;
}

/**
 * TriggerCoalescer owns the per-article Epoch and the four trigger-source
 * subscriptions. Constructed by useMeasurement; `disconnect()` is the
 * cleanup path on article swap / unmount.
 */
export class TriggerCoalescer {
  private readonly opts: Required<Omit<TriggerCoalescerOptions, "onTrigger" | "getSettings" | "articleEl">> &
    Pick<TriggerCoalescerOptions, "onTrigger" | "getSettings" | "articleEl">;
  private readonly epoch = new Epoch();
  private timer: number | null = null;
  private readonly resizeObserver: ResizeObserver;
  private disconnected = false;

  constructor(opts: TriggerCoalescerOptions) {
    this.opts = {
      articleEl: opts.articleEl,
      getSettings: opts.getSettings,
      onTrigger: opts.onTrigger,
      debounceMs: opts.debounceMs ?? DEBOUNCE_MS,
    };

    // (1) ResizeObserver — Pitfall 1: never write geometry back synchronously.
    // We only schedule a debounced trigger; the engine reads layout on its
    // own turn, never writing back into articleEl during the RO callback.
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleTrigger();
    });
    this.resizeObserver.observe(opts.articleEl);

    // (4) Figure <img> load (capture so it catches the bubbling img load).
    opts.articleEl.addEventListener("load", this.boundSchedule, true);

    // (3) document.fonts — observe a font-set change by re-awaiting `.ready`
    // in a loop. D3-06 anti-pattern: do NOT rely on `onloadingdone` (NOT
    // Baseline). Re-awaiting `.ready` is the portable primitive.
    this.startFontsWatcher();
  }

  /** External hook for the React layer to signal a settings change. */
  notifySettingsChange(): void {
    this.scheduleTrigger();
  }

  /** Schedule a debounced fire (coalesces a burst into one trigger). */
  private scheduleTrigger(): void {
    if (this.disconnected) return;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.fire();
    }, this.opts.debounceMs);
  }

  /** Build a fresh Constraints snapshot and bump the epoch for the engine. */
  private fire(): void {
    if (this.disconnected) return;
    const settings = this.opts.getSettings();
    const { epoch: epochNum, signal } = this.epoch.bump();
    const constraints: Constraints = {
      font: settings.font,
      size: settings.size,
      measure: settings.measure,
      spacing: settings.spacing,
      viewportWidthPx: this.measureViewportWidth(),
      lang: this.opts.articleEl.lang || "en",
    };
    this.opts.onTrigger(constraints, epochNum, signal);
  }

  /**
   * Read the article element's content-box width (the geometry the engine
   * measures against). Reads layout but does not WRITE it — Pitfall 1 holds.
   */
  private measureViewportWidth(): number {
    // getBoundingClientRect on the article itself (the content-box the
    // reader sees); fractional but Constraints.viewportWidthPx only needs
    // to be positive per the schema.
    return this.opts.articleEl.getBoundingClientRect().width;
  }

  /**
   * Observe document.fonts by re-awaiting `.ready` in a loop until
   * disconnect. Each resolution is a potential font-set change → schedule.
   * The loop exits via the `disconnected` flag.
   */
  private async startFontsWatcher(): Promise<void> {
    try {
      while (!this.disconnected) {
        await document.fonts.ready;
        if (this.disconnected) return;
        this.scheduleTrigger();
      }
    } catch {
      // document.fonts.ready does not reject in practice; defend silently.
    }
  }

  private readonly boundSchedule = (): void => this.scheduleTrigger();

  /**
   * Tear down all four subscriptions + the debounce timer. Idempotent —
   * safe to call from a React cleanup effect that may run twice under
   * StrictMode. Mirrors useScrollSave L204–214 cleanup discipline.
   */
  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.resizeObserver.disconnect();
    this.opts.articleEl.removeEventListener("load", this.boundSchedule, true);
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    // Cancel any in-flight epoch so the engine's awaitFontsReady rejects.
    this.epoch.bump();
  }
}
