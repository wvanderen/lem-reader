// Type declarations for ops/lemcentre-runner/compare-shadow.mjs (consumed
// by tests/unit/ops/compare-shadow.test.ts; the .mjs implementation is the
// single truth — issue #281's same-revision shadow comparison tool).

export interface ProducerDefinition {
  id: string;
  check: string;
  workflow: string;
  artifact: string;
  member: string;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | undefined;
  html_url?: string | undefined;
  details_url?: string | undefined;
}

export interface EngineRow {
  project: string;
  mac: EngineOutcome | null;
  shadow: EngineOutcome | null;
  agree: boolean;
}

export interface EngineOutcome {
  project: string;
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  interrupted: number;
  firstMs: number;
  retryMs: number;
  attempts: number;
  failures: number;
}

export interface Comparison {
  verdict: "match" | "diverge" | "missing-producer";
  exitCode: number;
  reasons: string[];
  engines: EngineRow[];
  producers: Array<{
    producer: ProducerDefinition;
    run: CheckRun | null;
    verdict: { kind: string; why?: string | undefined };
  }>;
}

export declare const MAC_PRODUCER: ProducerDefinition;
export declare const SHADOW_PRODUCER: ProducerDefinition;

export declare function pickCheckRun(
  payload: { check_runs?: CheckRun[] | undefined } | null | undefined,
  name: string,
): CheckRun | null;

export declare function parseRunId(detailsUrl: string | null | undefined): number | null;

export declare function readArtifactReport(
  zipBytes: Uint8Array | Buffer,
  producer: ProducerDefinition,
): unknown;

export declare function engineRows(
  macSummary: { engines?: EngineOutcome[] | undefined } | null | undefined,
  shadowSummary: { engines?: EngineOutcome[] | undefined } | null | undefined,
): EngineRow[];

export declare function compareProducers(input: {
  mac: CheckRun | null;
  shadow: CheckRun | null;
  macReport?: unknown;
  shadowReport?: unknown;
  macReportError?: string | undefined;
  shadowReportError?: string | undefined;
}): Comparison;

export declare function renderComparison(input: Comparison & { sha: string }): string;

export declare function main(argv?: string[]): number;
