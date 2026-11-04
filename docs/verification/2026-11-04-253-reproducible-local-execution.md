# Reproducible local execution: verification record (issue #253)

Scope: a fresh agent session on the Omarchy/Arch development machine can run targeted unit tests and three-engine functional browser tests through documented, reproducible commands — repo-local Node 22 pin + preflight, an environment doctor, per-worktree e2e server isolation, a version-matched Playwright container lane, and an explicit approval-gated machine bootstrap. Companion to #187 (PR-gate throughput); reference-Mac CI gates unchanged.

Implementation: `.mise.toml`, `scripts/preflight.mjs`, `scripts/doctor.mjs`, `scripts/e2e-server.mjs`, `scripts/container-test.mjs`, `scripts/container-browser-probe.mjs`, `scripts/bootstrap-machine.mjs`, `scripts/lib/{runtime,doctor-core,container-lane}.mjs` (+ `.d.mts`), `tests/e2e/_server-port.mjs`, `dev-server/e2e-identity.mjs`, `docker/playwright.Dockerfile`, `docs/setup.md`, wired through `package.json` / `playwright.config.ts` / `vite.config.ts` / `tests/e2e/_base.ts`.

**Current status (2026-11-04, 17:17 UTC):** rootless Docker is reachable and the
normal targeted container command passes in Chromium, Firefox, and WebKit
(**3 tests**, exit 0). The earlier blocked states below are historical; see
[Container verification completed](#container-verification-completed).

## Acceptance criteria → evidence

| Criterion                                                                                                                                                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo-local mise pin selects verified Node 22 without changing the global default; fast preflight rejects unsupported runtimes before expensive work                                                                                  | `.mise.toml` pins `node = "22.23.4"` (auto-trusted plain `[tools]` form). In-repo `mise exec -- node --version` → v22.23.4; in `/tmp` → v26.7.0 (global default untouched). The contract is major 22 with the docs/stack.md Vite-8 floor (22.12+): `scripts/preflight.mjs` (pure seam `scripts/lib/runtime.mjs`, cells in `runtime-preflight.test.ts` including the 22.11/22.12 boundary) gates `test:unit`, `test:e2e`, `test:e2e:pr`, `build`, `calibrate*`, `perf`. Recorded rejection under the machine's global runtime: `node scripts/preflight.mjs` → exit 1, "✗ Node v26.7.0 is not supported… Fix — run this command under the repo-local pin: mise exec -- <your command>…". Under the pin the gate is silent and fast. `package.json` `engines: ">=22.12 <23"` documents the same contract.                                                                                                                                                                                                                                                                                                                                                               |
| Doctor reports runtime selection + requested browser availability once per invocation; launch-blocked ≠ app/test failure; partial success ≠ complete verification; host and container lanes supported                                | `scripts/doctor.mjs` (seam `scripts/lib/doctor-core.mjs`, cells in `doctor-core.test.ts`). Recorded host-lane run: `runtime: Node v22.23.4 — supported (repo pin resolves v22.23.4); chromium ready; firefox ready; webkit launch-blocked — host is missing OS system libraries (libicudata.so.74 class); fix: container lane, do not transplant libraries or set LD_LIBRARY_PATH. lane host: NOT complete… OVERALL: NOT verification-ready`, exit 1. Container-lane run with the daemon blocked: every requested engine reported launch-blocked ("docker daemon unreachable…"), fix pointing at `bootstrap-machine.mjs`, exit 1. `--json` emits the same verdict for agents. Missing binaries classify `not-installed` (`npx playwright install`); launch crashes/timeouts classify `launch-blocked` — never a test verdict.                                                                                                                                                                                                                                                                                                                                        |
| Version-matched, reproducible Playwright Ubuntu environment runs a targeted spec in all three engines without /tmp libraries, LD_LIBRARY_PATH changes, privileged containers, or system-library transplants; Node 22 verified inside | `docker/playwright.Dockerfile`: FROM `mcr.microsoft.com/playwright:v<installed>-noble`, Node binary copied from `node:<pin>-slim` (both registry-tag-verified before pull — never assumed). The wrapper pins are derived from the repo's own files and recorded: "lane pins: playwright 1.61.1 → mcr.microsoft.com/playwright:v1.61.1-noble; node 22.23.4; deps volume lem-e2e-deps-08476dd8b4dcbe10", plus an explicit in-image `node --version` verification step. **BLOCKED at demonstration time** (see "Provisioning state"): the daemon is unreachable, so the three-engine container run is the precise remaining step once provisioning is approved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Repeatable explicit machine-bootstrap command; rootless preferred; explicit approval for host/permission changes; never silently add docker group; blocked ⇒ precise prerequisite                                                    | `scripts/bootstrap-machine.mjs`. Feasibility inspection recorded (2026-11-04): docker CLI 29.9.2 installed; system daemon INACTIVE; stale socket `srw-rw---- root docker`; user `lem` in `wheel`, NOT in `docker`; rootlesskit/slirp4netns/uidmap MISSING; `/etc/subuid`+`/etc/subgid` entries for `lem` PRESENT; `dockerd-rootless-setuptool.sh` not shipped by Arch's docker package (bootstrap writes a systemd **user** unit itself — no sudo). Diagnosis output ends with the numbered prerequisite (`sudo pacman -S --needed rootlesskit slirp4netns uidmap`) and exits 1; `--apply --lane=rootless` without `--approve-sudo` stops and prints the exact command; `--with-docker-group` is the only path that touches group membership, and only when explicitly passed.                                                                                                                                                                                                                                                                                                                                                                                       |
| Wrapper: worktree-safe deps, cache invalidation by runtime/lockfile/image, file ownership, exit codes, logs, host-readable artifacts; never host node_modules                                                                        | `scripts/container-test.mjs` + seam `scripts/lib/container-lane.mjs` (cells in `container-lane.test.ts`: any input change ⇒ different key; volume namespace `lem-e2e-deps-*` only; `resolveLanePlan` shared by wrapper AND doctor so their identities cannot diverge). Deps live in a docker volume mounted at `/work/node_modules` (host `node_modules` shadowed, never reused), initialized once with `npm ci` under a flock guard; `--rebuild-deps` clears the marker for a fresh install; ownership is host-daemon-mode aware (`containerUserArgs`: rootful → `--user uid:gid`; rootless → container root, which IS the host user), so `test-results/`, `playwright-report/`, `.container-e2e/logs/` are host-readable and caller-owned; child exit code is the wrapper's; output teed to timestamped logs (image builds and dep inits get their own logs); `--prune-deps` removes only the lane's own stale volumes. Daemon-blocked demo: pins + volume resolve (recorded: `playwright 1.61.1 → mcr.microsoft.com/playwright:v1.61.1-noble; node 22.23.4; deps volume lem-e2e-deps-156d0520f0ee5fe0`), then the actionable unreachable-daemon failure (exit 1). |
| Server isolation: occupied ports / unexpected identity ⇒ explicit failure or safe isolated allocation, never silent reuse; deliberately occupied port verified                                                                       | `tests/e2e/_server-port.mjs` + `scripts/e2e-server.mjs` + `dev-server/e2e-identity.mjs` (cells in `e2e-server-isolation.test.ts`, including the deliberately-occupied-port case). Default base is stable per worktree (this worktree: `http://localhost:5515`), never :5173; `LEM_E2E_BASE` wins verbatim (CI parity verified on `http://localhost:5899`); `reuseExistingServer: false` everywhere. Live demo: a foreign listener held 5515 → managed run failed in ~1s: "✗ Managed e2e server port 5515 is already in use. This run never reuses another process's server (#253)… ss -ltnp 'sport = :5515' … LEM_E2E_BASE=http://localhost:<port>", exit 1. Identity: the launcher spawns Vite with a per-run token and verifies `/__lem-e2e-identity` echoes it before testing.                                                                                                                                                                                                                                                                                                                                                                                    |
| Host-native unit + quick Chromium/Firefox checks remain; fresh session discovers commands from concise docs; bootstrap not hidden in dependency install                                                                              | Unchanged commands (`npm run test:unit --`, `npx playwright test --project=…`) still work and now run under the pin. `docs/setup.md` opens with a 30-second fresh-session sequence (`npm ci` ≠ machine bootstrap, stated explicitly) and links from `AGENTS.md`, `CONTRIBUTING.md`, and `docs/agents/test-discipline.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Documentation: Playwright upgrade image handling; recovery from missing runtime/image/browser prerequisites                                                                                                                          | `docs/setup.md` "Upgrading Playwright" (exact pin → new official tag → registry verify → fresh cache key → doctor revalidation) and "Recovery cookbook" (wrong runtime, not-installed, launch-blocked, daemon unreachable, wrong Node in image, occupied port, stale deps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Demonstration: targeted unit success under Node 22; three-engine targeted functional success through the container; expected preflight failures under wrong runtime and unavailable browser/runtime service                          | Unit: full suite 3,878 passed / 16 skipped under v22.23.4 (load ≈ 2). Functional: `tests/e2e/scrim-dismiss.spec.ts` + `section-announce.spec.ts` × Chromium+Firefox = 12 passed; the three-engine container leg is the precise remaining prerequisite (below) and is single-command once provisioning lands. Wrong runtime: preflight rejection recorded above. Unavailable browser/runtime service: webkit launch-blocked (host) and daemon-unreachable (container) doctor verdicts recorded above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Provisioning state at initial implementation (historical)

The container lane is fully implemented but **not yet demonstrated end-to-end**: the docker daemon on this machine is inactive and the user cannot reach it, and provisioning requires one approval-requiring host step. Recorded state (2026-11-04, `node scripts/bootstrap-machine.mjs`):

- docker CLI 29.9.2; daemon inactive; socket root:docker (user cannot connect); user not in docker group.
- Rootless (preferred): `rootlesskit` and `slirp4netns` missing; the mapping
  helpers `newuidmap` and `newgidmap` are already installed via Arch's `shadow`
  package. Subuid/subgid maps are present. The original diagnosis incorrectly
  requested Debian's nonexistent-on-Arch `uidmap` package; see the follow-up below.

Remaining prerequisite, by the issue's contract:

1. `sudo pacman -S --needed rootlesskit slirp4netns` — needs the user's approval/execution.
2. `node scripts/bootstrap-machine.mjs --apply --lane=rootless --approve-sudo` — writes/starts the systemd user unit (no further sudo).
3. `export DOCKER_HOST=unix:///run/user/<uid>/docker.sock`.
4. `npm run test:e2e:container -- tests/e2e/<spec> --project=webkit` (first run builds the image and warms the deps cache).

No provisioning was performed automatically; no group membership, daemon, or package state was changed during this implementation.

## Checks

- `npx prettier --check`, `npm run lint`, `npm run typecheck`, `npm run test:e2e:coverage`, `npm run build`: pass (Node 22.23.4).
- Full unit suite once at the end: 3,878 passed, 16 skipped (load ≈ 2, 54s).
- Targeted functional: 12 passed (2 specs × Chromium+Firefox, managed identity-verified server on the derived port; override port 5899 verified separately).
- New seams: `runtime-preflight.test.ts`, `e2e-server-isolation.test.ts` (9), `doctor-core.test.ts` (9), `container-lane.test.ts` — 45 green across the four files after the review fixes.
- Load note (house discipline): the e2e run started at 1-min load 8.02 (unit-suite tail), passed regardless; no slowness was interpreted as regression.

## Two-axis review (independent reviewers, fresh contexts)

Standards (Codex) and Spec (Codex) reviewed the full diff independently of the implementation context. Findings and dispositions:

- **[standards, hard] Node floor**: docs/stack.md requires Node 22.12+ for Vite 8; the gate initially accepted any 22.x. FIXED — `REQUIRED_NODE_MIN_MINOR = 12` with a `too-old-minor` classification, boundary cells (22.11 rejected, 22.12 accepted), engines `>=22.12 <23`.
- **[spec P1 / standards, real bug] cache ignored the lockfile**: the wrapper passed a misnamed property, so the deps cache key silently omitted the lockfile hash and the doctor computed a different volume. FIXED — the ONE `resolveLanePlan` seam is now the only lane resolution for both tools, with a regression cell pinning that a lockfile change changes the resolved volume. Recorded volume name updated accordingly (`lem-e2e-deps-156d0520f0ee5fe0`).
- **[spec P1, real bug] first image build would die at the 8s command timeout**: FIXED — builds get an explicit 30-minute budget and their own log file.
- **[spec P1] rootless ownership mapping**: passing host uid inside a rootless daemon maps artifacts to a subordinate host uid. FIXED — `containerUserArgs` is daemon-mode aware (rootful → `--user uid:gid`; rootless → container root, which IS the host user), applied in the wrapper and the doctor, with cells and a docs/setup.md note.
- **[spec P1] bootstrap self-referential prerequisite**: the apply path could re-spawn itself as a "prerequisite". FIXED — approval-free prerequisites are recognized as performed by the apply run itself, never executed as child commands.
- **[spec P2] `--rebuild-deps` was a no-op** (the `.deps-ready` guard swallowed it): FIXED — the marker is cleared first, forcing a fresh `npm ci` in the same cached volume.
- **[spec P2 / speculative flag] `--skip-container-probe` reported skipped engines as ready**: FIXED — the flag is removed; a browser that was not launched is not ready, by definition (the doctor docstring now says so).
- **[spec P2] the container three-engine demonstration remains open** — the deliberately-blocked provisioning state recorded above, not a code defect; it completes in one command once the rootless packages are installed with the user's approval.

## PR #256 review follow-up

This section supersedes the earlier claims about image-build syntax, the
initialization lock, identity gating, and rootless package diagnosis. The
three-engine container demonstration remains blocked on Docker access; these
fixes do not constitute container execution evidence.

- **Image build:** Node is now a named `FROM node:${NODE_VERSION}-slim AS
node-runtime` stage, copied using `COPY --from=node-runtime`. BuildKit does
  not expand build arguments in `COPY --from`. A focused recipe regression
  catches that syntax; an actual image build is still outstanding.
- **Arch bootstrap:** executable inspection recognizes the installed UID/GID
  mapping helpers and requests `shadow` only if either is missing. It no
  longer prints an uninstallable `uidmap` prerequisite. Effective Docker
  membership uses `process.getgroups()`, not the nonexistent `userInfo().groups`.
  Regression coverage includes a read-only bootstrap CLI with shimmed commands.
- **Server readiness:** the actual Playwright configuration now waits only for
  the launcher's verified-identity message. Its former HTTP URL readiness check
  could win the race before token verification. A subprocess regression imports
  the real configuration: wrong-token startup must fail without running a test;
  a matching per-run token must release it.
- **Dependency locking:** the initializer holds a lock in a separate persistent
  companion volume, so `npm ci` cannot delete/recreate the locked inode. Forced
  rebuild invalidation also happens inside that lock. Real npm/subprocess tests
  cover concurrent initialization and cache rebuilds; pruning preserves the
  active deps/lock pair. These container-shell tests run on Linux only (`flock`
  is not required on the reference Mac host).
- **Shared inspection:** wrapper and doctor use the same read-only Docker
  daemon/mode, image/runtime, and dependency-marker checks. Failure to inspect
  daemon mode now blocks rather than guessing a file-ownership mapping.

Follow-up verification under Node 22.23.4:

- All nine targeted infrastructure test files pass: **68 tests**, including
  the new readiness, bootstrap, Docker-inspection, recipe, and locking regressions.
- Host-browser smoke: Add-dialog scrim dismissal passes in Chromium and Firefox
  (**2 tests**, one worker; load around 11 — no performance conclusion drawn).
- Formatting, lint, typecheck, production build, and functional discovery
  coverage pass (2,753 PR cases; 2,835 exhaustive cases; every Chromium case
  retained). The build emits its existing chunk-size/dynamic-import warnings.
- Live bootstrap now prints only `rootlesskit slirp4netns` as missing packages,
  recognizes both installed mapping helpers, and names the subsequent user-daemon
  apply step. Live wrapper and container doctor still fail explicitly on daemon
  permission denial; the doctor reports `complete: false`.
- No packages, services, groups, or other machine permissions were changed.
  Image build and three-engine container execution remain unverified.

## Container verification completed

After user-side rootless provisioning, the doctor reported all three container
engines ready. The first application-test run exposed a separate launcher bug:
Vite's `localhost` default bound only `::1`, while Node's identity fetch in the
Ubuntu image connected to `127.0.0.1` and received `ECONNREFUSED`. A direct
in-container probe confirmed that the identity endpoint returned 200 on `::1`
but refused IPv4. An explicit IPv6 base made the three tests pass, confirming
the address-family mismatch rather than a slow build or a token failure.

The launcher now passes an explicit `--host` to Vite and probes occupancy on
that same address: `localhost` uses `127.0.0.1`; explicit IPv6 URLs retain their
address (with brackets removed for the bind argument). The real-config launcher
regression covers IPv4, localhost, and explicit IPv6 with an IPv6-only default
server. Its IPv4 case failed before the fix and passes afterward.

Normal command, with no `LEM_E2E_BASE` workaround:

```bash
DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock mise exec -- npm run test:e2e:container -- \
  tests/e2e/scrim-dismiss.spec.ts --grep 'Add dialog' \
  --project=chromium --project=firefox --project=webkit --workers=1
```

Result at 17:17 UTC: **3 passed (15.3s)**, wrapper exit 0. Recorded pins:
Playwright 1.61.1 / official `v1.61.1-noble` image, Node v22.23.4 verified inside,
Docker 29.9.2 in rootless mode, dependencies volume
`lem-e2e-deps-156d0520f0ee5fe0`. Full local log:
`.container-e2e/logs/2026-11-04T17-17-05-548Z-run.log`.
Machine load was around 12; this is functional evidence, not a performance result.

Final checks after the bind-address fix: **71 targeted infrastructure tests**
pass; the container doctor reports all three engines verification-ready; the
host-native Chromium/Firefox smoke also passes (**2 tests**). Formatting, lint,
and typecheck pass.

This supersedes the outstanding image/container demonstration entries above.
No additional package installation or permission changes were made by the agent.
Host WebKit limitations and the reference Mac's authority are unchanged.

## Machine environment

Omarchy (Arch Linux), kernel-era glibc; mise 2026.10.23; Node 26.7.0 global, Node 22.23.4 repo pin (both mise-installed); Docker 29.9.2 rootless daemon reachable through `/run/user/1000/docker.sock`; UID/GID mapping helpers installed via shadow; `lem` remains outside the ordinary docker group; subuid/subgid maps present.
