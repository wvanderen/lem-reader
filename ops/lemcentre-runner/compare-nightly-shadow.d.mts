// Type declarations for ops/lemcentre-runner/compare-nightly-shadow.mjs
// (consumed by tests/unit/ops/compare-nightly-shadow.test.ts; the .mjs
// implementation is the single truth — issue #282's nightly-chain
// producer comparison tool).
import type { CheckRun } from "./compare-shadow.mjs";

export type NightlyEngine = "chromium" | "firefox" | "webkit";

export interface MacExhaustiveProducer {
  id: string;
  check: string;
  workflow: string;
  artifact: string;
  member: string;
}

export interface MacNightlyProducers {
  exhaustive: MacExhaustiveProducer;
  matrixPrefix: string;
}

export interface LinuxNightlyProducer {
  id: string;
  check: string;
  workflow: string;
  artifact: string;
  engineMember(engine: NightlyEngine | string): string;
  phasesMember: string;
}

export interface PhaseRecord {
  phase: string;
  exit: number;
  engines?: Record<string, number> | undefined;
  contentionInvalid?: boolean | undefined;
  [key: string]: unknown;
}

export interface PhaseVerdicts {
  schemaVersion: number;
  phases: PhaseRecord[];
}

export interface ShadowEvidence {
  reports: Partial<Record<NightlyEngine, unknown>>;
  reportErrors: Partial<Record<NightlyEngine, string>>;
  phases?: PhaseVerdicts | undefined;
  phasesError?: string | undefined;
}

export interface EngineCounts {
  unexpected: number;
  flaky: number;
  source: string;
}

export interface NightlyEngineRow {
  project: string;
  mac: EngineCounts | null;
  linux: EngineCounts | null;
  /** null = not comparable (a side unreachable); false only on a positive
   * disagreement between two comparable verdicts. */
  agree: boolean | null;
}

export interface NightlyMeasurementRow {
  phase: string;
  mac: string;
  linux: string;
  agree: boolean | null;
  contentionInvalid?: boolean;
}

export interface NightlyProducerLine {
  producer: { check: string; workflow: string };
  run: CheckRun | null;
  verdict: { kind: string; why?: string | undefined };
}

export interface NightlyComparison {
  verdict: "match" | "diverge" | "missing-producer";
  exitCode: number;
  reasons: string[];
  engines: NightlyEngineRow[];
  measurements: NightlyMeasurementRow[];
  producers: NightlyProducerLine[];
}

export declare const NIGHTLY_ENGINES: NightlyEngine[];

export declare const MEASUREMENT_PHASES: string[];

export declare const MAC_NIGHTLY_PRODUCERS: MacNightlyProducers;

export declare const LINUX_NIGHTLY_PRODUCER: LinuxNightlyProducer;

export declare function pickNightlyProducers(
  payload: { check_runs?: CheckRun[] | undefined } | null | undefined,
): {
  mac: {
    exhaustive: CheckRun | null;
    matrix: Record<NightlyEngine, CheckRun | null>;
  };
  linux: CheckRun | null;
};

export declare function parsePhaseVerdicts(payload: unknown): PhaseVerdicts;

export declare function readShadowEvidence(zipBytes: Uint8Array | Buffer): ShadowEvidence;

export declare function compareNightly(input: {
  macExhaustive: CheckRun | null;
  macMatrix: Partial<Record<NightlyEngine, CheckRun | null>>;
  linux: CheckRun | null;
  linuxEvidence?: ShadowEvidence | undefined;
  linuxEvidenceError?: string | undefined;
  macReport?: unknown;
  macReportError?: string | undefined;
}): NightlyComparison;

export declare function renderNightlyComparison(
  input: NightlyComparison & {
    sha: string;
  },
): string;

export declare function main(argv?: string[]): number;
