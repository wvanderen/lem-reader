// tests/unit/runtime-preflight.test.ts
// Issue #253 — the repo's Node runtime contract. Lem Reader and its CI
// standardize on Node 22 (.mise.toml pin, CI node-version: 22); the shared
// Omarchy box's global default is Node 26, which earlier sessions repeatedly
// mistook for baseline jsdom/localStorage breakage. The preflight gate runs
// before every expensive test/build script; these cells pin the decision
// boundary and the actionable failure message.
import { describe, expect, test } from "vitest";
import {
  checkNodeRuntime,
  REQUIRED_NODE_MAJOR,
  renderPreflightFailure,
} from "../../scripts/lib/runtime.mjs";

describe("checkNodeRuntime — the Node 22 decision boundary", () => {
  test("the required major is the project/CI standard (22)", () => {
    expect(REQUIRED_NODE_MAJOR).toBe(22);
  });

  test("the pinned and other current Node 22.x versions pass; the Vite-8 floor is enforced", () => {
    expect(checkNodeRuntime("v22.23.4").ok).toBe(true); // the .mise.toml pin
    expect(checkNodeRuntime("v22.12.0").ok).toBe(true); // the docs/stack.md floor
    const ok = checkNodeRuntime("v22.23.4");
    expect(ok.major).toBe(22);
  });

  test("Node 22 below the Vite-8 floor (22.12) is rejected as too-old-minor", () => {
    const result = checkNodeRuntime("v22.11.0");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("too-old-minor");
    expect(result.major).toBe(22);
  });

  test("Node 26 — the machine's global default — is rejected", () => {
    const result = checkNodeRuntime("v26.7.0");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("wrong-major");
    expect(result.major).toBe(26);
  });

  test("adjacent majors (21, 23, 24) are rejected the same way", () => {
    expect(checkNodeRuntime("v21.7.3").kind).toBe("wrong-major");
    expect(checkNodeRuntime("v23.5.0").kind).toBe("wrong-major");
    expect(checkNodeRuntime("v24.3.1").kind).toBe("wrong-major");
  });

  test("unparseable version strings fail closed", () => {
    for (const garbage of ["", "latest", "vabc", undefined]) {
      const result = checkNodeRuntime(garbage as string | undefined);
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("unparseable");
    }
  });
});

describe("renderPreflightFailure — the actionable rejection message", () => {
  test("the Node 26 rejection names the requirement, the observed runtime, and both fixes", () => {
    const text = renderPreflightFailure(checkNodeRuntime("v26.7.0"));
    // What is required and why the boundary exists.
    expect(text).toContain("Node 22");
    expect(text).toContain("v26.7.0");
    expect(text).toContain(".mise.toml");
    // Fix 1: run the command under the repo-local pin without changing the
    // global default.
    expect(text).toContain("mise exec --");
    // Where a fresh session rediscovers the contract.
    expect(text).toContain("docs/setup.md");
  });

  test("a too-old 22.x rejection cites the docs/stack.md floor", () => {
    const text = renderPreflightFailure(checkNodeRuntime("v22.11.0"));
    expect(text).toContain("22.12");
    expect(text).toContain("docs/stack.md");
  });

  test("an unparseable runtime still gets a complete, actionable message", () => {
    const text = renderPreflightFailure(checkNodeRuntime(""));
    expect(text).toContain("Node 22");
    expect(text).toContain("mise exec --");
  });

  test("an acceptable runtime renders nothing (the fast path is silent)", () => {
    expect(renderPreflightFailure(checkNodeRuntime("v22.23.4"))).toBe("");
  });
});
