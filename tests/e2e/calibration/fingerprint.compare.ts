// tests/e2e/calibration/fingerprint.compare.ts
// D3-10 CI regression gate. Loads the committed calibration/fingerprint.json,
// reads the per-engine results written by the calibration harness to
// .calibration-tmp/<engine>.json, merges them into a fresh fingerprint, and
// exits 1 if a previously-eligible kind regressed (became ineligible in the
// fresh run). A newly-eligible kind is NOT a regression (improvement); a
// previously-ineligible kind staying ineligible is NOT a regression.
//
// Invocation:
//   node tests/e2e/calibration/fingerprint.compare.ts
// (Node 22.22+ strips TypeScript type annotations natively; no transpile
// step needed. CI invokes this AFTER `npm run calibrate` writes the temp
// files; it also re-writes calibration/fingerprint.json with the fresh
// merged result so subsequent runs diff against the new baseline.)
//
// Exit codes:
//   0 — no regression (or no committed fingerprint to diff against; first run)
//   1 — a previously-eligible (engine, kind) is now ineligible (REGRESSION)
//
// Usage in CI:
//   - On a PR: `npm run calibrate` then `node tests/e2e/calibration/fingerprint.compare.ts`
//     — fails the build if a Pretext-eligible kind regressed.
//   - To intentionally update the baseline after an approved eligibility
//     change (e.g. a new Pretext version widens eligibility): re-run
//     calibrate, then commit the regenerated calibration/fingerprint.json.
//
// Shape (mirrors the fingerprint.ts loader in src/measurement):

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();
const FINGERPRINT_PATH = resolve(REPO_ROOT, "calibration", "fingerprint.json");
const TMP_DIR = resolve(REPO_ROOT, ".calibration-tmp");

// ── Types (mirror src/measurement/fingerprint.ts) ───────────────────────────

interface CellAggregate {
  eligible: boolean;
  heightDriftP95: number;
  breaksMatchRatio: number;
  sampleCount: number;
}
interface EngineRows {
  [fixtureId: string]: {
    [variantKey: string]: {
      paragraph?: CellAggregate;
      heading?: CellAggregate;
    };
  };
}
interface Fingerprint {
  schemaVersion: number;
  generatedAt?: string;
  toleranceBound?: { heightDriftPx?: number; breaksExact?: boolean };
  rationale?: string;
  engines?: Record<string, EngineRows>;
}
interface BlockResult {
  fixtureId: string;
  variantKey: string;
  kind: "paragraph" | "heading";
  level?: number;
  engine: string;
  heightDrift: number;
  breaksMatch: boolean;
}

// ── Aggregation (mirror calibration.harness.ts semantics) ───────────────────

const TOLERANCE_PX = 1.0;
const ELIGIBILITY_THRESHOLD = 0.95;

function aggregate(results: readonly BlockResult[]): Record<string, EngineRows> {
  const byEngine: Record<string, EngineRows> = {};
  // Per-cell raw accumulators (separate from final CellAggregate).
  interface CellRaw {
    heightDriftSamples: number[];
    breaksMatches: number;
    total: number;
  }
  const rawByCell = new Map<string, CellRaw>();
  for (const r of results) {
    const key = `${r.engine}|${r.fixtureId}|${r.variantKey}|${r.kind}`;
    const cell = rawByCell.get(key) ?? {
      heightDriftSamples: [],
      breaksMatches: 0,
      total: 0,
    };
    cell.heightDriftSamples.push(Math.abs(r.heightDrift));
    cell.breaksMatches += r.breaksMatch ? 1 : 0;
    cell.total += 1;
    rawByCell.set(key, cell);
  }
  for (const [key, raw] of rawByCell) {
    const [engine, fixtureId, variantKey, kind] = key.split("|") as [
      string,
      string,
      string,
      "paragraph" | "heading",
    ];
    const e = (byEngine[engine] ??= {});
    const f = (e[fixtureId] ??= {});
    const v = (f[variantKey] ??= {});
    const sorted = [...raw.heightDriftSamples].sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
    const p95 = sorted[p95Idx] ?? 0;
    const breaksRatio = raw.breaksMatches / raw.total;
    const eligible = p95 <= TOLERANCE_PX && breaksRatio >= 1.0;
    v[kind] = {
      eligible,
      heightDriftP95: p95,
      breaksMatchRatio: breaksRatio,
      sampleCount: raw.total,
    };
  }
  return byEngine;
}

/**
 * Derive per-engine per-kind eligibility aggregates at the (engine, kind)
 * level. A kind is engine-eligible iff ≥ ELIGIBILITY_THRESHOLD fraction of
 * its cells pass AND every (font × spacing) combination for that kind has
 * at least one passing (size × measure) cell (Pitfalls 5/6 — a kind
 * failing only under sans or spacious is conditionally ineligible, recorded
 * per cell but flagged in the rationale).
 */
