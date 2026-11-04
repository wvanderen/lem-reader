// Type declarations for scripts/lib/doctor-core.mjs (consumed by TS tests and
// TS tooling; the .mjs implementation is the single source of truth).
export type BrowserFailureKind = "not-installed" | "launch-blocked";

export type BrowserFailureClassification = {
  kind: BrowserFailureKind;
  reason: string;
  fix: string;
};

export type EngineProbeResult = {
  engine: string;
  ok: boolean;
  kind?: string;
  reason?: string;
  fix?: string;
};

export type LaneVerdict = {
  lane: string;
  complete: boolean;
  exitCode: number;
  ready: string[];
  blocked: Array<{ engine: string; kind: string; reason: string; fix: string }>;
  summary: string;
};

export declare function classifyBrowserFailure(message: string): BrowserFailureClassification;
export declare function aggregateLane(lane: string, results: EngineProbeResult[]): LaneVerdict;
