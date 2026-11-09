# Machine setup: reproducible local execution (#253)

How a fresh session (human or agent) runs this repo's tests on a shared
development machine: a repo-local Node 22 pin, a fast runtime preflight, a
one-shot environment doctor, and — for three-engine functional coverage on
Linux — a version-matched Playwright container lane. The reference Mac's CI
gates and measurement budgets are unchanged by any of this; this document
covers LOCAL execution only.

For CI guest provisioning or reference-platform changes, follow the [approved Lemcentre migration plan](specs/lemcentre-ci-migration.md). That migration is pending; this local container lane is not itself the new authoritative CI environment.

## Fresh session, 30 seconds

```bash
cd lem-reader            # mise auto-selects Node 22.23.4 from .mise.toml
node --version           # → v22.23.4
npm ci                   # dependencies (NOT machine bootstrap — see below)
npm run doctor           # runtime + requested browsers, once, with verdicts
npm run test:unit -- --run tests/unit/<area>          # targeted unit
npx playwright test <spec> --project=chromium         # targeted functional
```

`npm ci` installs project dependencies. It is **not** machine bootstrap:
container/provisioning steps live in ["Container lane"](#container-lane-three-engines-including-webkit) and are never hidden inside dependency installation.

## Node runtime

- `.mise.toml` pins `node = "22.23.4"` for this directory only — the user's
  global default elsewhere on the machine is untouched. Plain `[tools]`
  entries are mise-auto-trusted (no prompt).
- CI installs Node 22 (`node-version: 22`); the contract is **major 22**.
- `scripts/preflight.mjs` gates every expensive script (`test:unit`,
  `test:e2e`, `test:e2e:pr`, `build`, `calibrate*`, `perf`). Under any other
  major it fails fast with the fix instead of burning minutes and producing
  misleading failures (jsdom/localStorage breakage that does not exist under
  Node 22).
- Wrong runtime (e.g. the machine's global Node 26 in an old shell): run the
  command under the pin — `mise exec -- <command>` — or start a fresh shell
  in the repo. If Node 22 is missing: `mise install`. Never change the
  global default for this repo.
- Bumping the pin: edit `.mise.toml`, run `mise install`, re-run `npm run doctor`.

## Verifying a session: the doctor

```bash
npm run doctor                                   # host lane (default)
npm run doctor -- --lane=container               # container lane
npm run doctor -- --lane=both --json             # machine-readable, for agents
npm run doctor -- --engines=webkit --lane=host   # one engine
```

One invocation reports: the resolved Node runtime and its verdict, and each
requested engine per lane. Host probes are real headless launches. An engine
that cannot start is reported **launch-blocked** (an environment blockage,
with the fix) — never as a test failure — and the exit code is 0 only when
every requested engine is ready on every requested lane. Partial success is
never a complete verdict.

## Local lanes (host-native, fast)

- Unit: `npm run test:unit -- --run tests/unit/<area>`
- Quick functional: `npx playwright test <spec> --project=chromium` (or
  `--project=firefox`). WebKit on Linux/Arch is expected launch-blocked —
  use the container lane for it.

### Server isolation (no more "unknowingly tested FlowSynth")

The managed e2e server never reuses another process's server:

- Default base URL is a **stable per-worktree port** (`tests/e2e/_server-port.mjs`,
  lane 5300–5699) — concurrent worktrees and sessions don't contend, and the
  shared dev server on :5173 is never targeted.
- An explicit `LEM_E2E_BASE=http://localhost:<port>` wins verbatim (CI's
  reference lane pins 15173 this way).
- An occupied port fails in milliseconds with the listener-hunting command
  (`ss -ltnp 'sport = :<port>'`) and the override hint — never silent reuse.
- `scripts/e2e-server.mjs` additionally proves the port answers with **this
  run's** server via a per-run token (`/__lem-e2e-identity`) before any test
  starts. Playwright waits only for the launcher's `LEM_E2E_SERVER_VERIFIED`
  message, not for an ordinary successful HTTP response. A wrong token never
  releases the test runner. The launcher binds `localhost` explicitly to
  `127.0.0.1` (and honors explicit IPv6 URLs), avoiding Vite/Node address-family
  disagreement inside Ubuntu containers.

## Container lane: three engines, including WebKit

The supported Linux lane for Chromium + Firefox + WebKit: one official
Playwright Ubuntu container runs the app server and all browsers, version-
matched to the project's own pins — the installed `@playwright/test` selects
the official image tag (registry-verified before pulling), `.mise.toml`
selects Node 22 **inside** the image (re-verified on every run). No /tmp
compatibility libraries, no `LD_LIBRARY_PATH` changes, no privileged
containers, no replacement of Omarchy system libraries.

```bash
npm run test:e2e:container -- <spec or dir> --project=webkit
node scripts/container-test.mjs -- tests/e2e/pagination --project=chromium
node scripts/container-test.mjs --shell        # debug inside the lane
```

- Dependencies are a docker volume **named per cache key** (lockfile + Node
  pin + Playwright version + image), initialized once with `npm ci` inside
  the container — the host's `node_modules` is never reused. `--rebuild-deps`
  forces a rebuild. A companion `<deps-volume>-lock` volume holds the install
  lock outside `node_modules`, where `npm ci` cannot unlink it; initialization
  and forced cache invalidation use that same lock across worktrees.
  `--prune-deps` removes only the lane's own stale deps/lock pairs and preserves
  both volumes for the active cache key.
- File ownership is host-daemon-mode aware: under a rootful daemon the
  container runs as your uid:gid; under a rootless daemon container uid 0 IS
  your host user. Either way `test-results/`, `playwright-report/`, and
  `.container-e2e/logs/` are host-readable and owned by you.
- Exit codes propagate; full output is teed to `.container-e2e/logs/`.
- Inside the container the app server binds the same worktree-derived port in
  the container's own network namespace — it cannot collide with host ports.

### Machine bootstrap (explicit, approval-gated)

Diagnose first — it prints the precise remaining prerequisites and never
claims machine setup is complete when it is not:

```bash
node scripts/bootstrap-machine.mjs
```

Rootless is the recommended lane (no daemon-access broadening; everything the
lane creates stays owned by you). The bootstrap checks for `rootlesskit`,
`slirp4netns`, `newuidmap`, and `newgidmap` on PATH. On Arch the mapping helpers
come from **shadow**, not a `uidmap` package; already available helpers need
no installation. This machine also has the subuid/subgid maps already.
Installing any missing packages requires **your** approval: either run the
printed `sudo pacman -S …` command yourself, or run
`node scripts/bootstrap-machine.mjs --apply --lane=rootless --approve-sudo`
to let the script execute it. Provisioning then starts the daemon via a
systemd **user** unit and prints the `DOCKER_HOST` to export.

The rootful alternative needs the ordinary `docker` group — the script
executes `usermod -aG docker` **only** with the explicit `--with-docker-group`
flag, and never silently. Membership is checked against the current process's
effective groups; newly added membership requires a new login session.

### Known Linux-WebKit engine divergences (record honestly, never exclude)

The container's Linux WebKit is NOT behavior-identical to the macOS
reference WebKit the functional specs were probed on. Known divergence
(2026-11-04, issue #254 verification): `pagination/page-turn-focus-handoff`
assumes WebKit "does NOT focus an activated button" (the macOS/Safari
signature its handoff heals); Linux WebKit KEEPS focus on the button, so
the four button-originated cells fail there — reproduced with the working
tree stashed, i.e. independent of any in-flight change. The macOS reference
gate owns those cells' WebKit truth; treat container failures in that spec
as lane divergence evidence, not regressions (and never as a reason to
exclude the engine).

## Upgrading Playwright (image update/revalidation)

1. Bump `@playwright/test` to the new **exact** version; `npm ci`.
2. `npx playwright install` (host lane binaries).
3. Re-run any container test: the wrapper derives the new official image tag
   from the installed version, verifies the tag exists in the registry, builds
   `lem-reader/e2e:v<version>-node<pin>`, and initializes a fresh deps volume
   under the new cache key. The previous image/volumes stay until
   `--prune-deps` cleans them.
4. `npm run doctor -- --lane=both` — all requested engines must be ready
   before you trust any run.

A floating `@playwright/test` range is refused: the image must match the
installed test runner.

## Recovery cookbook

| Symptom                                                        | Fix                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Preflight rejects the runtime (`Node v26.x is not supported…`) | `mise exec -- <command>`, or a fresh shell in the repo; `mise install` if Node 22 is absent |
| Doctor: `not-installed` on host                                | `npx playwright install <browser>` (matches the installed Playwright version)               |
| Doctor: `launch-blocked` (missing system libraries) on host    | expected for WebKit on Arch — run that engine via `npm run test:e2e:container`              |
| Wrapper: `docker daemon unreachable`                           | `node scripts/bootstrap-machine.mjs` — it names the exact remaining prerequisite            |
| Wrapper: registry tag not available                            | the installed Playwright/Node pin has no published image/tag — see "Upgrading Playwright"   |
| Wrapper: image runs wrong Node                                 | rebuild: the command is printed verbatim by the wrapper                                     |
| Managed server: port already in use                            | `ss -ltnp 'sport = :<port>'`; kill a leftover lane server or pin `LEM_E2E_BASE`             |
| Container tests fail with odd permissions on deps              | `node scripts/container-test.mjs --rebuild-deps`                                            |

## Boundaries

Linux WebKit evidence does not replace macOS Safari evidence; the reference
Mac's CI gates (`e2e-reference`, nightly exhaustive, calibration/perf) remain
authoritative. No dependency-version upgrades, global runtime changes, or
system-library transplants are part of this setup.
