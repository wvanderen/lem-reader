// scripts/check-no-danger.js
// Plan 07-07 Task 2 — the repo-wide `dangerouslySetInnerHTML` grep gate
// (SC#4 structural XSS defense). Wired as `npm run lint:no-danger`. The
// script exits 0 if NO dangerous React HTML-injection surface is present in
// the source tree; exits 1 with a diagnostic on the first match otherwise.
//
// SCOPE (per RESEARCH.md §Gate 2 L970 + 07-VALIDATION.md §Wave 0):
//   scans src/, server/, functions/ — the three directories that ship
//   reader-facing or server-rendered code. tests/ + scripts/ + .planning/
//   are out of scope (test fixtures and docs may legitimately discuss the
//   API by name).
//
// PATTERN (Rule 1 deviation from the plan's literal `grep -rn
// dangerouslySetInnerHTML`): the plan's bare grep would have produced two
// false positives on the prose comments at src/settings/applyTheme.ts:24
// ("The renderer already forbids dangerouslySetInnerHTML") and
// server/htmlToBlocks.ts:20 ("`dangerouslySetInnerHTML` exists nowhere").
// Both are educational comments that document the structural defense, NOT
// usage. The structural intent is "no JSX/object-literal USAGE of the
// API," so the regex matches the two and only legitimate usage patterns:
//
//   1. dangerouslySetInnerHTML={<value>}     (JSX attribute assignment)
//   2. dangerouslySetInnerHTML: <value>      (object property / React.createElement)
//
// Either form is what would actually wire raw HTML into React. A prose
// mention followed by whitespace, punctuation, or backticks does NOT match
// and is correctly excluded. The pattern is `.dangerouslySetInnerHTML\s*[=:]`
// (with leading word boundary) — it covers every real usage shape including
// multi-line `dangerouslySetInnerHTML:\n  { __html: ... }`.
//
// The eslint `react/no-danger: "error"` rule already covers /server and
// /functions per 07-PATTERNS.md L713 (the flat-config files: [...**/*.{ts,tsx,js,jsx}]
// has no ignore for those dirs). This script is the belt-and-suspenders
// CI-runnable gate independent of ESLint's parser scope.
//
// THREAT REGISTER: T-7-33 (07-07-PLAN.md <threat_model>) — a future PR that
// re-introduces dangerouslySetInnerHTML is caught at CI by this script.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["src", "server", "functions"];
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Matches `dangerouslySetInnerHTML` immediately followed by `=` (JSX) or `:`
// (object property). Word-boundary on the leading `d` prevents
// `notdangerouslySetInnerHTML` from matching. The `\s*` allows whitespace
// between the identifier and the assignment/colon (multi-line object literals).
const USAGE_PATTERN = /\bdangerouslySetInnerHTML\s*[=:]/;

/**
 * Walk a directory recursively, yielding file paths matching the
 * FILE_EXTENSIONS set. Symlinks are skipped (defensive — avoids cycles).
 */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // directory doesn't exist (e.g. functions/ when no functions are present)
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    if (FILE_EXTENSIONS.has(ext)) yield fullPath;
  }
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const absDir = join(REPO_ROOT, dir);
  if (!existsDir(absDir)) continue;
  for (const filePath of walk(absDir)) {
    let content;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    if (USAGE_PATTERN.test(content)) {
      violations.push(relative(REPO_ROOT, filePath));
    }
  }
}

if (violations.length > 0) {
  console.error(
    "VIOLATION: dangerouslySetInnerHTML usage found in the following files:",
  );
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  console.error("");
  console.error(
    "The doc model IS the security boundary (ING-07). Render Block JSON,",
  );
  console.error(
    "never raw HTML. See 07-RESEARCH.md §Gate 2 + 07-VALIDATION.md §Wave 0.",
  );
  process.exit(1);
}

console.log(
  "lint:no-danger: 0 dangerouslySetInnerHTML usages across src/ server/ functions/ — ING-07 structural defense holds.",
);
process.exit(0);

/**
 * Lightweight synchronous directory-exists check (avoids try/catch noise at
 * the call site).
 */
function existsDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
