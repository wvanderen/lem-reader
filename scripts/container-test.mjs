#!/usr/bin/env node
// scripts/container-test.mjs — the container test wrapper (issue #253).
//
// The supported lane for three-engine (Chromium/Firefox/WebKit) functional
// tests on this Omarchy/Arch machine: a version-matched official Playwright
// Ubuntu container runs the app server and ALL browsers together — no /tmp
// compatibility libraries, no global LD_LIBRARY_PATH changes, no privileged
// containers, no replacement of Omarchy system libraries.
//
// Responsibilities:
//   - runs the project's OWN pins via the ONE resolveLanePlan seam (shared
//     with the doctor): installed @playwright/test → official image tag
//     (registry-verified, never assumed); .mise.toml → Node 22, verified
//     INSIDE the image before every run;
//   - worktree-safe dependencies: a docker volume (never the host's
//     node_modules) mounted at /work/node_modules, cached under a key over
//     lockfile + Node pin + Playwright version + image, initialized once
//     with `npm ci` and made caller-owned;
//   - file ownership, host-daemon-mode aware: under a ROOTFUL daemon the
//     container runs as the invoking uid:gid; under a ROOTLESS daemon
//     container uid 0 IS the host user, so no --user is passed (a host uid
//     there would map artifacts to a subordinate uid the caller does not
//     own) — either way test-results/, playwright-report/, and logs land on
//     the host readable and caller-owned;
//   - exit codes propagate from the container; full output is teed to
//     .container-e2e/logs/ (host-readable artifacts);
//   - server isolation: the managed e2e launcher (scripts/e2e-server.mjs)
//     runs inside the container's own network namespace — it can never touch
//     host ports, and the occupied-port/identity rules still apply inside.
//
// Usage:
//   node scripts/container-test.mjs [--rebuild-deps] [--prune-deps] [--shell] [--] <playwright test args…>
//   npm run test:e2e:container -- tests/e2e/pagination --project=webkit
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import {
  containerUserArgs,
  parseWrapperArgs,
  pruneCandidates,
  resolveLanePlan,
} from "./lib/container-lane.mjs";
import {
  inspectContainerDaemon,
  inspectContainerImage,
  containerDependenciesReady,
} from "./lib/container-environment.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const LOG_DIR = join(repoRoot, ".container-e2e", "logs");
const DOCKER_CMD_TIMEOUT_MS = 8_000;
const MANIFEST_TIMEOUT_MS = 60_000;
// First-time builds pull the official images (~1–2 GB); later builds are
// layer-cached. This is NOT a quick command — give it the documented budget.
const BUILD_TIMEOUT_MS = 30 * 60_000;

function log(message) {
  console.log(`[lem-e2e] ${message}`);
}

function fail(message) {
  console.error(`[lem-e2e] ${message}`);
  process.exit(1);
}

/** Run a docker command to completion with output teed to a log file. */
function spawnDockerWithTee(args, logPath, { interactiveStdin = false } = {}) {
  const child = spawn("docker", args, {
    cwd: repoRoot,
    stdio: [interactiveStdin ? "inherit" : "ignore", "pipe", "pipe"],
  });
  const logStream = createWriteStream(logPath, { flags: "a" });
  child.stdout?.on("data", (chunk) => {
    logStream.write(chunk);
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logStream.write(chunk);
    process.stderr.write(chunk);
  });
  const done = new Promise((resolveClose) => {
    child.on("close", (code) => {
      logStream.end();
      resolveClose(code);
    });
  });
  return { child, done };
}

// ── Arg + pin resolution (ONE lane plan, shared with the doctor) ────────────
const { rebuildDeps, pruneDeps, shell, passthrough } = parseWrapperArgs(process.argv.slice(2));

let plan;
try {
  plan = resolveLanePlan({
    packageJson: JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")),
    miseTomlText: readFileSync(join(repoRoot, ".mise.toml"), "utf-8"),
    lockfileSha256: createHash("sha256")
      .update(readFileSync(join(repoRoot, "package-lock.json")))
      .digest("hex"),
  });
} catch (err) {
  fail(`cannot resolve the lane's pins: ${err instanceof Error ? err.message : err}`);
}
const { playwrightVersion, nodePin, officialTag, imageName, volumeName } = plan;
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;

log(
  `lane pins: playwright ${playwrightVersion} → ${officialTag}; node ${nodePin}; deps volume ${volumeName}`,
);

// ── Docker reachability (actionable, never silent) ─────────────────────────
const daemon = inspectContainerDaemon({ cwd: repoRoot });
if (!daemon.ok) fail(daemon.reason);
log(`docker daemon reachable (server ${daemon.serverVersion})`);
const { rootlessDaemon } = daemon;
log(
  `daemon mode: ${rootlessDaemon ? "rootless (container root runs as you)" : "rootful (container runs as your uid:gid)"}`,
);

// ── Prune stale lane volumes (only ever lem-e2e-deps-*) ─────────────────────
if (pruneDeps) {
  const listed = spawnSync("docker", ["volume", "ls", "--format", "{{.Name}}"], {
    cwd: repoRoot,
    timeout: DOCKER_CMD_TIMEOUT_MS,
    encoding: "utf-8",
  });
  const stale = pruneCandidates((listed.stdout ?? "").split("\n").filter(Boolean), volumeName);
  for (const name of stale) {
    spawnSync("docker", ["volume", "rm", name], { cwd: repoRoot, timeout: DOCKER_CMD_TIMEOUT_MS });
    log(`pruned stale deps volume ${name}`);
  }
}

