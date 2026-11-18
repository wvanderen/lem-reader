/**
 * Type declarations for ops/lemcentre-runner/verify-enforcement.mjs (the
 * module itself is authored as plain ESM JavaScript; this file gives the
 * vitest suites and `tsc` a typed surface — same pattern as
 * scripts/lib/*.d.mts).
 */

export interface WorkflowProducer {
  check: string;
  workflow: string;
  job: string;
  runsOn: string[];
}

export interface ProducerExpectation {
  mac?: string[];
  linuxMustInclude?: string;
  linuxMustExclude?: string;
  runsOn?: string[];
}

export interface Finding {
  severity: "fail" | "note";
  code: string;
  message: string;
  check?: string;
  ruleset?: string;
}

export interface EnforcementReport {
  mode: string;
  layers: {
    classic: { contexts: string[]; enforceAdmins: boolean | undefined };
    rulesets: Array<{ ruleset: string; contexts: string[]; bypassActors: unknown[] | null }>;
  };
  mapping: Record<
    string,
    { producer: WorkflowProducer | null; expectation: ProducerExpectation | null }
  >;
  findings: Finding[];
  passed: boolean;
}

export declare const CANONICAL_CLASSIC_CONTEXTS: string[];
export declare const CANONICAL_RULESET_NAME: string;
export declare const CANONICAL_RULESET_CONTEXTS: string[];
export declare const PRODUCER_EXPECTATIONS: Record<string, ProducerExpectation>;

export declare function mapWorkflows(workflowTexts: Record<string, string>): WorkflowProducer[];

export declare function analyzeEnforcement(input: {
  classic: unknown;
  rulesetList: unknown;
  rulesetDetails: Array<{ ruleset: string; detail: unknown }>;
  producers: WorkflowProducer[];
  expectLinux?: boolean;
}): EnforcementReport;

export declare function defaultWorkflowsDir(): string;

export declare function main(argv?: string[]): number;
