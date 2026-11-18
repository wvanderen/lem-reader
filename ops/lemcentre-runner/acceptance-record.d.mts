// Type declarations for ops/lemcentre-runner/acceptance-record.mjs
// (the acceptance record's PRESENTATION layer, split out of
// acceptance-collect.mjs by the #305 review; consumed by
// tests/unit/ops/acceptance-collect.test.ts; the .mjs implementation is
// the single truth — issue #284's presentation record).

import type { CollectState, MissingItem, PrSuiteCheckDefinition } from "./acceptance-collect.d.mts";

export declare const PR_SUITE_CHECKS: PrSuiteCheckDefinition[];
export declare const NIGHTLY_CHECK: {
  check: string;
  workflow: string;
  reportsArtifact: string;
};
export declare const OWNER_SECTIONS: Array<{ id: string; what: string }>;

export declare function missingItems(state: CollectState, filledOwnerIds?: string[]): MissingItem[];

export declare function renderRecord(state: CollectState): string;

export declare function carryOverOwnerSections(
  existingText: string | null,
  renderedText: string,
): { text: string; filledOwnerIds: string[] };
