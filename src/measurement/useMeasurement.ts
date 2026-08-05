// src/measurement/useMeasurement.ts
// React binding for the staleness-safe measurement pipeline. Exact role-
// match to src/reader/useScrollSave.ts (the project's first custom hook):
//   - called unconditionally (rules of hooks); no-ops during article loading
//   - ref-stable closures via refs (articleRef / settingsRef)
//   - registers + tears down its engine + coalescer in a single effect
//   - cleanup on article swap / unmount cancels in-flight work
//
// PAGE-06 (last-valid-view retention): the `trustedView` state IS the last
// valid view. It is replaced ONLY by a MeasurementResult that survived the
// font gate (D3-06) AND the epoch commit guard (PAGE-07) inside the engine.
// While a measurement is in-flight, the previously-committed view stays
// mounted — no blank flash.
//
// D3-04 (invisible by default): the hook writes NOTHING to the `.status`
// live region. Measurement is infrastructure; the reader-visible payoff
// (paginated mode) lands in Phase 4. In scrolling mode the engine runs
// but its visible effect is the reflow the scrolling view already does
// via applyTheme (Phase 2's live-apply).
//
// Returns the trusted view (or null before the first commit) so Phase 4's
// paginated mode can render from it. ArticleView in Phase 3 ignores the
// return value — it keeps rendering `<ArticleBody>` directly.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalArticle } from "../content/types";
import { useSettings } from "../settings/SettingsContext";
import { DiagnosticBus } from "./diagnostics";
import { MeasurementEngine } from "./engine";
import { TriggerCoalescer } from "./triggers";
import { deriveEligibilityFromFingerprint } from "./fingerprint";
import { RuntimeDriftGuard } from "./driftGuard";
import type { MeasurementResult } from "./types";

/**
 * The runtime drift tolerance bound (D3-08 discretion). Mirrors the
 * committed fingerprint's toleranceBound.heightDriftPx when present, else
 * the conservative 1.0px starting heuristic from RESEARCH §Open Question 2.
 * A defensible bound: a 1px font-size perturbation must cross it; the
 * corpus's clean cells must sit well inside it.
 */
const RUNTIME_DRIFT_TOLERANCE_PX = 1.0;
/** Sample size for the runtime drift guard (RESEARCH Assumption A3). */
const RUNTIME_DRIFT_SAMPLE_SIZE = 5;

/**
 * useMeasurement(article, articleElRef) — mount the trust pipeline.
 *
 * @param article The canonical article, or null during loading (the hook
 *   no-ops; ArticleView must call hooks unconditionally).
 * @param articleElRef Ref to the rendered <article> DOM node (the callback-
 *   ref + state seam from ArticleView L73–85 — same ref useScrollSave +
 *   SectionAnnouncer consume).
 * @returns The trusted view (last committed MeasurementResult) or null
 *   before the first commit / during loading.
 */
export function useMeasurement(
  article: CanonicalArticle | null,
  articleElRef: RefObject<HTMLElement | null>,
): MeasurementResult | null {
  const { settings } = useSettings();
  const [trustedView, setTrustedView] = useState<MeasurementResult | null>(null);

  // Refs so effect closures stay stable without re-running on every settings
  // change (mirrors useScrollSave L77–80 + SettingsContext pendingRef pattern).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The coalescer lives in a ref so the settings-change effect can signal
  // it without recreating it (the article-mount effect owns construction
  // + teardown; the settings effect only calls notifySettingsChange).
  const coalescerRef = useRef<TriggerCoalescer | null>(null);

  // One diagnostic bus per mount — Phase 4 will surface recent(); Phase 3
  // only emits into it. Created once (lazy init via useRef).
  const diagnosticsRef = useRef<DiagnosticBus | null>(null);
  if (diagnosticsRef.current === null) {
    diagnosticsRef.current = new DiagnosticBus();
  }

  // Mount: construct engine + coalescer; tear down on article swap / unmount.
  useEffect(() => {
    if (!article) return; // loading — no measurement
    const articleEl = articleElRef.current;
    if (!articleEl) return; // article element not mounted yet
    const diagnostics = diagnosticsRef.current!;
    // Seed eligibility from the committed calibration fingerprint
    // (D3-08). When the fingerprint is empty/malformed (initial placeholder
    // before the calibration harness runs), this returns all-false → DOM-
    // only measurement, the safe D3-03 fallback. The runtime drift guard
    // below further corrects at runtime.
    const eligibility = deriveEligibilityFromFingerprint();
    // The drift guard is constructed once per mount and shared with the
    // engine. The guard samples Pretext predictions vs DOM references each
    // pass; on drift it mutates the eligibility object in place (flips
    // pretextEligible → false) and emits a runtime-guard-downgrade
    // diagnostic (D3-05). Only construct when at least one kind is seeded
    // eligible — otherwise no Pretext work happens and the guard is dead
    // weight (saves the per-block text walk on every measurement pass).
    const anyEligible =
      eligibility.paragraph.pretextEligible ||
      eligibility.heading.pretextEligible;
    const driftGuard = anyEligible
      ? new RuntimeDriftGuard({
          tolerancePx: RUNTIME_DRIFT_TOLERANCE_PX,
          diagnostics,
          sampleSize: RUNTIME_DRIFT_SAMPLE_SIZE,
        })
      : undefined;
    const engine = new MeasurementEngine({
      article,
      articleEl,
      diagnostics,
      eligibility,
      driftGuard,
      getReaderSettings: () => settingsRef.current,
    });
    const unsubTrusted = engine.onTrusted((result) => {
      setTrustedView(result);
      // DEV-only debug hook for the PAGE-07 e2e (stale-drop.spec.ts).
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints =
          result.constraints;
      }
    });
    const coalescer = new TriggerCoalescer({
      articleEl,
      getSettings: () => settingsRef.current,
      onTrigger: (constraints) => {
        // Fire-and-forget — the engine's commit guard drops stale results.
        void engine.run(constraints);
      },
    });
    coalescerRef.current = coalescer;
    return () => {
      coalescerRef.current = null;
      unsubTrusted();
      coalescer.disconnect();
      engine.cancel();
    };
    // article + the articleEl snapshot drive (re)mount. settings changes
    // are observed via settingsRef + the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, articleElRef.current]);

  // Typography trigger source — signal the existing coalescer on every
  // settings change. The coalescer debounces; the engine's epoch guard
  // drops stale work. (Stable across re-renders — the coalescer is in a ref.)
  useEffect(() => {
    coalescerRef.current?.notifySettingsChange();
  }, [settings]);

  return trustedView;
}