// ── Image: registry-verified, then built locally (layer-cached) ─────────────
let imageCheck = inspectContainerImage(plan, { cwd: repoRoot });
if (!imageCheck.present) {
  log(`image ${imageName} not present locally — verifying registry tags before pulling`);
  for (const tag of [officialTag, `node:${nodePin}-slim`]) {
    const manifest = spawnSync("docker", ["manifest", "inspect", tag], {
      cwd: repoRoot,
      timeout: MANIFEST_TIMEOUT_MS,
      encoding: "utf-8",
    });
    if (manifest.status !== 0) {
      fail(
        `required image tag ${tag} is NOT available in its registry. Verify the installed ` +
          "@playwright/test version against the published official images and the Node pin against " +
          'published node tags (docs/setup.md, "Upgrading Playwright"), then re-run.',
      );
    }
    log(`registry tag verified: ${tag}`);
  }
  log(
    `building ${imageName} (first build pulls the official images; later builds are layer-cached)`,
  );
  mkdirSync(LOG_DIR, { recursive: true });
  const buildLog = join(
    LOG_DIR,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-image-build.log`,
  );
  const build = await spawnDockerWithTee(
    [
      "build",
      "-f",
      join("docker", "playwright.Dockerfile"),
      "--build-arg",
      `PLAYWRIGHT_VERSION=${playwrightVersion}`,
      "--build-arg",
      `NODE_VERSION=${nodePin}`,
      "-t",
      imageName,
      "docker",
    ],
    buildLog,
  ).done;
  if (build !== 0) {
    fail(`image build failed (exit ${build}) — full log: ${buildLog}`);
  }
  imageCheck = inspectContainerImage(plan, { cwd: repoRoot });
}

// ── Node 22 selection verified INSIDE the image (issue #253 AC) ─────────────
if (!imageCheck.ok) {
  fail(
    `${imageCheck.reason}.\n` +
      "  Rebuild with: docker build -f docker/playwright.Dockerfile --no-cache --build-arg " +
      `PLAYWRIGHT_VERSION=${playwrightVersion} --build-arg NODE_VERSION=${nodePin} -t ${imageName} docker`,
  );
}
log(`node verified inside the image: ${imageCheck.nodeVersion}`);

// ── Dependencies volume: cached, initialized once, never the host's ─────────
if (rebuildDeps || !containerDependenciesReady(plan, { cwd: repoRoot })) {
  log(`${rebuildDeps ? "rebuilding" : "initializing"} the lane dependencies volume`);
  dockerSyncVolumeCreate(volumeName);
  dockerSyncVolumeCreate(`${volumeName}-lock`);
  mkdirSync(LOG_DIR, { recursive: true });
  const initLog = join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-deps-init.log`);
  const initCode = await spawnDockerWithTee(
    [
      "run",
      "--rm",
      "--init",
      "-u",
      "0:0",
      "-e",
      "npm_config_cache=/tmp/npm-cache",
      "-v",
      `${repoRoot}:/work`,
      "-w",
      "/work",
      "-v",
      `${volumeName}:/work/node_modules`,
      "-v",
      `${volumeName}-lock:/locks`,
      imageName,
      "bash",
      "scripts/container-deps.sh",
      "/work/node_modules",
      "/locks",
      rootlessDaemon ? "" : `${uid}:${gid}`,
      rebuildDeps ? "1" : "0",
    ],
    initLog,
  ).done;
  if (initCode !== 0) {
    fail(
      `dependencies volume initialization failed (exit ${initCode}) — full log: ${initLog}\n` +
        "  If the lockfile changed mid-run, retry once with: node scripts/container-test.mjs --rebuild-deps",
    );
  } else {
    log(`dependencies volume ready (log: ${initLog})`);
  }
}

function dockerSyncVolumeCreate(name) {
  const result = spawnSync("docker", ["volume", "create", name], {
    cwd: repoRoot,
    timeout: DOCKER_CMD_TIMEOUT_MS,
    encoding: "utf-8",
  });
  if (result.status !== 0 && !(result.stderr ?? "").includes("already exists")) {
    fail(`could not create the lane volume ${name}: ${firstLineOf(result.stderr)}`);
  }
}

function firstLineOf(text) {
  return (text ?? "").trim().split("\n")[0] ?? "";
}

// ── Run ──────────────────────────────────────────────────────────────────────
mkdirSync(LOG_DIR, { recursive: true });
const runLog = join(
  LOG_DIR,
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${shell ? "shell" : "run"}.log`,
);
const extraEnv = [];
if (process.env.LEM_E2E_BASE) extraEnv.push("-e", "LEM_E2E_BASE");

const dockerArgs = [
  "run",
  "--rm",
  "--init",
  "--ipc=host",
  "--pull",
  "never",
  ...containerUserArgs(rootlessDaemon, uid, gid),
  "-e",
  "HOME=/tmp",
  "-e",
  "npm_config_cache=/tmp/npm-cache",
  ...extraEnv,
  "-v",
  `${repoRoot}:/work`,
  "-w",
  "/work",
  "-v",
  `${volumeName}:/work/node_modules`,
  imageName,
  ...(shell ? ["bash"] : ["npx", "playwright", "test", ...passthrough]),
];

log(
  `${shell ? "opening a shell" : "running"} in the container lane (repo → /work, deps → volume ${volumeName})`,
);
log(`full output will be teed to ${runLog}`);

const { child, done } = spawnDockerWithTee(dockerArgs, runLog, { interactiveStdin: shell });
const code = await done;
if (code === 0) {
  log(
    `done — exit 0. Artifacts (host-readable): test-results/, playwright-report/; log: ${runLog}`,
  );
} else {
  log(`exited with code ${code}. Log: ${runLog}; artifacts: test-results/, playwright-report/`);
}
process.exit(code ?? 1);
