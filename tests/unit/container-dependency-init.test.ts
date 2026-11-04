// @vitest-environment node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const script = resolve(import.meta.dirname, "../../scripts/container-deps.sh");
const scratch: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already exited */
      }
    }
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "lem-deps-init-"));
  scratch.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "lock-regression",
      version: "1.0.0",
      scripts: { postinstall: "node install.cjs" },
    }),
  );
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({
      name: "lock-regression",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: { "": { name: "lock-regression", version: "1.0.0", hasInstallScript: true } },
    }),
  );
  writeFileSync(
    join(dir, "install.cjs"),
    `const fs = require('node:fs');
fs.appendFileSync('installs', 'install\\n');
fs.writeFileSync('started', 'yes');
while (!fs.existsSync('release')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);`,
  );
  return dir;
}

function initialize(dir: string, rebuild = false) {
  const child = spawn(
    "bash",
    [script, join(dir, "node_modules"), join(dir, "locks"), "", rebuild ? "1" : "0"],
    {
      cwd: dir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        npm_config_offline: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
    },
  );
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const done = new Promise<void>((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolveDone() : reject(new Error(`init exit ${code}: ${output}`)),
    );
  });
  // A failure before the caller starts awaiting is still reported by `done`.
  void done.catch(() => {});
  return done;
}

async function waitForFile(path: string) {
  const deadline = Date.now() + 5000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

// flock is an Ubuntu/container prerequisite, not a macOS host dependency.
test.skipIf(process.platform !== "linux")(
  "npm ci cannot unlink the shared lock, and concurrent initialization installs once",
  async () => {
    const dir = fixture();
    const first = initialize(dir);
    await waitForFile(join(dir, "started"));
    // npm ci has already cleared node_modules before postinstall. The actual
    // install must still hold a lock that another process cannot acquire.
    const competingLock = spawnSync("flock", ["-n", join(dir, "locks/.init.lock"), "true"]);
    expect(competingLock.status).toBe(1);
    const second = initialize(dir);
    writeFileSync(join(dir, "release"), "go");
    await Promise.all([first, second]);
    expect(readFileSync(join(dir, "installs"), "utf-8")).toBe("install\n");
    expect(existsSync(join(dir, "node_modules/.deps-ready"))).toBe(true);
  },
  15_000,
);

test.skipIf(process.platform !== "linux")(
  "rebuild invalidates the marker inside the lock and installs again",
  async () => {
    const dir = fixture();
    writeFileSync(join(dir, "release"), "go");
    await initialize(dir);
    await initialize(dir);
    expect(readFileSync(join(dir, "installs"), "utf-8")).toBe("install\n");
    await initialize(dir, true);
    expect(readFileSync(join(dir, "installs"), "utf-8")).toBe("install\ninstall\n");
  },
  15_000,
);
