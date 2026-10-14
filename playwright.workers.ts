// playwright.workers.ts
// Issue #185 — the functional suites' quiet-load-aware worker cap.
//
// The reference box is shared: it runs this repo's self-hosted runner AND
// ordinary multi-user work (docs/agents/test-discipline.md). Two operating
// points are documented in playwright.config.ts's worker-cap note:
//
//   - LOADED → 3 workers. The 13-10 honest-gate cap. The historical
//     moving-target starvation class (late-suite webkit contexts starved on
//     the single Vite dev server's module fetches under load 6–10)
//     converged at this concurrency; every green reference gate since has
//     run with it.
//   - QUIET → cores/2 capped at 5. The pre-cap default that ran for months
//     on the 10-core reference Mac before the cap; the starvation class was
//     observed only under load, never on a quiet box. The #185
//     under-ten-minute PR-gate goal is unreachable at 3 workers (best
//     serialized quiet evidence: 27.0m wall for 4.8k worker-seconds), so a
//     genuinely quiet window re-raises concurrency to the known-good shape.
//
// "Genuinely quiet" operationalizes the issue's "load < ~3 held for the
// whole suite": a full run spans many minutes, so BOTH the 1- and 5-minute
// load averages must sit under QUIET_LOAD_THRESHOLD at startup. A settling
// window (1-min under, 5-min still at/above) stays at the loaded cap — the
// 2026-10-14 03:26 gate dispatched at 1-min 2.89 / 5-min 3.26 and its
// webkit tail still hit 60-120s budget ceilings. The decision is made once
// when the config is evaluated (load at startup is the best predictor;
// the suite's own load is expected and was the historical quiet shape).
// `--workers=N` still overrides the config for one-off calibration of the
// cap itself.
//
// Pure function on purpose: tests/unit/worker-cap.test.ts pins both
// operating points against the recorded dispatch loads.

/** Below this 1- AND 5-minute load average the box counts as quiet. */
export const QUIET_LOAD_THRESHOLD = 3;

/** Quiet ceiling — the pre-cap default on the 10-core reference machine. */
export const MAX_QUIET_WORKERS = 5;

/** The loaded cap every green reference gate has run with since 13-10. */
export const LOADED_WORKERS = 3;

export function planWorkers(cores: number, load1min: number, load5min: number): number {
  const halfCores = Math.max(1, Math.floor(cores / 2));
  const quiet = load1min < QUIET_LOAD_THRESHOLD && load5min < QUIET_LOAD_THRESHOLD;
  if (!quiet) return Math.min(LOADED_WORKERS, halfCores);
  return Math.min(MAX_QUIET_WORKERS, halfCores);
}