function engineKindEligibility(
  engine: EngineRows,
  kind: "paragraph" | "heading",
): { eligible: boolean; passingFraction: number } {
  let total = 0;
  let passing = 0;
  for (const fixture of Object.values(engine)) {
    for (const variant of Object.values(fixture)) {
      const cell = variant[kind];
      if (!cell) continue;
      total += 1;
      if (cell.eligible) passing += 1;
    }
  }
  if (total === 0) return { eligible: false, passingFraction: 0 };
  return {
    eligible: passing / total >= ELIGIBILITY_THRESHOLD,
    passingFraction: passing / total,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function loadTempResults(): BlockResult[] {
  if (!existsSync(TMP_DIR)) return [];
  const out: BlockResult[] = [];
  for (const f of readdirSync(TMP_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const txt = readFileSync(resolve(TMP_DIR, f), "utf8");
      const arr = JSON.parse(txt) as BlockResult[];
      out.push(...arr);
    } catch {
      // ignore malformed/partial temp files
    }
  }
  return out;
}

function loadCommittedFingerprint(): Fingerprint | null {
  if (!existsSync(FINGERPRINT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(FINGERPRINT_PATH, "utf8")) as Fingerprint;
  } catch {
    return null;
  }
}

function buildRationale(
  results: readonly BlockResult[],
  enginesPresent: readonly string[],
): string {
  if (results.length === 0) {
    return "Placeholder fingerprint (DOM-only seed). No calibration data recorded yet — the engine measures via domMeasurer; no Pretext fast path is enabled. Re-run npm run calibrate to populate this artifact.";
  }
  const cells = `${results.length} block samples across ${enginesPresent.join("/")} engines`;
  return `Calibration run with tolerance heightDriftPx<=${TOLERANCE_PX} AND breaks exact. Per-(engine,fixture,variant,kind) eligibility recorded; per-cell eligibility may legitimately differ across fonts/spacings (Pitfalls 5: system-ui in sans unsafe on macOS; 6: wordSpacing unmodeled under spacious). A kind is engine-eligible iff >= ${ELIGIBILITY_THRESHOLD * 100}% of its cells pass. Derived from ${cells}.`;
}

function normalizeEngines(
  byEngine: Record<string, EngineRows>,
): Record<string, EngineRows> {
  const out: Record<string, EngineRows> = {};
  for (const engine of ["chromium", "firefox", "webkit"]) {
    out[engine] = byEngine[engine] ?? {};
  }
  return out;
}

function main(): void {
  const freshResults = loadTempResults();
  if (freshResults.length === 0) {
    // No fresh calibration data — the harness did not run (or wrote no
    // samples). Do NOT overwrite the committed fingerprint; surface the
    // error so CI catches a misconfigured calibrate step.
    console.error(
      "[calibration] no per-engine results in .calibration-tmp/ — did the harness run?",
    );
    console.error(
      "[calibration] refusing to overwrite calibration/fingerprint.json with empty data",
    );
    console.error("[calibration] D3-10 gate SKIPPED (no fresh data)");
    process.exit(2);
  }
  const freshByEngine = normalizeEngines(aggregate(freshResults));
  const enginesPresent = Object.keys(freshByEngine).filter(
    (e) => Object.keys(freshByEngine[e] ?? {}).length > 0,
  );
  const freshFingerprint: Fingerprint = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toleranceBound: { heightDriftPx: TOLERANCE_PX, breaksExact: true },
    rationale: buildRationale(freshResults, enginesPresent),
    engines: freshByEngine,
  };

  // Write the fresh fingerprint (regenerate the committed artifact).
  mkdirSync(resolve(FINGERPRINT_PATH, ".."), { recursive: true });
  writeFileSync(
    FINGERPRINT_PATH,
    JSON.stringify(freshFingerprint, null, 2) + "\n",
    "utf8",
  );
  console.log(
    `[calibration] wrote ${FINGERPRINT_PATH} (${freshResults.length} samples, engines: ${enginesPresent.join(", ") || "none"})`,
  );

  // D3-10 regression gate: diff fresh vs committed for previously-eligible
  // (engine, kind) pairs. A committed-eligible kind now ineligible = FAIL.
  const committed = loadCommittedFingerprint();
  if (!committed || !committed.engines) {
    console.log(
      "[calibration] no committed fingerprint to diff against (first run); exit 0",
    );
    process.exit(0);
  }

  const regressions: Array<{ engine: string; kind: string }> = [];
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const committedEngine = committed.engines[engine] ?? {};
    const freshEngine = freshByEngine[engine] ?? {};
    for (const kind of ["paragraph", "heading"] as const) {
      const committedEligible = engineKindEligibility(committedEngine, kind);
      const freshEligible = engineKindEligibility(freshEngine, kind);
      if (committedEligible.eligible && !freshEligible.eligible) {
        regressions.push({ engine, kind });
      }
    }
  }

  if (regressions.length > 0) {
    console.error(
      "[calibration] D3-10 REGRESSION — previously-eligible (engine, kind) pairs now ineligible:",
    );
    for (const r of regressions) {
      console.error(`  - ${r.engine} / ${r.kind}`);
    }
    console.error(
      "If this is intentional (e.g. a font regression), document the rationale in calibration/fingerprint.json and commit the new baseline.",
    );
    // D3-10 — the regression fails the build. process.exit(1) is the CI gate.
    process.exit(1);
  }

  console.log(
    "[calibration] D3-10 gate PASSED — no previously-eligible kind regressed",
  );
  process.exit(0);
}

main();
