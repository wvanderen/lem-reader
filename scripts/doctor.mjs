#!/usr/bin/env node
// scripts/doctor.mjs — the agent-runnable environment doctor (issue #253).
//
// Reports, ONCE per invocation:
//   - runtime selection: the Node this invocation resolved, its verdict
//     against the repo's Node 22 contract, and the repo-local mise pin;
//   - requested browser availability per LANE: host (real launch probes,
//     Chromium/Firefox usually ready; WebKit on this Omarchy box is
//     launch-blocked on missing OS libraries) and the container lane
//     (daemon, version-matched image, deps volume, and real launch probes
//     inside the container).
//
// A launch-blocked engine is an environment blockage with a named fix — it
// is never reported as a test failure, and partial engine success is never a
// complete verdict: the exit code is 0 only when the runtime is supported
// AND every requested engine is ready on every requested lane. There is no
// "skip the probes" mode: an engine whose browser was not launched is not
// ready, by definition.
//
// Usage:
//   node scripts/doctor.mjs [--lane=host|container|both] [--engines=chromium,firefox,webkit] [--json]
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { checkNodeRuntime, REQUIRED_NODE_MAJOR } from "./lib/runtime.mjs";
import { aggregateLane, classifyBrowserFailure } from "./lib/doctor-core.mjs";
import { containerUserArgs, resolveLanePlan } from "./lib/container-lane.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const LAUNCH_TIMEOUT_MS = 20_000;

