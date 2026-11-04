#!/usr/bin/env node
// scripts/bootstrap-machine.mjs — repeatable, explicit machine bootstrap for
// the container lane (issue #253).
//
// INVARIANTS (from the issue's acceptance criteria and boundaries):
//   - Rootless operation is preferred. Feasibility is inspected first.
//   - Nothing that broadens host permissions runs WITHOUT explicit approval:
//     every sudo-requiring step executes only when --approve-sudo is passed,
//     and adding the user to the ordinary `docker` group happens only with
//     the explicit --with-docker-group flag. By default this command
//     DIAGNOSES and prints the precise remaining prerequisites — it never
//     declares machine setup complete when it is not.
//   - No system-library transplants, no /tmp compat shims, no global runtime
//     changes.
//
// Usage:
//   node scripts/bootstrap-machine.mjs                        # diagnose only
//   node scripts/bootstrap-machine.mjs --check                # same, explicit
//   node scripts/bootstrap-machine.mjs --apply --lane=rootless [--approve-sudo]
//   node scripts/bootstrap-machine.mjs --apply --lane=rootful --approve-sudo [--with-docker-group]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectRootlessTools, isDockerGroupMember } from "./lib/machine-prerequisites.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const approveSudo = args.includes("--approve-sudo");
const withDockerGroup = args.includes("--with-docker-group");
const lane = args.find((a) => a.startsWith("--lane="))?.slice(7) ?? null;
const user = userInfo().username;
const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`;

function run(cmd, args_, { timeoutMs = 20_000 } = {}) {
  return spawnSync(cmd, args_, { timeout: timeoutMs, encoding: "utf-8" });
}
function ok(result) {
  return result.status === 0;
}
function firstLine(text) {
  return (text ?? "").trim().split("\n")[0] ?? "";
}
function say(text) {
  console.log(text);
}

// ── Machine facts ────────────────────────────────────────────────────────────
const facts = {
  dockerCli: ok(run("docker", ["--version"], { timeoutMs: 8_000 })),
  daemonReachable: ok(
    run("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 8_000 }),
  ),
  daemonActive: firstLine(run("systemctl", ["is-active", "docker"]).stdout) === "active",
  userInDockerGroup: isDockerGroupMember(firstLine(run("getent", ["group", "docker"]).stdout)),
  rootless: {
    ...inspectRootlessTools(),
    subuid: existsSync("/etc/subuid") && readFileSync("/etc/subuid", "utf-8").includes(`${user}:`),
    subgid: existsSync("/etc/subgid") && readFileSync("/etc/subgid", "utf-8").includes(`${user}:`),
    userUnitDir: existsSync(join(homedir(), ".config", "systemd", "user")),
  },
  socket: existsSync("/var/run/docker.sock")
    ? firstLine(run("ls", ["-l", "/var/run/docker.sock"]).stdout)
    : "(absent)",
};

const missingRootlessPkgs = facts.rootless.missingPackages;
const rootlessFeasibleAfterInstall = facts.rootless.subuid && facts.rootless.subgid;

function socketPathForLane(selectedLane) {
  return selectedLane === "rootless" ? `${RUNTIME_DIR}/docker.sock` : "/var/run/docker.sock";
}

// ── Diagnosis (always printed) ───────────────────────────────────────────────
say("bootstrap-machine — container lane diagnosis (issue #253)");
say("");
say("Machine facts:");
say(
  `  docker CLI:               ${facts.dockerCli ? "installed" : "MISSING (install docker via pacman)"}`,
);
say(`  system daemon (docker.service): ${facts.daemonActive ? "active" : "inactive"}`);
say(`  /var/run/docker.sock:     ${facts.socket}`);
say(`  user '${user}' in docker group: ${facts.userInDockerGroup ? "yes" : "no"}`);
say(`  daemon reachable now:     ${facts.daemonReachable ? "yes" : "no"}`);
say(
  `  rootless tools:           rootlesskit ${facts.rootless.rootlesskit ? "available" : "MISSING"}, slirp4netns ${facts.rootless.slirp4netns ? "available" : "MISSING"}`,
);
say(
  `  mapping helpers (shadow): newuidmap ${facts.rootless.newuidmap ? "available" : "MISSING"}, newgidmap ${facts.rootless.newgidmap ? "available" : "MISSING"}`,
);
say(
  `  subordinate UID/GID maps: ${facts.rootless.subuid && facts.rootless.subgid ? "present (/etc/subuid, /etc/subgid)" : "MISSING — rootless needs subuid/subgid entries for '${user}'"}`,
);
say("");

const prerequisites = [];

if (!facts.dockerCli) {
  prerequisites.push({
    lane: "rootless",
    approval: true,
    command: "sudo pacman -S --needed docker",
    why: "the docker CLI/daemon package is missing",
  });
}
if (missingRootlessPkgs.length > 0 && rootlessFeasibleAfterInstall) {
  prerequisites.push({
    lane: "rootless",
    approval: true,
    command: `sudo pacman -S --needed ${missingRootlessPkgs.join(" ")}`,
    why: "rootless Docker needs these packages; the subuid/subgid maps for this user are already present",
  });
}
if (!rootlessFeasibleAfterInstall && facts.dockerCli) {
  prerequisites.push({
    lane: "rootless",
    approval: true,
    command: `sudo sh -c 'echo "${user}:100000:65536" >> /etc/subuid && echo "${user}:100000:65536" >> /etc/subgid'`,
    why: "rootless Docker needs subordinate UID/GID ranges for this user",
  });
}
if (prerequisites.length === 0 && !facts.daemonReachable) {
  // All installable prerequisites are satisfied; the remaining step is the
  // user-level rootless daemon itself (no sudo involved).
  prerequisites.push({
    lane: "rootless",
    approval: false,
    command: "node scripts/bootstrap-machine.mjs --apply --lane=rootless",
    why: "start the rootless daemon via a systemd user unit",
  });
}

// ── Apply ────────────────────────────────────────────────────────────────────
if (apply) {
  if (!lane || !["rootless", "rootful"].includes(lane)) {
    console.error("--apply requires --lane=rootless (preferred) or --lane=rootful");
    process.exit(2);
  }

  if (lane === "rootless") {
    for (const prereq of prerequisites.filter(Boolean)) {
      if (!prereq.approval) {
        // An approval-free prerequisite is performed by this apply run itself
        // (e.g. starting the user-level daemon) — never re-spawned recursively.
        say(`(performed by this apply run — no approval needed): ${prereq.why}`);
        continue;
      }
      if (!approveSudo) {
        say("");
        say(`APPROVAL REQUIRED — ${prereq.why}:`);
        say(`  ${prereq.command}`);
        say("Re-run with --approve-sudo to let this script execute it, or run it yourself.");
        process.exit(1);
      }
      say(`[approved] running: ${prereq.command}`);
      const result = spawnSync("bash", ["-c", prereq.command], {
        stdio: "inherit",
        timeout: 300_000,
      });
      if (result.status !== 0) {
        say(
          `✗ prerequisite command failed (exit ${result.status}). Fix the cause above, then re-run — the script is idempotent.`,
        );
        process.exit(1);
      }
    }

    // Write the systemd USER unit for rootless dockerd (no sudo involved).
    const unitDir = join(homedir(), ".config", "systemd", "user");
    const unitPath = join(unitDir, "docker-rootless.service");
    const unit = [
      "[Unit]",
      "Description=Docker daemon (rootless, for the lem-reader container lane)",
      "After=network.target",
      "",
      "[Service]",
      "Environment=PATH=/usr/bin:/usr/local/bin:" + join(homedir(), ".local/bin"),
      `ExecStart=/usr/bin/rootlesskit --net=slirp4netns --disable-host-loopback --port-driver=builtin --copy-up=/etc --copy-up=/run /usr/bin/dockerd`,
      "ExecReload=/bin/kill -s HUP $MAINPID",
      "Restart=always",
      "RestartSec=5",
      "LimitNOFILE=infinity",
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n");
    const existing = existsSync(unitPath) ? readFileSync(unitPath, "utf-8") : "";
    if (existing !== unit) {
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(unitPath, unit);
      say(`wrote ${unitPath} (user-level unit — no sudo involved)`);
    } else {
      say(`unit already current: ${unitPath}`);
    }
    run("systemctl", ["--user", "daemon-reload"]);
    const enable = run("systemctl", ["--user", "enable", "--now", "docker-rootless"], {
      timeoutMs: 30_000,
    });
    if (!ok(enable)) {
      say(`✗ could not start the user-level daemon: ${firstLine(enable.stderr)}`);
      say("  Check: journalctl --user -u docker-rootless -n 50");
      process.exit(1);
    }
    // Wait for the rootless socket to appear.
    const socket = socketPathForLane("rootless");
    let appeared = existsSync(socket);
    for (let i = 0; i < 20 && !appeared; i++) {
      spawnSync("sleep", ["0.5"]);
      appeared = existsSync(socket);
    }
    if (!appeared) {
      say(
        `✗ the rootless socket ${socket} did not appear within 10s. Check: journalctl --user -u docker-rootless -n 50`,
      );
      process.exit(1);
    }
    say("");
    say(
      "Rootless daemon is up. Make it visible to docker clients in THIS shell and future shells:",
    );
    say(`  export DOCKER_HOST=unix://${socket}`);
    say(`  (persist it in your shell profile or a direnv/mise env file if you want it always on)`);
    say("");
    say(
      "Next — build the lane image and warm the dependencies cache (no further approval needed):",
    );
    say(
      "  DOCKER_HOST=unix://" +
        socket +
        " node scripts/container-test.mjs -- tests/e2e/scrim-dismiss.spec.ts --project=chromium",
    );
    process.exit(0);
  }

  if (lane === "rootful") {
    if (!approveSudo) {
      say("");
      say("APPROVAL REQUIRED — the rootful lane needs: sudo systemctl enable --now docker");
      say("Re-run with --approve-sudo, or run it yourself.");
      process.exit(1);
    }
    const start = spawnSync("sudo", ["systemctl", "enable", "--now", "docker"], {
      stdio: "inherit",
      timeout: 60_000,
    });
    if (start.status !== 0) {
      say(`✗ could not enable the system daemon (exit ${start.status}).`);
      process.exit(1);
    }
    if (!facts.userInDockerGroup) {
      if (!withDockerGroup) {
        say("");
        say(
          `The socket /var/run/docker.sock is root:docker — user '${user}' cannot connect without one of:`,
        );
        say(
          "  a) adding the user to the docker group (broadens daemon access — ONLY with your explicit choice):",
        );
        say(
          `       sudo usermod -aG docker ${user}   then log out and back in (or: newgrp docker)`,
        );
        say("       → this script runs it ONLY with the explicit --with-docker-group flag;");
        say(
          "  b) the rootless lane instead (preferred): node scripts/bootstrap-machine.mjs --apply --lane=rootless --approve-sudo",
        );
        process.exit(1);
      }
      say("[approved via --with-docker-group] sudo usermod -aG docker " + user);
      const groupAdd = spawnSync("sudo", ["usermod", "-aG", "docker", user], {
        stdio: "inherit",
        timeout: 30_000,
      });
      if (groupAdd.status !== 0) {
        say("✗ group add failed.");
        process.exit(1);
      }
      say("Group membership applies after a NEW login session (log out/in, or `newgrp docker`).");
      process.exit(0);
    }
    process.exit(0);
  }
}

