// tests/unit/container-lane.test.ts
// Issue #253 — the container lane's version/caching contract. The lane runs
// the project's OWN pins: the installed @playwright/test version selects the
// official Playwright Ubuntu image, and the .mise.toml pin selects Node 22
// inside it. The dependencies volume is cached under a key over the lockfile
// + runtime + image version, so any of those changing invalidates the cache —
// and the volume namespace is theirs alone, so pruning can never touch
// anything else on the machine. These cells pin the invalidation property
// (any input change → a different key) against synthetic inputs, not against
// snapshots of the repo's own files.
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  containerUserArgs,
  depsCacheKey,
  depsVolumeName,
  localImageName,
  officialPlaywrightImageTag,
  parseWrapperArgs,
  pruneCandidates,
  resolveLanePlan,
  resolveNodePin,
  resolvePlaywrightVersion,
  DEPS_VOLUME_PREFIX,
} from "../../scripts/lib/container-lane.mjs";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const baseInputs = {
  lockfileSha256: sha("lock-a"),
  nodePin: "22.23.4",
  playwrightVersion: "1.61.1",
  imageName: "lem-reader/e2e:v1.61.1-node22.23.4",
};

describe("version resolution — the lane runs the project's own pins", () => {
  test("the exact @playwright/test pin is read from package.json", () => {
    const pkg = { devDependencies: { "@playwright/test": "1.61.1" } };
    expect(resolvePlaywrightVersion(pkg)).toBe("1.61.1");
  });

  test("a floating @playwright/test range is refused — the image must match the installed version", () => {
    for (const range of ["^1.61.1", "~1.61.1", ">=1.61.0", "latest", "*"]) {
      expect(() =>
        resolvePlaywrightVersion({ devDependencies: { "@playwright/test": range } }),
      ).toThrow(/exact/i);
    }
  });

  test("a missing @playwright/test devDependency is refused", () => {
    expect(() => resolvePlaywrightVersion({ devDependencies: {} })).toThrow(/@playwright\/test/);
  });

  test("the Node pin is read from .mise.toml", () => {
    expect(resolveNodePin('[tools]\nnode = "22.23.4"\n')).toBe("22.23.4");
    expect(() => resolveNodePin('[tools]\nnode = "22"\n')).toThrow(/exact/);
    expect(() => resolveNodePin("[other]\nx = 1\n")).toThrow(/node/);
  });
});

describe("image naming — the official image matches the installed Playwright", () => {
  test("the official Ubuntu image tag follows the installed Playwright version", () => {
    expect(officialPlaywrightImageTag("1.61.1")).toBe("mcr.microsoft.com/playwright:v1.61.1-noble");
  });

  test("the local image name binds BOTH the Playwright and Node versions", () => {
    expect(localImageName("1.61.1", "22.23.4")).toBe("lem-reader/e2e:v1.61.1-node22.23.4");
  });
});

describe("deps cache — invalidated by runtime, lockfile, or image version", () => {
  test("the same inputs yield the same key", () => {
    expect(depsCacheKey(baseInputs)).toBe(depsCacheKey(baseInputs));
  });

  test("changing ANY input — lockfile, Node pin, Playwright version, or image — changes the key", () => {
    const baseline = depsCacheKey(baseInputs);
    expect(depsCacheKey({ ...baseInputs, lockfileSha256: sha("lock-b") })).not.toBe(baseline);
    expect(depsCacheKey({ ...baseInputs, nodePin: "22.24.0" })).not.toBe(baseline);
    expect(depsCacheKey({ ...baseInputs, playwrightVersion: "1.62.0" })).not.toBe(baseline);
    expect(
      depsCacheKey({ ...baseInputs, imageName: "lem-reader/e2e:v1.62.0-node22.23.4" }),
    ).not.toBe(baseline);
  });

  test("the volume name is namespaced, short, and derived from the key", () => {
    const name = depsVolumeName(depsCacheKey(baseInputs));
    expect(name.startsWith(DEPS_VOLUME_PREFIX)).toBe(true);
    expect(DEPS_VOLUME_PREFIX).toBe("lem-e2e-deps-");
    expect(name).toMatch(/^lem-e2e-deps-[0-9a-f]{16}$/);
    expect(depsVolumeName(depsCacheKey(baseInputs))).toBe(name);
  });
});