const args = process.argv.slice(2);
const laneArg = args.find((a) => a.startsWith("--lane="))?.slice(7) ?? "host";
const engines = (
  args.find((a) => a.startsWith("--engines="))?.slice(10) ?? "chromium,firefox,webkit"
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const asJson = args.includes("--json");
const lanes = laneArg === "both" ? ["host", "container"] : [laneArg];

function resolvePins() {
  try {
    return {
      plan: resolveLanePlan({
        packageJson: JSON.parse(readFileSync("package.json", "utf-8")),
        miseTomlText: readFileSync(".mise.toml", "utf-8"),
        lockfileSha256: createHash("sha256")
          .update(readFileSync("package-lock.json"))
          .digest("hex"),
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Runtime selection (once) ────────────────────────────────────────────────
const runtimeCheck = checkNodeRuntime(process.version);
const misePin = spawnSync("mise", ["exec", "--", "node", "--version"], {
  cwd: repoRoot,
  timeout: 10_000,
  encoding: "utf-8",
}).stdout?.trim();
const runtime = {
  selected: process.version,
  execPath: process.execPath,
  requiredMajor: REQUIRED_NODE_MAJOR,
  ok: runtimeCheck.ok,
  miseRepoPin: misePin || "(mise unavailable)",
  message: runtimeCheck.ok
    ? `Node ${process.version} — supported (repo pin resolves ${misePin || "?"}).`
    : `Node ${process.version} — NOT supported. Expensive scripts are gated by scripts/preflight.mjs. Fix: mise exec -- <command>.`,
};

// ── Host lane: real launch probes ───────────────────────────────────────────
async function probeHostLane() {
  const results = [];
  let playwright;
  try {
    playwright = await import("@playwright/test");
  } catch {
    return engines.map((engine) => ({
      engine,
      ok: false,
      kind: "not-installed",
      reason: "playwright packages not installed (node_modules missing?)",
      fix: "npm ci",
    }));
  }
  for (const engine of engines) {
    const browserType = playwright[engine];
    if (!browserType) {
      results.push({
        engine,
        ok: false,
        kind: "launch-blocked",
        reason: `unknown engine "${engine}"`,
        fix: "use chromium, firefox, or webkit",
      });
      continue;
    }
    // Missing binaries are reported without a launch attempt (fast path).
    try {
      const executable = browserType.executablePath();
      if (!existsSync(executable)) {
        results.push({
          engine,
          ok: false,
          ...classifyBrowserFailure(`Executable doesn't exist at ${executable}`),
        });
        continue;
      }
    } catch {
      results.push({
        engine,
        ok: false,
        ...classifyBrowserFailure(
          "Looks like Playwright was just installed or updated. Please run the following command to download new browsers: npx playwright install",
        ),
      });
      continue;
    }
    try {
      const browser = await browserType.launch({ headless: true, timeout: LAUNCH_TIMEOUT_MS });
      await browser.close();
      results.push({ engine, ok: true, kind: "ready" });
    } catch (err) {
      const classified = classifyBrowserFailure(String(err?.message ?? err));
      results.push({ engine, ok: false, ...classified });
    }
  }
  return results;
}

// ── Container lane: daemon + image + volume + in-container probes ───────────
function probeContainerLane() {
  const pins = resolvePins();
  if (pins.error) {
    return engines.map((engine) => ({
      engine,
      ok: false,
      kind: "launch-blocked",
      reason: pins.error,
      fix: "restore package.json/.mise.toml pins (docs/setup.md)",
    }));
  }
  const { nodePin, imageName, volumeName } = pins.plan;

  const dockerProbe = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    cwd: repoRoot,
    timeout: 8_000,
    encoding: "utf-8",
  });
  if (dockerProbe.status !== 0) {
    return engines.map((engine) => ({
      engine,
      ok: false,
      kind: "launch-blocked",
      reason: `docker daemon unreachable (${(dockerProbe.stderr ?? "").trim().split("\n")[0] || "no daemon"}, endpoint=${process.env.DOCKER_HOST ?? "default"})`,
      fix: "node scripts/bootstrap-machine.mjs  (prints the precise remaining prerequisites; approval-requiring steps are never run silently)",
    }));
  }
  const securityOptions =
    spawnSync("docker", ["info", "--format", "{{.SecurityOptions}}"], {
      cwd: repoRoot,
      timeout: 8_000,
      encoding: "utf-8",
    }).stdout ?? "";
  const rootlessDaemon = /rootless/i.test(securityOptions);

  const results = [];
  const imagePresent =
    spawnSync("docker", ["image", "inspect", imageName], {
      cwd: repoRoot,
      timeout: 8_000,
      encoding: "utf-8",
    }).status === 0;
  const nodeInside = imagePresent
    ? (
        spawnSync(
          "docker",
          ["run", "--rm", "--pull", "never", "--entrypoint", "node", imageName, "--version"],
          { cwd: repoRoot, timeout: 8_000, encoding: "utf-8" },
        ).stdout ?? ""
      ).trim()
    : "";
  const volumeReady =
    imagePresent &&
    spawnSync("docker", ["volume", "inspect", volumeName], {
      cwd: repoRoot,
      timeout: 8_000,
      encoding: "utf-8",
    }).status === 0;

  if (!imagePresent || nodeInside !== `v${nodePin}` || !volumeReady) {
    const problems = [];
    if (!imagePresent) problems.push(`image ${imageName} not built`);
    if (imagePresent && nodeInside !== `v${nodePin}`)
      problems.push(`image runs ${nodeInside || "no node"}, expected v${nodePin}`);
    if (!volumeReady) problems.push(`deps volume ${volumeName} not initialized`);
    return engines.map((engine) => ({
      engine,
      ok: false,
      kind: "launch-blocked",
      reason: problems.join("; "),
      fix: "node scripts/container-test.mjs  (builds/initializes on first use; docs/setup.md)",
    }));
  }

  const probe = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--ipc=host",
      "--pull",
      "never",
      ...containerUserArgs(rootlessDaemon, process.getuid?.() ?? 1000, process.getgid?.() ?? 1000),
      "-e",
      "HOME=/tmp",
      "-v",
      `${repoRoot}:/work`,
      "-w",
      "/work",
      "-v",
      `${volumeName}:/work/node_modules`,
      imageName,
      "node",
      "scripts/container-browser-probe.mjs",
      engines.join(","),
    ],
    { cwd: repoRoot, timeout: 180_000, encoding: "utf-8" },
  );
  const probed = new Map();
  for (const line of (probe.stdout ?? "").split("\n").filter((l) => l.trim().startsWith("{"))) {
    try {
      const verdict = JSON.parse(line);
      if (verdict.engine) probed.set(verdict.engine, verdict);
    } catch {
      // non-JSON line — ignore
    }
  }
  return engines.map((engine) => {
    const verdict = probed.get(engine);
    if (verdict) return verdict;
    return {
      engine,
      ok: false,
      kind: "launch-blocked",
      reason: "container probe produced no verdict (container failed to start?)",
      fix: `run node scripts/container-test.mjs --shell to inspect the lane; stderr: ${(probe.stderr ?? "").trim().slice(0, 200)}`,
    };
  });
}

// ── Report ──────────────────────────────────────────────────────────────────
const laneVerdicts = {};
for (const lane of lanes) {
  const results = lane === "host" ? await probeHostLane() : probeContainerLane();
  laneVerdicts[lane] = aggregateLane(lane, results);
}

const complete = runtime.ok && lanes.every((lane) => laneVerdicts[lane].complete);
const report = { runtime, lanes: laneVerdicts, complete };

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `doctor — runtime + requested browsers (${engines.join(", ")}) [${new Date().toISOString()}]`,
  );
  console.log(`  runtime:   ${runtime.message}`);
  if (!runtime.ok) console.log(`             selected via ${runtime.execPath}`);
  for (const lane of lanes) {
    const verdict = laneVerdicts[lane];
    for (const engine of engines) {
      const blocked = verdict.blocked.find((b) => b.engine === engine);
      if (blocked) {
        console.log(`  ${lane.padEnd(10)}✗ ${engine}: ${blocked.kind} — ${blocked.reason}`);
        console.log(`             fix: ${blocked.fix}`);
      } else {
        console.log(`  ${lane.padEnd(10)}✓ ${engine}: ready`);
      }
    }
    console.log(`  lane ${lane} verdict: ${verdict.summary}`);
  }
  console.log(
    complete
      ? "  OVERALL: verification-ready (all requested checks pass)."
      : "  OVERALL: NOT verification-ready — see the blocked items above.",
  );
}

process.exit(complete ? 0 : 1);
