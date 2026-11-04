// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  inspectRootlessTools,
  isDockerGroupMember,
} from "../../scripts/lib/machine-prerequisites.mjs";

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function toolPath(tools: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "lem-rootless-tools-"));
  scratch.push(dir);
  for (const tool of tools) writeFileSync(join(dir, tool), "#!/bin/sh\n", { mode: 0o755 });
  return dir;
}

describe("Arch rootless prerequisites", () => {
  test("existing mapping binaries need no fictional uidmap package", () => {
    const tools = inspectRootlessTools(toolPath(["newuidmap", "newgidmap"]));
    expect(tools.missingPackages).toEqual(["rootlesskit", "slirp4netns"]);
  });
  test("missing mapping binaries request their Arch provider, shadow, once", () => {
    const tools = inspectRootlessTools(toolPath(["rootlesskit", "slirp4netns"]));
    expect(tools.missingPackages).toEqual(["shadow"]);
  });
  test("both mapping binaries are required", () => {
    expect(
      inspectRootlessTools(toolPath(["rootlesskit", "slirp4netns", "newuidmap"])).missingPackages,
    ).toEqual(["shadow"]);
  });
  test("a fully provisioned tool path is ready", () => {
    expect(
      inspectRootlessTools(toolPath(["rootlesskit", "slirp4netns", "newuidmap", "newgidmap"]))
        .missingPackages,
    ).toEqual([]);
  });
});

test.skipIf(process.platform === "win32")(
  "bootstrap diagnosis uses effective groups and recognizes installed mapping tools",
  () => {
    const dir = toolPath(["newuidmap", "newgidmap"]);
    // Read-only CLI regression: shim every command so this test cannot provision
    // packages, start services, or broaden the real host's permissions.
    const gid = process.getgroups?.()[0];
    expect(gid).toBeDefined();
    writeFileSync(join(dir, "getent"), `#!/bin/sh\necho 'docker:x:${gid}:reader'\n`, {
      mode: 0o755,
    });
    writeFileSync(join(dir, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    writeFileSync(join(dir, "systemctl"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, "../../scripts/bootstrap-machine.mjs")],
      {
        env: { ...process.env, PATH: dir },
        encoding: "utf-8",
        timeout: 10_000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("in docker group: yes");
    expect(result.stdout).toContain("newuidmap available, newgidmap available");
    expect(result.stdout).not.toMatch(/pacman[^\n]*\buidmap\b/);
  },
);

describe("effective Docker group membership", () => {
  test("detects membership using the current process group IDs", () => {
    expect(isDockerGroupMember("docker:x:987:lem", [1000, 987])).toBe(true);
  });
  test("does not treat pending membership in /etc/group as active", () => {
    expect(isDockerGroupMember("docker:x:987:lem", [1000])).toBe(false);
  });
  test("missing or malformed records fail closed", () => {
    for (const record of ["", "docker:x::lem", "docker:x:no-gid:lem"]) {
      expect(isDockerGroupMember(record, [0, 1000])).toBe(false);
    }
  });
});
