// tests/e2e/perf/budget.compare.ts
// D6-04 ACPT-04 CI regression gate. Mirrors fingerprint.compare.ts skeleton
// EXACTLY: loadTempResults() → refuse-empty (exit 2) → aggregate → write the
// committed artifact → diff vs committed → process.exit(1) on regression →
// exit 0. The exit-code shape is identical to fingerprint.compare.ts; the
// diff swaps "Pretext-eligibility regression" for "measured p95 exceeds the
// locked wall-clock budget beyond the headroom tolerance".
//
// Invocation:
//   node tests/e2e/perf/budget.compare.ts
// (Node 22.22+ strips TypeScript type annotations natively; no transpile
// step needed — mirrors fingerprint.compare.ts L11 comment.)
//
// Exit codes:
//   0 — no regression (OR no locked budget to diff against: placeholder /
//       first-run path mirrors fingerprint.compare.ts L238-243).
//   1 — REGRESSION — a measured p95 exceeded the locked budget beyond the
//       headroom tolerance. THE CI GATE (D6-04, threat T-06-04).
//   2 — refuse to overwrite a real budget with empty temp data (the harness
//       did not run / wrote no samples). Mirrors fingerprint.compare.ts
//       L199-211 exactly.
//
// Usage in CI:
//   - On a PR: `npm run perf` (= `playwright test perf.harness && node
//     tests/e2e/perf/budget.compare.ts`) — fails the build if a measured
//     p95 exceeds the locked budget.
//   - To intentionally update the baseline after an approved budget change:
//     edit tests/e2e/perf/budget.json, commit, re-run npm run perf.
//
// Locked-budget vs placeholder discipline (D6-01 measure-first):
//   - The placeholder budget.json (Task 1) has empty engines + a rationale
//     containing "not yet measured" → first-run path: log + exit 0.
//   - The locked budget.json (Task 3, after user approval) carries real
//     numeric wallClockMs thresholds → diff path: regressions fire exit 1.
//
// Shape (mirrors calibration/fingerprint.json schema):

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();
const BUDGET_PATH = resolve(REPO_ROOT, "tests", "e2e", "perf", "budget.json");
const TMP_DIR = resolve(REPO_ROOT, ".perf-tmp");

// ── Types ───────────────────────────────────────────────────────────────────

interface PerfSample {
  fixture: string;
  profile: "desktop" | "throttled-mobile";
  engine: string;
  phase: "cold" | "warm";
  wallClockMs: number;
}

/** Per-cell locked budget + latest measurement metadata. */
interface BudgetCell {
  /** LOCKED wall-clock threshold (ms) — the gate compares p95 against this
   * times (1 + headroomPct/100). Undefined on the placeholder budget. */
  wallClockMs?: number;
  /** Latest measured p95 (refreshed each run; informational). */
  p95WallClockMs?: number;
  /** Latest sample count (refreshed each run; informational). */
  sampleCount?: number;
}
type Phase = "cold" | "warm";
interface Budget {
  schemaVersion: number;
  generatedAt?: string | null;
  toleranceBound?: { headroomPct?: number | null };
  rationale?: string;
  /** engines[engine][profile][fixture][phase] = BudgetCell */
  engines?: Record<
    string,
    Record<string, Record<string, Partial<Record<Phase, BudgetCell>>>>
  >;
}

// ── Aggregation ─────────────────────────────────────────────────────────────

interface CellAggregate {
  fixture: string;
  profile: string;
  engine: string;
  phase: Phase;
  p95: number;
  samples: number[];
}

/** Nearest-rank p95 — mirrors fingerprint.compare.ts L105-107 exactly. */
function p95(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
  return sorted[idx] ?? 0;
}

function aggregate(samples: readonly PerfSample[]): Map<string, CellAggregate> {
  const byCell = new Map<string, CellAggregate>();
  for (const s of samples) {
    const key = `${s.engine}|${s.profile}|${s.fixture}|${s.phase}`;
    const cell =
      byCell.get(key) ?? {
        fixture: s.fixture,
        profile: s.profile,
        engine: s.engine,
        phase: s.phase,
        p95: 0,
        samples: [],
      };
    cell.samples.push(s.wallClockMs);
    byCell.set(key, cell);
  }
  for (const cell of byCell.values()) {
    cell.p95 = p95(cell.samples);
  }
  return byCell;
}

// ── Main ────────────────────────────────────────────────────────────────────

function loadTempResults(): PerfSample[] {
  if (!existsSync(TMP_DIR)) return [];
  const out: PerfSample[] = [];
  for (const f of readdirSync(TMP_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const txt = readFileSync(resolve(TMP_DIR, f), "utf8");
      const arr = JSON.parse(txt) as PerfSample[];
      out.push(...arr);
    } catch {
      // ignore malformed/partial temp files (mirror fingerprint.compare.ts L160)
    }
  }
  return out;
}

