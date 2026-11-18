// Type declarations for ops/lemcentre-runner/acceptance-collect.mjs
// (consumed by tests/unit/ops/acceptance-collect.test.ts; the .mjs
// implementation is the single truth — issue #284's acceptance-evidence
// collector for the Lemcentre CI migration).

import type { CheckRun } from "./compare-shadow.d.mts";

export interface PrSuiteCheckDefinition {
  check: string;
  producer: string;
  workflow: string;
}

export interface TimelineEntry {
  runId: number | null;
  runUrl?: string | null;
  attempt: number;
  startedAt: string;
  conclusion: string | null;
  source: "attempt" | "check-run";
}

export interface AttemptRun {
  id?: number;
  run_attempt?: number;
  status?: string;
  conclusion?: string | null;
  run_started_at?: string;
  html_url?: string;
}

export interface ConsecutiveVerdict {
  required: number;
  satisfied: boolean;
  counted: TimelineEntry[];
  consecutiveCollected: number;
  shortfall: number;
  historyOutsideWindow: TimelineEntry[];
  reasons: string[];
}

export interface NightlyRevisionCheck {
  ok: boolean;
  nightlySha: string | null;
  candidateTree: string | null;
  nightlyTree: string | null;
  reasons: string[];
}

export interface PhaseVerdictEntry {
  phase: string;
  exit: number;
  engines?: Record<string, number> | undefined;
  contentionInvalid?: boolean | undefined;
}

export interface HostLoadPhase {
  phase: string;
  at?: string | undefined;
  loadavg?: { "1m"?: number; "5m"?: number; "15m"?: number } | undefined;
  lease?: ({ owner?: string } & Record<string, unknown>) | undefined;
}

export interface AcceptanceEvidence {
  reports: Record<string, unknown | undefined>;
  reportErrors: Record<string, string | undefined>;
  phases?: { schemaVersion?: number; phases: PhaseVerdictEntry[] } | undefined;
  phasesError?: string | undefined;
  hostLoad?: { schemaVersion?: number; host?: string; phases: HostLoadPhase[] } | undefined;
  hostLoadError?: string | undefined;
  contention?:
    | {
        schemaVersion?: number;
        measurementInvalid: boolean;
        threshold?: { source?: string; loadavg1mMax?: number };
        phases?: unknown[];
      }
    | undefined;
  contentionError?: string | undefined;
}

export interface NightlyGrade {
  grade: "uncollected" | "invalid" | "not-acceptance-grade" | "acceptance-grade";
  reasons: string[];
}

export interface SuiteEnginesEntry {
  runId: number | null;
  attempt: number;
  rows: Array<Record<string, unknown>> | null;
  error: string | null;
}

export interface PrSuiteState {
  timeline: TimelineEntry[];
  verdict: ConsecutiveVerdict;
  engines: SuiteEnginesEntry[];
  shaMismatch?: boolean | undefined;
}

export interface CollectState {
  repo: string;
  shaArg: string;
  resolvedSha: string | null;
  candidateTree: string | null;
  collectedAt: string;
  filledOwnerIds: string[];
  identity: {
    pin: { parsed?: Record<string, unknown>; source: string } | null;
    pinError: string | null;
    lemfleetRev: string | null;
    lemfleetRevError: string | null;
    blobs: {
      budget: { path: string; blob: string } | null;
      calibration: { path: string; blob: string } | null;
      threshold: { path: string; blob: string } | null;
    };
  };
  prSuite: Record<string, PrSuiteState>;
  nightly: {
    revision: NightlyRevisionCheck | null;
    run: CheckRun | null;
    grade: NightlyGrade;
    evidence: AcceptanceEvidence | null;
    evidenceError: string | undefined;
  };
  boundaryProbe: { url: string; conclusion: string; completedAt: string } | null;
}

export interface MissingItem {
  id: string;
  who: "collector" | "owner";
  why: string;
}

export declare function buildSuiteTimeline(
  checkRuns: CheckRun[],
  attemptsByRunId: Map<number, AttemptRun[]>,
): TimelineEntry[];

export declare function adjudicateThreeConsecutive(
  timeline: TimelineEntry[],
  required?: number,
): ConsecutiveVerdict;

export declare function validateNightlyRevision(
  candidateCommit: { sha?: string; commit?: { tree?: { sha?: string } } } | null | undefined,
  nightlyRef: { object?: { sha?: string } } | null | undefined,
  nightlyCommit: { sha?: string; commit?: { tree?: { sha?: string } } } | null | undefined,
): NightlyRevisionCheck;

export declare function readAcceptanceEvidence(zipBytes: Uint8Array): AcceptanceEvidence;

export declare function adjudicateNightlyRun(input: {
  checkRun: CheckRun | null;
  evidence?: AcceptanceEvidence | undefined;
  evidenceError?: string | undefined;
}): NightlyGrade;

/** How many consecutive successful full PR-suite runs acceptance needs
 * (the adjudication constant; the record constants live in
 * acceptance-record.mjs). */
export declare const REQUIRED_CONSECUTIVE_RUNS: number;

export declare function emptyCollectState(): CollectState;

export declare function main(argv?: string[]): number;
