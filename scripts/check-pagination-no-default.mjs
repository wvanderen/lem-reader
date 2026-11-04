#!/usr/bin/env node
// scripts/check-pagination-no-default.mjs — the lint-gate entry for the
// pagination no-default-switch convention (issue #255). Wired into
// `npm run lint` after check-no-danger.js.
//
// Passes (exit 0) when:
//   1. the self-test holds — the deliberately bad fixture IS rejected and
//      the accepted exhaustive fixture IS NOT (a fixture containing a
//      prohibited default branch failing the ordinary lint command is the
//      enforcement proof), and
//   2. no switch under src/pagination/ carries a `default:` clause.
//
// Fails (exit 1) otherwise, naming each violating file:line.
import { join } from "node:path";
import { collectPaginationViolations, selfTest } from "./lib/pagination-no-default.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const FIXTURES = join(REPO_ROOT, "tests", "fixtures", "pagination-no-default");

const selfTestFailure = selfTest(FIXTURES);
if (selfTestFailure) {
  console.error(`✗ pagination no-default gate: ${selfTestFailure}`);
  process.exit(1);
}

const violations = collectPaginationViolations(REPO_ROOT);
if (violations.length > 0) {
  console.error("VIOLATION: `default:` switch branch found under src/pagination/ (Pattern F):");
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line}`);
  }
  console.error("");
  console.error("Pagination switches are exhaustive with NO default: tsc flags a missing");
  console.error("case at compile time, so a default branch would only swallow future block");
  console.error("kinds silently. Remove the default and enumerate every case instead.");
  console.error("See src/pagination/splitBlock.ts (Pattern F) and issue #255.");
  process.exit(1);
}

console.log(
  "lint:pagination-no-default: self-test passed; 0 default branches across src/pagination/ — Pattern F holds.",
);
