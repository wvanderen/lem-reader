// Type declarations for scripts/lib/pagination-no-default.mjs (consumed by
// TS tests and TS tooling; the .mjs implementation is the single source of
// truth) — the scripts/lib/*.d.mts precedent (container-lane.d.mts).
export declare const PAGINATION_NO_DEFAULT_DIRS: readonly string[];

export declare interface NoDefaultViolation {
  file: string;
  line: number;
}

export declare function findDefaultSwitchViolations(
  source: string,
  fileName: string,
): NoDefaultViolation[];

export declare function collectPaginationViolations(repoRoot: string): NoDefaultViolation[];

export declare function selfTest(fixturesDir: string): string | null;
