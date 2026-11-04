// tests/unit/pagination-no-default.test.ts
// Issue #255 — the mechanical enforcement of the pagination no-default-switch
// convention (Pattern F). The lint gate (scripts/check-pagination-no-default.mjs)
// must REJECT a switch carrying a `default:` branch and ACCEPT exhaustive
// switches, so the enforcement claim in src/pagination/splitBlock.ts stays
// true. These cells pin the checker itself against its fixtures (the same
// fixtures `npm run lint` exercises through the script's --self-test pass).
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  findDefaultSwitchViolations,
  collectPaginationViolations,
  PAGINATION_NO_DEFAULT_DIRS,
} from "../../scripts/lib/pagination-no-default.mjs";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const FIXTURES = join(REPO_ROOT, "tests", "fixtures", "pagination-no-default");

describe("pagination no-default lint gate (issue #255)", () => {
  it("rejects a fixture containing a prohibited default branch", async () => {
    const source = await readFile(join(FIXTURES, "bad-default.ts"), "utf-8");
    const violations = findDefaultSwitchViolations(source, "bad-default.ts");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.line).toBeGreaterThan(0);
  });

  it("accepts the exhaustive-switch fixture (the convention's positive case)", async () => {
    const source = await readFile(join(FIXTURES, "exhaustive-switch.ts"), "utf-8");
    expect(findDefaultSwitchViolations(source, "exhaustive-switch.ts")).toEqual([]);
  });

  it("flags the default clause itself, not the switch's exhaustiveness", async () => {
    const source = await readFile(join(FIXTURES, "bad-default.ts"), "utf-8");
    const violations = findDefaultSwitchViolations(source, "bad-default.ts");
    // Every violation names a line whose case is `default:` (test === null).
    for (const violation of violations) {
      const lines = source.split("\n");
      expect(lines[violation.line - 1]).toMatch(/default\s*:/);
    }
  });

  it("reports violations with repo-relative file paths", () => {
    const violations = collectPaginationViolations(REPO_ROOT);
    for (const violation of violations) {
      expect(violation.file).not.toMatch(/^\/|^\.\./);
    }
  });

  it("scans exactly the pagination source tree", () => {
    expect(PAGINATION_NO_DEFAULT_DIRS).toEqual(["src/pagination"]);
  });

  it("finds no default branch in the shipped pagination modules", () => {
    // The convention holds today; this cell goes red the moment someone adds
    // a `default:` to a pagination switch — the same red `npm run lint` shows.
    expect(collectPaginationViolations(REPO_ROOT)).toEqual([]);
  });

  it("detects defaults nested inside callbacks and expressions", () => {
    const source = [
      "export function pick(kind: 'a' | 'b'): number {",
      "  const f = (k: 'a' | 'b'): number => {",
      "    switch (k) {",
      "      case 'a':",
      "        return 1;",
      "      default:",
      "        return 2;",
      "    }",
      "  };",
      "  return f(kind);",
      "}",
    ].join("\n");
    const violations = findDefaultSwitchViolations(source, "nested.ts");
    expect(violations.length).toBe(1);
    expect(violations[0]?.line).toBe(6);
  });
});
