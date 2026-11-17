// Type declarations for ops/lemcentre-runner/record-contention.mjs
// (consumed by tests/unit/ops/record-contention.test.ts; the .mjs
// implementation is the single truth — issue #282's contention-policy
// adjudicator for the nightly-equivalent Linux lane).

export interface HostLoadPhase {
  phase: string;
  at?: string | undefined;
  loadavg?:
    | { "1m"?: number | undefined; "5m"?: number | undefined; "15m"?: number | undefined }
    | undefined;
  lease?: Record<string, unknown> | undefined;
}

export interface HostLoadRecord {
  schemaVersion: number;
  host?: string | undefined;
  phases: HostLoadPhase[];
}

export interface ThresholdConfig {
  schemaVersion: number;
  thresholds: { loadavg1mMax: number };
  invalidates: string[];
  host?: { cpus?: number | undefined } | undefined;
  [key: string]: unknown;
}

export interface PhaseVerdict {
  phase: string;
  measurement: boolean;
  loadavg1m: number;
  contended: boolean;
  invalidates: boolean;
  samples: number;
  sources: string[];
}

export interface ContentionVerdict {
  schemaVersion: 1;
  threshold: {
    source: string;
    loadavg1mMax: number;
    invalidates: string[];
  };
  measurementInvalid: boolean;
  phases: PhaseVerdict[];
}

export declare function defaultThresholdPath(): string;

export declare function readRecords(
  paths: string[],
): Array<{ source: string; record: HostLoadRecord }>;

export declare function readThreshold(path: string): ThresholdConfig;

export declare function adjudicateContention(
  inputs: Array<{ source: string; record: HostLoadRecord }>,
  threshold: ThresholdConfig,
  thresholdSource?: string,
): ContentionVerdict;

export declare function main(argv?: string[]): number;