function loadCommittedBudget(): Budget | null {
  if (!existsSync(BUDGET_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as Budget;
  } catch {
    return null;
  }
}

/** Build the engines shape from fresh measurements (for the artifact write). */
function buildEnginesShape(
  byCell: Map<string, CellAggregate>,
): NonNullable<Budget["engines"]> {
  const engines: NonNullable<Budget["engines"]> = {};
  for (const cell of byCell.values()) {
    const e = (engines[cell.engine] ??= {});
    const p = (e[cell.profile] ??= {});
    const f = (p[cell.fixture] ??= {});
    f[cell.phase] = {
      p95WallClockMs: cell.p95,
      sampleCount: cell.samples.length,
    };
  }
  return engines;
}

/** Merge locked thresholds (committed) into the fresh engines shape. */
function mergeLockedThresholds(
  fresh: NonNullable<Budget["engines"]>,
  committed: NonNullable<Budget["engines"]>,
): NonNullable<Budget["engines"]> {
  for (const [engine, profiles] of Object.entries(committed)) {
    for (const [profile, fixtures] of Object.entries(profiles ?? {})) {
      for (const [fixture, phases] of Object.entries(fixtures ?? {})) {
        for (const [phase, cell] of Object.entries(phases ?? {})) {
          if (!cell || typeof cell.wallClockMs !== "number") continue;
          const f = ((fresh[engine] ??= {})[profile] ??= {})[fixture] ??= {};
          const existing = f[phase as Phase];
          f[phase as Phase] = {
            wallClockMs: cell.wallClockMs,
            p95WallClockMs: existing?.p95WallClockMs,
            sampleCount: existing?.sampleCount,
          };
        }
      }
    }
  }
  return fresh;
}

function printP95Table(byCell: Map<string, CellAggregate>): void {
  const rows = [...byCell.values()].sort((a, b) => {
    if (a.engine !== b.engine) return a.engine.localeCompare(b.engine);
    if (a.profile !== b.profile) return a.profile.localeCompare(b.profile);
    if (a.fixture !== b.fixture) return a.fixture.localeCompare(b.fixture);
    return a.phase.localeCompare(b.phase);
  });
  console.log("[perf] measured p95 wall-clock (ms):");
  console.log(
    "  engine    | profile          | fixture          | phase |    p95 | n",
  );
  console.log(
    "  ----------|------------------|------------------|-------|--------|---",
  );
  for (const r of rows) {
    console.log(
      `  ${r.engine.padEnd(9)} | ${r.profile.padEnd(17)} | ${r.fixture.padEnd(17)} | ${r.phase.padEnd(5)} | ${String(r.p95).padStart(6)} | ${r.samples.length}`,
    );
  }
}

/** A budget is "locked" iff it has at least one numeric wallClockMs cell
 * AND its rationale does not declare measurement pending. (Plain boolean —
 * no type predicate; the caller narrows via explicit null check so the
 * placeholder path can still read `committed?.rationale` without TS
 * over-narrowing to `never`.) */
function isLockedBudget(b: Budget | null): boolean {
  if (!b || !b.engines) return false;
  if ((b.rationale ?? "").includes("not yet measured")) return false;
  for (const profiles of Object.values(b.engines)) {
    for (const fixtures of Object.values(profiles ?? {})) {
      for (const phases of Object.values(fixtures ?? {})) {
        for (const cell of Object.values(phases ?? {})) {
          if (cell && typeof cell.wallClockMs === "number") return true;
        }
      }
    }
  }
  return false;
}

interface Regression {
  engine: string;
  profile: string;
  fixture: string;
  phase: Phase;
  measured: number;
  budget: number;
  allowed: number;
}

function findRegressions(
  byCell: Map<string, CellAggregate>,
  committed: Budget,
  headroomPct: number,
): Regression[] {
  const out: Regression[] = [];
  if (!committed.engines) return out;
  for (const [engine, profiles] of Object.entries(committed.engines)) {
    for (const [profile, fixtures] of Object.entries(profiles ?? {})) {
      for (const [fixture, phases] of Object.entries(fixtures ?? {})) {
        for (const phase of ["cold", "warm"] as const) {
          const cell = phases?.[phase];
          if (!cell || typeof cell.wallClockMs !== "number") continue;
          const fresh = byCell.get(`${engine}|${profile}|${fixture}|${phase}`);
          if (!fresh) continue; // cell not measured this run — skip (not a regression)
          const allowed = cell.wallClockMs * (1 + headroomPct / 100);
          if (fresh.p95 > allowed) {
            out.push({
              engine,
              profile,
              fixture,
              phase,
              measured: fresh.p95,
              budget: cell.wallClockMs,
              allowed: Math.round(allowed),
            });
          }
        }
      }
    }
  }
  return out;
}

function main(): void {
  const freshSamples = loadTempResults();
  if (freshSamples.length === 0) {
    // Refuse-empty guard — mirror fingerprint.compare.ts L199-211 exactly.
    // The harness did not run (or wrote no samples). Do NOT overwrite the
    // committed budget; surface the error so CI catches a misconfigured
    // `npm run perf` step.
    console.error(
      "[perf] no per-project results in .perf-tmp/ — did the harness run?",
    );
    console.error(
      "[perf] refusing to overwrite tests/e2e/perf/budget.json with empty data",
    );
    console.error("[perf] D6-04 gate SKIPPED (no fresh data)");
    process.exit(2);
  }

  const byCell = aggregate(freshSamples);
  printP95Table(byCell);

  const enginesPresent = new Set([...byCell.values()].map((c) => c.engine));
  const freshEnginesShape = buildEnginesShape(byCell);

  // Load the committed budget BEFORE any write so the diff compares fresh
  // measurements against the ORIGINAL committed thresholds, not the file we
  // are about to overwrite. (This is the correct ordering — the gate must
  // see the locked baseline, then refresh.)
  const committed = loadCommittedBudget();

  if (!isLockedBudget(committed)) {
    // Placeholder / first-run path — mirror fingerprint.compare.ts L238-243.
    // Regenerate the artifact with the fresh engines shape so generatedAt +
    // sample counts are honest across runs, then exit 0 (no gate yet).
    const placeholder: Budget = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      toleranceBound: { headroomPct: committed?.toleranceBound?.headroomPct ?? null },
      rationale:
        committed?.rationale ??
        "Placeholder budget — thresholds not yet measured. Run npm run perf, propose p95 + headroom, get user approval (D6-01), then lock thresholds in Task 3.",
      engines: freshEnginesShape,
    };
    mkdirSync(resolve(BUDGET_PATH, ".."), { recursive: true });
    writeFileSync(BUDGET_PATH, JSON.stringify(placeholder, null, 2) + "\n", "utf8");
    console.log(
      `[perf] wrote ${BUDGET_PATH} (${freshSamples.length} samples, engines: ${[...enginesPresent].join(", ") || "none"})`,
    );
    console.log(
      "[perf] no locked budget to diff against (placeholder / first run); exit 0",
    );
    process.exit(0);
  }

  // Locked-budget path — the D6-04 CI gate. Diff fresh p95 vs committed
  // LOCKED thresholds (scaled by 1 + headroomPct/100). isLockedBudget
  // guarantees committed is non-null + has at least one numeric cell.
  if (!committed) {
    // Unreachable given isLockedBudget returned true above; surface as an
    // internal error rather than masquerading as refuse-empty or regression.
    throw new Error(
      "[perf] internal error: locked-budget path reached with null committed",
    );
  }
  const headroomPct = committed.toleranceBound?.headroomPct ?? 0;
  const regressions = findRegressions(byCell, committed, headroomPct);

  if (regressions.length > 0) {
    console.error(
      `[perf] D6-04 REGRESSION — measured p95 exceeded budget (headroomPct=${headroomPct}%):`,
    );
    for (const r of regressions) {
      console.error(
        `  - ${r.engine}/${r.profile}/${r.fixture}/${r.phase}: measured ${r.measured}ms > budget ${r.budget}ms (allowed ${r.allowed}ms)`,
      );
    }
    console.error(
      "If this is intentional (e.g. a new worst-case fixture), update tests/e2e/perf/budget.json and commit the new baseline.",
    );
    // D6-04 — the regression fails the build. process.exit(1) is the CI gate.
    process.exit(1);
  }

  // No regression — refresh the artifact (preserve locked thresholds +
  // rationale; update measured p95 + sampleCount + generatedAt so the file
  // stays honest about the latest run). Mirrors fingerprint.compare.ts
  // L224-230 regenerating the committed artifact after a passing gate.
  const committedEngines = committed.engines ?? {};
  const refreshed: Budget = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toleranceBound: committed.toleranceBound,
    rationale: committed.rationale,
    engines: mergeLockedThresholds(freshEnginesShape, committedEngines),
  };
  writeFileSync(BUDGET_PATH, JSON.stringify(refreshed, null, 2) + "\n", "utf8");
  console.log(
    `[perf] wrote ${BUDGET_PATH} (${freshSamples.length} samples, engines: ${[...enginesPresent].join(", ") || "none"})`,
  );
  console.log("[perf] D6-04 gate PASSED — all measured p95 within budget");
  process.exit(0);
}

main();
