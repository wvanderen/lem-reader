// scripts/lib/pagination-no-default.mjs
// Issue #255 — the deterministic no-default-switch checker for pagination
// code (Pattern F). src/pagination/splitBlock.ts documents the convention:
// "every switch is exhaustive with NO default branch" — a missing case must
// fail to compile (tsc) and a `default:` branch must fail lint (this gate).
// An internal reviewer once caught a default branch by hand; this gate makes
// it mechanical.
//
// WHY A SCRIPTED CHECK: @typescript-eslint cannot load under the repo's TS 7
// pin (see eslint.config.js parser note), and no stock ESLint core rule
// rejects default clauses. Parsing with @babel/parser (already a dev
// dependency of the ESLint parser setup) keeps the gate deterministic — an
// AST walk, not a regex — and compatible with the existing `npm run lint`
// pipeline (the check-no-danger.js precedent).
//
// SCOPE: PAGINATION_NO_DEFAULT_DIRS only. Naming, duplication, and
// architectural consistency stay with reviewers and the code-review skill;
// this gate enforces exactly one documented convention.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "@babel/parser";

/** The directories the convention covers (repo-relative). */
export const PAGINATION_NO_DEFAULT_DIRS = ["src/pagination"];

/** File extensions parsed as TypeScript (optionally JSX). */
const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Find every `default:` switch clause in TypeScript source.
 *
 * @param source the file's text
 * @param fileName a label for violation messages
 * @returns one entry per default clause: the label and 1-based line
 */
export function findDefaultSwitchViolations(source, fileName) {
  const isJsx = fileName.endsWith(".tsx");
  const ast = parse(source, {
    sourceType: "module",
    plugins: isJsx ? ["typescript", "jsx"] : ["typescript"],
  });
  const violations = [];
  walk(ast, (node) => {
    if (node.type !== "SwitchStatement") return;
    for (const switchCase of node.cases) {
      // Babel marks `default:` with test === null; every labeled case has a
      // test node. That is the whole convention, structurally.
      if (switchCase.test === null) {
        violations.push({ file: fileName, line: switchCase.loc?.start.line ?? 0 });
      }
    }
  });
  return violations;
}

/**
 * Scan the convention's directories under `repoRoot` for default branches.
 * Never throws for missing directories (reports nothing instead) so the gate
 * stays usable from any checkout shape.
 *
 * @param repoRoot absolute path to the repository root
 * @returns violations with repo-relative file paths
 */
export function collectPaginationViolations(repoRoot) {
  const violations = [];
  for (const dir of PAGINATION_NO_DEFAULT_DIRS) {
    const absDir = join(repoRoot, ...dir.split("/"));
    if (!isDirectory(absDir)) continue;
    for (const filePath of walkFiles(absDir)) {
      if (!TS_EXTENSIONS.has(extensionOf(filePath))) continue;
      let source;
      try {
        source = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const rel = relative(repoRoot, filePath).split(sep).join("/");
      violations.push(...findDefaultSwitchViolations(source, rel));
    }
  }
  return violations;
}

/**
 * Run the gate's self-test: the bad fixture MUST be rejected and the
 * exhaustive fixture MUST be accepted. This is how `npm run lint` proves the
 * enforcement itself — a fixture containing a prohibited default branch
 * failing the ordinary lint command means the gate cannot silently rot.
 *
 * @param fixturesDir absolute path to tests/fixtures/pagination-no-default
 * @returns a description of the self-test failure, or null when it passes
 */
export function selfTest(fixturesDir) {
  const badPath = join(fixturesDir, "bad-default.ts");
  const goodPath = join(fixturesDir, "exhaustive-switch.ts");
  try {
    const bad = findDefaultSwitchViolations(readFileSync(badPath, "utf-8"), badPath);
    if (bad.length === 0) {
      return `self-test failed: ${badPath} (a prohibited default branch) was NOT rejected — the gate is broken`;
    }
    const good = findDefaultSwitchViolations(readFileSync(goodPath, "utf-8"), goodPath);
    if (good.length > 0) {
      return `self-test failed: ${goodPath} (an accepted exhaustive switch) was rejected at line ${good[0]?.line}`;
    }
  } catch (err) {
    return `self-test failed: could not read fixtures (${err instanceof Error ? err.message : String(err)})`;
  }
  return null;
}

// ── internals ────────────────────────────────────────────────────────────────

/** Recursive AST walk over Babel nodes (skips loc/comment/extra metadata). */
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key.endsWith("Comments") ||
      key === "extra"
    ) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      walk(value, visit);
    }
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

function extensionOf(filePath) {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx);
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
