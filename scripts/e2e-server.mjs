#!/usr/bin/env node
// scripts/e2e-server.mjs — the managed e2e dev server launcher (issue #253).
//
// Playwright's webServer entry runs THIS script instead of raw `vite`. The
// launcher makes server identity and isolation explicit:
//
//   1. It refuses an occupied port in milliseconds with actionable guidance
//      (assertPortAvailable) — Playwright never silently reuses whatever
//      already answers on the port (the prior "unknowingly tested FlowSynth"
//      class of failure).
//   2. It spawns Vite with --strictPort on the configured base URL's port.
//   3. It verifies the identity endpoint echoes THIS run's token before the
//      run proceeds, so the URL under test is provably the server we spawned.
//   4. It proxies the child's exit code and lifecycle signals.
//
// playwright.config.ts provides LEM_E2E_BASE and LEM_E2E_TOKEN via
// webServer.env. Run tests through `npx playwright test` / npm scripts —
// not this script directly.
import { assertPortAvailable } from "../tests/e2e/_server-port.mjs";
import {
  E2E_IDENTITY_PATH,
  E2E_READY_MESSAGE,
  isIdentityMatch,
} from "../dev-server/e2e-identity.mjs";

import { spawn } from "node:child_process";

const IDENTITY_TIMEOUT_MS = 25_000; // inside the webServer's 30s budget
const IDENTITY_POLL_MS = 250;

function fail(message) {
  console.error(message);
  process.exit(2);
}

const base = process.env.LEM_E2E_BASE;
if (!base) {
  fail(
    "✗ scripts/e2e-server.mjs requires LEM_E2E_BASE.\n" +
      "  The managed webServer config sets it. Start tests via `npx playwright test`.",
  );
}
const url = new URL(base);
const port = Number(url.port);
if (!port) {
  fail(`✗ LEM_E2E_BASE must carry an explicit port (got "${base}").`);
}
const token = process.env.LEM_E2E_TOKEN ?? "";

try {
  await assertPortAvailable(port);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--silent", "--", "--port", String(port), "--strictPort"],
  { stdio: "inherit", env: process.env },
);

child.on("exit", (code, signal) => {
  if (!serverVerified) {
    fail(
      `✗ The e2e dev server exited before identity verification (code=${code} signal=${signal}).`,
    );
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("close", (code) => process.exit(code ?? 0));

let serverVerified = false;
const deadline = Date.now() + IDENTITY_TIMEOUT_MS;
let lastProblem = "no response";

while (Date.now() < deadline) {
  if (child.exitCode !== null || child.signalCode) break; // exit handler reports
  try {
    const response = await fetch(`${url.origin}${E2E_IDENTITY_PATH}`);
    const body = await response.json();
    if (isIdentityMatch(token, body)) {
      serverVerified = true;
      console.log(`${E2E_READY_MESSAGE} on ${base} — this run's server, token confirmed.`);
      break;
    }
    lastProblem = `identity mismatch: ${JSON.stringify(body).slice(0, 200)}`;
  } catch {
    lastProblem = "endpoint not reachable yet";
  }
  await new Promise((resolve) => setTimeout(resolve, IDENTITY_POLL_MS));
}

if (!serverVerified) {
  child.kill("SIGTERM");
  fail(
    `✗ Could not verify the e2e server identity on ${base} within ${IDENTITY_TIMEOUT_MS / 1000}s.\n` +
      `  Last problem: ${lastProblem}\n` +
      `  This run refuses to test a port whose server cannot be proven to be this run's\n` +
      `  (issue #253). If a foreign process holds the port: ss -ltnp 'sport = :${port}'.`,
  );
}
