// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function runManagedServer(
  identity: "matching" | "wrong",
  { baseHost = "127.0.0.1", defaultBindHost = "127.0.0.1" } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "lem-readiness-"));
  scratch.push(dir);
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "specs"));
  const port = await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, baseHost === "[::1]" ? "::1" : "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no TCP address");
      server.close(() => resolvePort(address.port));
    });
  });
  const base = `http://${baseHost}:${port}`;
  const playwright = join(repoRoot, "node_modules/@playwright/test/index.mjs");
  const marker = join(dir, "test-started");
  writeFileSync(join(dir, "bin/npm"), `#!/bin/sh\nexec node '${join(dir, "server.mjs")}' "$@"\n`, {
    mode: 0o755,
  });
  writeFileSync(
    join(dir, "server.mjs"),
    `import { createServer } from 'node:http';
const hostIndex = process.argv.indexOf('--host');
const host = hostIndex < 0 ? ${JSON.stringify(defaultBindHost)} : process.argv[hostIndex + 1];
createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({tool:'lem-reader-e2e-server', token:${identity === "matching" ? "process.env.LEM_E2E_TOKEN" : "'wrong-token'"}}));
}).listen(${port}, host);`,
  );
  // Import the REAL configuration: a separate lookalike webServer entry would
  // miss regressions where HTTP readiness races identity verification again.
  writeFileSync(
    join(dir, "playwright.config.ts"),
    `import config from ${JSON.stringify(join(repoRoot, "playwright.config.ts"))};
export default {...config, testDir:${JSON.stringify(join(dir, "specs"))},
  outputDir:${JSON.stringify(join(dir, "results"))}, reporter:'line', workers:1,
  projects:[{name:'contract'}],
  webServer:config.webServer.map(server => ({...server, cwd:${JSON.stringify(repoRoot)}, timeout:4000}))};`,
  );
  writeFileSync(
    join(dir, "specs/ready.spec.mjs"),
    `import {test} from ${JSON.stringify(playwright)};
import {writeFileSync} from 'node:fs';
test('runs only after identity verification', () => writeFileSync(${JSON.stringify(marker)}, 'started'));`,
  );
  const child = spawn(
    process.execPath,
    [
      join(repoRoot, "node_modules/playwright/cli.js"),
      "test",
      "--config",
      join(dir, "playwright.config.ts"),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: "",
        LEM_E2E_BASE: base,
        PATH: `${join(dir, "bin")}${delimiter}${process.env.PATH}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
  const code = await new Promise<number | null>((resolveCode, reject) => {
    child.on("error", reject);
    child.on("close", resolveCode);
  }).finally(() => clearTimeout(timeout));
  let testStarted = false;
  try {
    testStarted = readFileSync(marker, "utf-8") === "started";
  } catch {
    // A failed startup must never reach the test body.
  }
  return { code, output, testStarted };
}

test("a wrong identity fails startup without executing a test", async () => {
  const result = await runManagedServer("wrong");
  expect(result.code, result.output).not.toBe(0);
  expect(result.testStarted, result.output).toBe(false);
}, 20_000);

test("a matching per-run identity releases the test runner", async () => {
  const result = await runManagedServer("matching");
  expect(result.code, result.output).toBe(0);
  expect(result.testStarted, result.output).toBe(true);
}, 20_000);

test.each(["127.0.0.1", "localhost", "[::1]"])(
  "binds explicitly for %s even when Vite's default would be IPv6-only",
  async (baseHost) => {
    // Reproduce Ubuntu's Vite default (::1) independently of the host's DNS
    // order. The real launcher must pass --host rather than relying on it.
    const result = await runManagedServer("matching", { baseHost, defaultBindHost: "::1" });
    expect(result.code, result.output).toBe(0);
    expect(result.testStarted, result.output).toBe(true);
  },
  20_000,
);
