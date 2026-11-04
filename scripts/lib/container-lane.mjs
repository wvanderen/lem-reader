// scripts/lib/container-lane.mjs
// The container lane's version/caching contract (issue #253). The lane runs
// the project's OWN pins: the installed @playwright/test version selects the
// official Playwright Ubuntu image (tag availability is verified before any
// pull — never assumed), and the .mise.toml pin selects Node 22 inside the
// image (verified again inside the running container). The dependencies
// volume is cached under a key over lockfile + Node pin + Playwright version
// + image name, so any of those changing invalidates the cache. The volume
// namespace is the lane's alone (lem-e2e-deps-*), so pruning can never touch
// anything else on the machine. Pure logic; docker execution lives in
// scripts/container-test.mjs and scripts/bootstrap-machine.mjs.

import { createHash } from "node:crypto";

/** The lane's exclusive docker volume namespace. */
export const DEPS_VOLUME_PREFIX = "lem-e2e-deps-";

/**
 * The ONE lane resolution: derive every version-scoped identity the lane
 * uses, from the repo's own pin files. Both the wrapper and the doctor call
 * this — a single spelling so their volume/image identities can never
 * diverge (a prior draft passed a misnamed property and silently dropped the
 * lockfile from the cache key).
 * @param {{packageJson: object, miseTomlText: string, lockfileSha256: string}} inputs
 * @returns {{playwrightVersion: string, nodePin: string, officialTag: string, imageName: string, volumeName: string}}
 */
export function resolveLanePlan({ packageJson, miseTomlText, lockfileSha256 }) {
  const playwrightVersion = resolvePlaywrightVersion(packageJson);
  const nodePin = resolveNodePin(miseTomlText);
  const officialTag = officialPlaywrightImageTag(playwrightVersion);
  const imageName = localImageName(playwrightVersion, nodePin);
  const volumeName = depsVolumeName(
    depsCacheKey({ lockfileSha256, nodePin, playwrightVersion, imageName }),
  );
  return { playwrightVersion, nodePin, officialTag, imageName, volumeName };
}

/**
 * Container user mapping, host-daemon-mode aware. Under a ROOTFUL daemon the
 * container's uid equals the host uid, so artifacts are owned by the caller
 * only when `--user uid:gid` is passed. Under a ROOTLESS daemon container
 * uid 0 IS the invoking host user (extra users map into the subordinate
 * range), so the container must run as its default root and no --user flag
 * is passed — passing host uid there would map artifacts to a subordinate
 * host uid the caller does not own.
 * @param {boolean} rootlessDaemon whether the reachable daemon runs rootless
 * @param {number} uid invoking host uid (used in the rootful mapping only)
 * @param {number} gid invoking host gid
 * @returns {string[]} docker args (possibly empty)
 */
export function containerUserArgs(rootlessDaemon, uid, gid) {
  return rootlessDaemon ? [] : ["--user", `${uid}:${gid}`];
}

/**
 * Extract the EXACT installed @playwright/test version from the parsed
 * package.json. A floating range would let the image drift from the installed
 * test runner — refused loudly.
 */
export function resolvePlaywrightVersion(pkg) {
  const spec = pkg?.devDependencies?.["@playwright/test"];
  if (!spec) {
    throw new Error(
      "@playwright/test is not in package.json devDependencies — cannot size the container lane.",
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(spec)) {
    throw new Error(
      `@playwright/test must be pinned to an exact version for the container lane (got "${spec}"). ` +
        "The official Playwright image must match the installed Playwright version.",
    );
  }
  return spec;
}

/** Extract the exact Node pin from .mise.toml text. */
export function resolveNodePin(miseTomlText) {
  const match = /^\s*node\s*=\s*"(\d+\.\d+\.\d+)"\s*$/m.exec(miseTomlText ?? "");
  if (!match) {
    throw new Error(
      '.mise.toml must pin node to an exact version (node = "x.y.z" under [tools]) — the container lane selects the project\'s Node runtime inside the image.',
    );
  }
  return match[1];
}

/** The official Playwright Ubuntu image tag matching the installed version. */
export function officialPlaywrightImageTag(playwrightVersion) {
  return `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
}

/** The lane's locally built image, binding both the Playwright and Node versions. */
export function localImageName(playwrightVersion, nodePin) {
  return `lem-reader/e2e:v${playwrightVersion}-node${nodePin}`;
}

/**
 * The dependencies cache key: ANY change to the lockfile, Node pin,
 * Playwright version, or image invalidates the cached volume.
 */
export function depsCacheKey({ lockfileSha256, nodePin, playwrightVersion, imageName }) {
  return createHash("sha256")
    .update(["lem-e2e-deps/v1", lockfileSha256, nodePin, playwrightVersion, imageName].join("\n"))
    .digest("hex");
}

/** The cached dependencies volume name for a key. */
export function depsVolumeName(cacheKey) {
  return `${DEPS_VOLUME_PREFIX}${cacheKey.slice(0, 16)}`;
}

/**
 * Split wrapper argv into lane flags and the playwright test passthrough.
 * A "--" in the argv also forces everything after it into the passthrough, so
 * a spec argument that happens to collide with a lane flag stays safe.
 */
export function parseWrapperArgs(argv) {
  const parsed = { rebuildDeps: false, pruneDeps: false, shell: false, passthrough: [] };
  let passthroughOnly = false;
  for (const arg of argv) {
    if (passthroughOnly) {
      parsed.passthrough.push(arg);
    } else if (arg === "--") {
      passthroughOnly = true;
    } else if (arg === "--rebuild-deps") {
      parsed.rebuildDeps = true;
    } else if (arg === "--prune-deps") {
      parsed.pruneDeps = true;
    } else if (arg === "--shell") {
      parsed.shell = true;
    } else {
      parsed.passthrough.push(arg);
    }
  }
  return parsed;
}

/** Which of the given docker volumes the lane may prune (never the kept one, never foreign ones). */
export function pruneCandidates(volumeNames, keepName) {
  return volumeNames.filter(
    (name) =>
      name.startsWith(DEPS_VOLUME_PREFIX) && name !== keepName && name !== `${keepName}-lock`,
  );
}