describe("wrapper args — flags are separated from the spec passthrough", () => {
  test("passthrough args reach playwright unchanged, in order", () => {
    const parsed = parseWrapperArgs([
      "--project=webkit",
      "tests/e2e/pagination/x.spec.ts",
      "--headed",
    ]);
    expect(parsed).toEqual({
      rebuildDeps: false,
      pruneDeps: false,
      shell: false,
      passthrough: ["--project=webkit", "tests/e2e/pagination/x.spec.ts", "--headed"],
    });
  });

  test("the wrapper flags are recognized and never leak into the passthrough", () => {
    const parsed = parseWrapperArgs([
      "--rebuild-deps",
      "--prune-deps",
      "--shell",
      "--",
      "--project=chromium",
    ]);
    expect(parsed.rebuildDeps).toBe(true);
    expect(parsed.pruneDeps).toBe(true);
    expect(parsed.shell).toBe(true);
    expect(parsed.passthrough).toEqual(["--project=chromium"]);
  });
});

describe("lane plan — the ONE resolution shared by wrapper and doctor", () => {
  const pkg = { devDependencies: { "@playwright/test": "1.61.1" } };

  test("resolves every version-scoped identity from the repo's own pins", () => {
    const plan = resolveLanePlan({
      packageJson: pkg,
      miseTomlText: '[tools]\nnode = "22.23.4"\n',
      lockfileSha256: sha("lock-a"),
    });
    expect(plan).toEqual({
      playwrightVersion: "1.61.1",
      nodePin: "22.23.4",
      officialTag: "mcr.microsoft.com/playwright:v1.61.1-noble",
      imageName: "lem-reader/e2e:v1.61.1-node22.23.4",
      volumeName: depsVolumeName(
        depsCacheKey({
          lockfileSha256: sha("lock-a"),
          nodePin: "22.23.4",
          playwrightVersion: "1.61.1",
          imageName: "lem-reader/e2e:v1.61.1-node22.23.4",
        }),
      ),
    });
  });

  test("a lockfile change changes the resolved volume (the #253 review regression: a misnamed property once dropped it)", () => {
    const before = resolveLanePlan({
      packageJson: pkg,
      miseTomlText: '[tools]\nnode = "22.23.4"\n',
      lockfileSha256: sha("lock-a"),
    });
    const after = resolveLanePlan({
      packageJson: pkg,
      miseTomlText: '[tools]\nnode = "22.23.4"\n',
      lockfileSha256: sha("lock-b"),
    });
    expect(after.volumeName).not.toBe(before.volumeName);
  });
});

describe("container user mapping — host-daemon-mode aware ownership", () => {
  test("rootful: run as the invoking uid:gid so bind-mounted artifacts are caller-owned", () => {
    expect(containerUserArgs(false, 1000, 1000)).toEqual(["--user", "1000:1000"]);
  });

  test("rootless: container uid 0 IS the host user; passing host uid would map to a subordinate uid", () => {
    expect(containerUserArgs(true, 1000, 1000)).toEqual([]);
  });
});

describe("prune candidates — the lane only ever touches its own volumes", () => {
  test("non-lane volumes are never candidates", () => {
    expect(
      pruneCandidates(
        ["lem-e2e-deps-aaaa", "lem-e2e-deps-bbbb", "postgres-data", "lem-reader-dev"],
        "lem-e2e-deps-aaaa",
      ),
    ).toEqual(["lem-e2e-deps-bbbb"]);
  });

  test("keeps the active cache's lock volume and prunes stale cache/lock pairs", () => {
    expect(
      pruneCandidates(
        [
          "lem-e2e-deps-current",
          "lem-e2e-deps-current-lock",
          "lem-e2e-deps-old",
          "lem-e2e-deps-old-lock",
        ],
        "lem-e2e-deps-current",
      ),
    ).toEqual(["lem-e2e-deps-old", "lem-e2e-deps-old-lock"]);
  });

  test("the kept volume is never a candidate, even when listed twice", () => {
    expect(
      pruneCandidates(["lem-e2e-deps-aaaa", "lem-e2e-deps-aaaa"], "lem-e2e-deps-aaaa"),
    ).toEqual([]);
  });
});
