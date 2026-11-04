// Type declarations for scripts/lib/runtime.mjs (imported by TS tests and
// TS tooling; the .mjs implementation is the single source of truth).
export declare const REQUIRED_NODE_MAJOR: number;
export declare const REQUIRED_NODE_MIN_MINOR: number;

export type RuntimeCheck = {
  ok: boolean;
  kind: "ok" | "wrong-major" | "too-old-minor" | "unparseable";
  version: string;
  major: number | null;
  minor: number | null;
};

export declare function checkNodeRuntime(version: string | undefined): RuntimeCheck;
export declare function renderPreflightFailure(result: RuntimeCheck): string;
