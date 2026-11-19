import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const workflow = resolve(
  import.meta.dirname,
  "../../../.github/workflows/browser-guest-diagnostics.yml",
);
const launcher = "/usr/local/libexec/factory-ci/browser-diagnostics";

function launchStep(fake: string): string {
  const body = readFileSync(workflow, "utf8").match(
    /^ {8}id: launch\n[\s\S]*?^ {8}run: \|\n((?:^ {10}[^\n]*\n)+)/m,
  )?.[1];
  if (!body?.includes(launcher)) throw new Error("missing browser diagnostics launch step");
  return body.replace(/^ {10}/gm, "").replace(launcher, fake);
}

function stopFixture(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

// Actions first signals the step shell, not the launcher's process group.
// The launcher is a real subprocess here; a signal handler stands in for its
// public cancellation behavior (request a cancel marker, then exit 5).
test.each(["SIGINT", "SIGTERM"] as const)(
  "the diagnostics step forwards %s to the launcher",
  async (signal) => {
    const dir = mkdtempSync(join(tmpdir(), "lem-diag-cancel-"));
    const fake = join(dir, "launcher");
    const ready = join(dir, "ready");
    const cancelled = join(dir, "cancelled");
    const output = join(dir, "output");
    writeFileSync(
      fake,
      `#!/usr/bin/env python3
from pathlib import Path
import os
import signal

def cancel(*_):
    Path(os.environ['CANCELLED']).touch()
    raise SystemExit(5)

signal.signal(signal.SIGTERM, cancel)
Path(os.environ['READY']).touch()
while True:
    signal.pause()
`,
      { mode: 0o755 },
    );
    const child = spawn("bash", ["-e", "-c", launchStep(fake)], {
      detached: true,
      env: {
        ...process.env,
        HEAD_SHA: "a".repeat(40),
        GITHUB_WORKSPACE: dir,
        GITHUB_OUTPUT: output,
        READY: ready,
        CANCELLED: cancelled,
      },
      stdio: "ignore",
    });
    const exit = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    try {
      await expect.poll(() => existsSync(ready), { timeout: 2000 }).toBe(true);
      expect(child.kill(signal)).toBe(true);
      await expect.poll(() => existsSync(cancelled), { timeout: 1500 }).toBe(true);
      await expect.poll(() => child.exitCode, { timeout: 1500 }).toBe(130);
      expect(existsSync(output)).toBe(false);
    } finally {
      if (child.pid) stopFixture(child.pid);
      await exit;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Forwarding cancellation must not change the workflow's ordinary verdict.
test.each([0, 2, 5])("preserves a normal launcher exit of %s", (code) => {
  const dir = mkdtempSync(join(tmpdir(), "lem-diag-exit-"));
  const output = join(dir, "output");
  try {
    const fake = join(dir, "launcher");
    writeFileSync(fake, `#!/usr/bin/env bash\nexit ${code}\n`, { mode: 0o755 });
    const step = spawnSync("bash", ["-e", "-c", launchStep(fake)], {
      env: {
        ...process.env,
        HEAD_SHA: "a".repeat(40),
        GITHUB_WORKSPACE: dir,
        GITHUB_OUTPUT: output,
      },
    });
    expect(step.status).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(`exit=${code}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