// ── Diagnosis conclusion: precise remaining prerequisites ───────────────────
say(
  "Recommended lane: rootless (no daemon-access broadening; files the lane creates stay owned by you).",
);
say("");
if (facts.daemonReachable) {
  say("A reachable docker daemon is available — no provisioning prerequisites remain.");
  say("Next (builds the version-matched image and warms the dependencies cache):");
  say("  node scripts/container-test.mjs -- tests/e2e/scrim-dismiss.spec.ts --project=chromium");
} else {
  const actionable = prerequisites.filter(Boolean);
  if (actionable.length === 0) {
    say(
      "Remaining prerequisites could not be determined automatically — see the machine facts above.",
    );
  } else {
    say("Remaining prerequisites (this script never runs approval-requiring steps silently):");
    actionable.forEach((prereq, index) => {
      say(
        `  ${index + 1}. ${prereq.command}${prereq.approval ? "   # needs your approval (--approve-sudo, or run it yourself)" : "   # user-level, no sudo"}`,
      );
      say(`     (${prereq.why})`);
    });
    say("  Then: node scripts/bootstrap-machine.mjs --apply --lane=rootless");
    say("  Then: export DOCKER_HOST=unix://" + socketPathForLane("rootless"));
    say("  Then: node scripts/container-test.mjs -- <spec> --project=<engine>");
  }
  say("");
  say("Rootful alternative (requires the ordinary docker group OR sudo-docker; NOT silent):");
  say(
    "  node scripts/bootstrap-machine.mjs --apply --lane=rootful --approve-sudo [--with-docker-group]",
  );
  say("");
  say(
    'Full context: docs/setup.md ("Container lane"). The issue #253 contract: if provisioning is',
  );
  say("blocked, this diagnosis IS the deliverable — the precise prerequisite is listed above.");
}
process.exit(facts.daemonReachable ? 0 : 1);
