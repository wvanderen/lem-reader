// Type declarations for scripts/summarize-e2e.mjs (consumed by
// tests/unit/summarize-e2e.test.ts; the .mjs implementation is the single
// truth). The CLI guards its argv handling on VITEST_WORKER_ID so the pure
// summarizer can be imported under vitest without triggering the usage
// error.

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

export interface FailureDetail {
  project: string;
  file: string;
  line?: number | undefined;
  titlePath: string[];
  status: string;
  durationMs: number;
  message: string;
}

export interface LaunchError {
  project: string | null;
  message: string;
  location?: unknown;
  launch: boolean;
}

export interface FileRanking {
  key: string;
  firstMs: number;
  retryMs: number;
  attempts: number;
  failures: number;
}

export interface E2eSummary {
  stats?: {
    startTime?: string;
    duration?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  engines: EngineOutcome[];
  failures: FailureDetail[];
  launchErrors: LaunchError[];
  files: FileRanking[];
}

export declare function summarizeReport(report: unknown): E2eSummary;
