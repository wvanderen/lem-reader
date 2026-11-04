// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  inspectContainerDaemon,
  inspectContainerImage,
  containerDependenciesReady,
} from "../../scripts/lib/container-environment.mjs";

const plan = {
  imageName: "lem-reader/e2e:test",
  nodePin: "22.23.4",
  volumeName: "lem-e2e-deps-test",
};
function dockerRunner(
  responses: Array<{
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: { code: string };
  }>,
) {
  const calls: string[][] = [];
  return {
    calls,
    run: (_command: string, args: string[]) => {
      calls.push(args);
      const response = responses.shift();
      if (!response) throw new Error(`unexpected command: ${args.join(" ")}`);
      return { stdout: "", stderr: "", ...response };
    },
  };
}

describe("shared container readiness inspection", () => {
  test("daemon failure provides the same actionable diagnosis to every caller", () => {
    const runner = dockerRunner([{ status: 1, stderr: "permission denied\nmore output" }]);
    const result = inspectContainerDaemon({ run: runner.run });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("permission denied");
    expect(result.reason).toContain("bootstrap-machine.mjs");
  });
  test("missing CLI is distinguished from an unreachable daemon", () => {
    const runner = dockerRunner([{ status: null, error: { code: "ENOENT" } }]);
    expect(inspectContainerDaemon({ run: runner.run }).reason).toContain("CLI not found");
  });
  test("security-option failures cannot silently select rootful ownership", () => {
    const runner = dockerRunner([
      { status: 0, stdout: "29.9.2" },
      { status: 1, stderr: "timed out" },
    ]);
    expect(inspectContainerDaemon({ run: runner.run }).ok).toBe(false);
  });
  test.each([
    ["[name=rootless]", true],
    ["[name=seccomp]", false],
  ])("detects daemon mode from %s", (securityOptions, rootless) => {
    const runner = dockerRunner([
      { status: 0, stdout: "29.9.2" },
      { status: 0, stdout: String(securityOptions) },
    ]);
    expect(inspectContainerDaemon({ run: runner.run })).toMatchObject({
      ok: true,
      rootlessDaemon: rootless,
      serverVersion: "29.9.2",
    });
  });
  test("missing images are distinguishable from wrong-runtime images", () => {
    const missing = dockerRunner([{ status: 1 }]);
    expect(inspectContainerImage(plan, { run: missing.run })).toMatchObject({
      present: false,
      ok: false,
    });
    const wrong = dockerRunner([{ status: 0 }, { status: 0, stdout: "v24.0.0" }]);
    expect(inspectContainerImage(plan, { run: wrong.run })).toMatchObject({
      present: true,
      ok: false,
      nodeVersion: "v24.0.0",
    });
  });
  test("a matching Node version is verified inside the image", () => {
    const runner = dockerRunner([{ status: 0 }, { status: 0, stdout: "v22.23.4\n" }]);
    expect(inspectContainerImage(plan, { run: runner.run }).ok).toBe(true);
    expect(runner.calls[1]).toContain("--entrypoint");
  });
  test("a volume without a ready marker is not initialized", () => {
    const runner = dockerRunner([{ status: 0 }, { status: 1 }]);
    expect(containerDependenciesReady(plan, { run: runner.run })).toBe(false);
    expect(runner.calls[1]).toContain("/deps/.deps-ready");
  });
  test("a cached ready marker makes dependencies available", () => {
    const runner = dockerRunner([{ status: 0 }, { status: 0 }]);
    expect(containerDependenciesReady(plan, { run: runner.run })).toBe(true);
  });
});
