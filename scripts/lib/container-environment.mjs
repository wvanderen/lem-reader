// Read-only Docker readiness inspection shared by the wrapper and doctor.
// Provisioning stays in their explicit apply/build paths. In particular an
// unreadable daemon mode is a blockage, never an assumed rootful mapping.
import { spawnSync } from "node:child_process";

function docker(args, { cwd, run = spawnSync } = {}) {
  return run("docker", args, { cwd, timeout: 8_000, encoding: "utf-8" });
}

function detail(result) {
  return (result.stderr ?? "").trim().split("\n")[0] || result.error?.message || "command failed";
}

export function inspectContainerDaemon(options) {
  const version = docker(["version", "--format", "{{.Server.Version}}"], options);
  const diagnose =
    "Diagnose with: node scripts/bootstrap-machine.mjs (docs/setup.md; host changes require approval).";
  if (version.status !== 0) {
    const problem =
      version.error?.code === "ENOENT"
        ? "docker CLI not found"
        : `docker daemon unreachable (${detail(version)}). endpoint=${process.env.DOCKER_HOST ?? "default context"}`;
    return {
      ok: false,
      reason: `${problem}\n  ${diagnose}`,
      serverVersion: "",
      rootlessDaemon: false,
    };
  }
  const security = docker(["info", "--format", "{{.SecurityOptions}}"], options);
  if (security.status !== 0) {
    return {
      ok: false,
      reason: `cannot determine docker daemon mode (${detail(security)}). ${diagnose}`,
      serverVersion: (version.stdout ?? "").trim(),
      rootlessDaemon: false,
    };
  }
  return {
    ok: true,
    reason: "",
    serverVersion: (version.stdout ?? "").trim(),
    rootlessDaemon: /rootless/i.test(security.stdout ?? ""),
  };
}

export function inspectContainerImage({ imageName, nodePin }, options) {
  const present = docker(["image", "inspect", imageName], options).status === 0;
  if (!present)
    return { present: false, ok: false, nodeVersion: "", reason: `image ${imageName} not built` };
  const node = docker(
    ["run", "--rm", "--pull", "never", "--entrypoint", "node", imageName, "--version"],
    options,
  );
  const nodeVersion = (node.stdout ?? "").trim();
  const ok = node.status === 0 && nodeVersion === `v${nodePin}`;
  return {
    present: true,
    ok,
    nodeVersion,
    reason: ok ? "" : `image runs ${nodeVersion || "no node"}, expected v${nodePin}`,
  };
}

export function containerDependenciesReady({ imageName, volumeName }, options) {
  return (
    docker(["volume", "inspect", volumeName], options).status === 0 &&
    docker(
      [
        "run",
        "--rm",
        "--pull",
        "never",
        "-v",
        `${volumeName}:/deps`,
        imageName,
        "test",
        "-f",
        "/deps/.deps-ready",
      ],
      options,
    ).status === 0
  );
}
