# Test discipline: shared machine

> On the Omarchy/Arch development box: the repo-local Node 22 pin, the runtime
> preflight, the doctor, and the container three-engine lane (WebKit on Linux)
> are documented in [docs/setup.md](../setup.md) (#253). The reference-Mac
> CI gates and measurement budgets below are unchanged by that setup.

The reference machine is not dedicated. The same Mac that runs these test suites also runs:

- this repo's self-hosted CI runner (`lem-reference`), executing the PR Playwright suite on every PR and push to `main`, and exhaustive three-engine coverage nightly on the `nightly` ref — dispatched by `nightly.yml` so its conclusions never attach to `main`'s SHA (see `CONTRIBUTING.md`, "CI runners");
- often two to four concurrent T3 Code sessions in this or other repos, plus the user's browser and editor.

Treat machine load as an input to every test decision.

## Check load before long test commands

Run `uptime` first. A load average above ~6 on the 10-core reference box means contended (the `playwright.config.ts` worker-cap note records this same threshold as "ordinary multi-user load"). Under contention:

- Expect 2–3x inflation on e2e runs and up to 10x on unit tests. Observed 2026-10-09: unit suite 25 s quiet vs 290–313 s contended; full e2e budget ≈10 min vs 15–25 min contended.
- Do not read a slow run as a code regression, and do not re-run it hoping for a different number — check `uptime` again instead.
- Prefer `--project=chromium` and single-area specs while contended; the three-engine suite triples the load you add to an already loaded box.

## Targeted local verification; CI owns the full suite

- Single area: `npx playwright test tests/e2e/<area> --project=chromium`
- Single spec: `npx playwright test tests/e2e/<area>/<spec>.spec.ts --project=chromium`
- Unit: `npm run test:unit -- --run tests/unit/<area>` (whole suite baseline ≈25 s; minutes-long means contention — see above)
- Use affected specs locally; include all three engines for layout, focus, selection, zoom, and reflow changes. CI supplies full functional-suite evidence. Run a local full suite only to investigate a suite-wide failure or when CI evidence is unavailable and comprehensive verification is needed.
- Calibration and performance sampling use separate commands (`npm run calibrate`, `npm run perf`). Run them for measurement/pagination/font changes; nightly reference CI runs both with the existing thresholds.

Cap test-command timeouts at 15 minutes. A run that outlives the documented budget signals contention, machine sleep, or a hang; investigate (`uptime`, `ps`) rather than wait out a larger timeout.

## CI owns full-suite evidence when a PR is open

The `e2e-reference` CI job runs the PR functional suite on this same box for every PR. With a PR open, check `gh run list` before launching a local full suite: if CI is mid-run, a local full run doubles the contention for both and duplicates evidence. Keep local runs targeted and let the gate gather the full-suite result.

## Firefox launch on macOS 27

The pinned Playwright Firefox build still looks up the installed Firefox's
app-data directory even with a temporary profile. macOS 27 can deny access to
that directory, causing launch to hang before any test reaches the app
([upstream report](https://github.com/microsoft/playwright/issues/42768)).
`playwright.config.ts` gives Firefox alone a disposable CoreFoundation home
under the system temporary directory via `CFFIXED_USER_HOME`. The browser
binary, sandbox, profile isolation, and assertions remain unchanged. Remove
this compatibility override after the pinned build includes and verifies the
upstream fix (reported for Firefox 158).

## PR coverage and exhaustive coverage

`npm run test:e2e:pr` retains all functional cases in Chromium and defaults every spec to Firefox/WebKit as well. Reviewed application-state/API opt-outs and their rationale live in `tests/e2e/pr-coverage.json`. Keep specs with selection, focus, geometry, zoom, accessibility, download, or restoration assertions on all engines. New specs default to all engines; narrowing requires inspecting the entire file.

`npm run test:e2e:coverage` verifies discovery against the exhaustive configuration: every Chromium case must remain, and secondary-engine omissions must match reviewed files exactly. CI runs this check before browser execution. `npm run test:e2e` remains the exhaustive three-engine functional command for nightly/manual/release verification. CI uploads `.test-reports/functional.json` on success and failure so subsequent work can rank cases by duration. Compare timings on the same hardware and record machine load. `scripts/summarize-e2e.mjs` reports first-attempt and retry worker time separately — read flake retries as contention evidence, not suite cost. It also rolls outcomes up PER ENGINE (issue #254): unexpected/flaky/interrupted counts and actionable failure details per project, plus launch-failure classification, so one engine's passes cannot conceal another engine's failures.

The reference jobs (`e2e-reference`, `exhaustive-reference`) share a job-level
concurrency group and run serially; never dispatch a manual run while a PR
gate is mid-flight expecting parallel capacity, and treat timings from any
historical overlapping run as void.

## Heavy-test lease (reference Mac)

CI's reference jobs and local agent sessions share the reference Mac, and
nothing serialized the local ones against each other or against CI. The
heavy-test lease (issue #255) is that explicit coordination layer:

- `npm run lease:status` (or `node scripts/heavy-lease.mjs status`) prints
  lease ownership **and this host's identity + load average** — read it
  before interpreting any timing, so Linux development-box load is never
  mistaken for reference-Mac load (and vice versa).
- Wrap heavy commands: `node scripts/heavy-lease.mjs run --owner
"<you>@<host>:<purpose>" -- npx playwright test tests/e2e/pagination
--project=chromium`. The wrapper acquires, runs, and releases on exit and
  on SIGINT/SIGTERM/SIGHUP. The command gets a dedicated macOS/Linux process
  group: signals reach its descendants too, and ownership stays held until
  that group has stopped (with a 5-second grace before SIGKILL on interruption).
  Commands must not daemonize/detach work outside that group. A contender exits
  3 naming the holder instead of doubling the load (add `--wait-seconds N` to queue behind a finishing
  holder instead of failing fast — CI's steps do). The lease file lives in
  the per-user cache dir (`~/Library/Caches/lem-reader/` on macOS), shared
  across checkouts.
- Use `run`, not a separate acquire/release shell sequence: standalone
  `acquire` is rejected because its PID would exit before the protected work
  starts. `run` cleans up only its own acquisition token; `release --force`
  is reserved for deliberate manual removal and terminates no processes.
- Stale owners recover automatically: a dead same-host pid **with no remaining
  command process group**, an expired foreign-host holder, or a corrupt file.
  A LIVE same-host owner/workload stays held even past its TTL — expiry bounds
  unreachable owners, not visible ones. Acquire/recovery/release serialize
  their metadata mutations; a stale read can never overwrite a new holder.
- The deliberate override (`run --override`) replaces a live holder and
  records the supersession in the lease; use it when the holder is known
  wedged, and say so in the session log.
- Contention and override never kill or preempt another session. An interrupted
  `run` cleans up only its own process group. Targeted lightweight work (unit
  tests, lint, single specs that are not heavy) stays possible beside a holder.
  CI holds the lease during its heavy steps (see
  `.github/workflows/ci.yml` + `evidence.yml`), which preserves — not
  replaces — the existing job-level serialization and worker caps.

The initial opt-outs remove 72 secondary-engine executions (2,424 exhaustive cases → 2,352 PR cases); the round-2 duration-evidence audit adds `library/browse-open.spec.ts` (82 executions total → 2,342 PR cases) and retained every other expensive spec as correctly conservative (see testing-coverage.md, "Classification round 2"). This conservative pass is not expected to achieve the under-ten-minute goal by itself; use duration evidence to prioritize further classification and readiness improvements. The pagination family's shared settle sleeps are replaced by the observable readiness helpers in `tests/e2e/pagination/_harness.ts` (see testing-coverage.md, "Observable readiness") — new pagination specs should use them instead of fixed settle waits.

The functional suites' worker count is load-aware (`playwright.workers.ts`):
a loaded box keeps the 13-10 three-worker starvation cap, bounded by cores/2
on smaller machines, while a genuinely quiet window (both 1- and 5-minute
load averages under 3 at startup) runs cores/2 capped at 5 — the pre-cap
default. `--workers=N` overrides it for one-off runs. The measurement
harnesses pin `workers: 3` so calibration and perf comparisons stay
like-for-like regardless of box load, and CI pins the hosted `e2e` matrix
jobs to `--workers=3` so hosted evidence runs keep their pre-#185 shape.

The complete spec map and matrix decisions are in [testing-coverage.md](../testing-coverage.md). Rank uploaded reports with `node scripts/summarize-e2e.mjs <report.json>`; summed worker durations include retries and are distinct from wall time.

## Pagination event trail (opt-in diagnostics)

When a pagination/keyboard assertion fails, evidence beats theorizing. The DEV-only event trail (`src/reader/paginationTrail.ts`) records an ordered, bounded, content-free event history — turn receipt, publication/scope changes, canonical anchor movement, overflow check/correction — with per-event identity (`articleId`, `publicationSeq`, `turnSeq`) and cause. It is opt-in (`?lemPaginationTrail=1` or localStorage `lem.paginationTrail=1`), records nothing in production builds, and never carries article text or notes. Its snapshot states when it is NOT recording, so an empty trail is absence of instrumentation, never proof an event did not happen.

Specs enable it before navigation and attach it to failure artifacts through the shared helpers in `tests/e2e/pagination/_harness.ts` (`enablePaginationTrail`, `readPaginationTrail`, `attachPaginationTrail` — see `diagnostic-trail.spec.ts` for the usage pattern). A manual page refresh with the flag in the URL shows the same evidence in the console: `__lemPaginationTrail()`.

## Diagnosing failures

CI-repair and debug sessions on pagination/reflow bugs start from a red-capable feedback loop, not a theory: if your harness provides a `diagnosing-bugs` skill, use it — its phases (reproduce/minimise → ranked falsifiable hypotheses → one probe per prediction) are the discipline; the trail above is the instrumentation layer it consumes. Do not rerun full reference suites per hypothesis — use a targeted spec (`--project=chromium`) against the same seam. Reports distinguish **observations** (what the loop showed), **unverified hypotheses** (ranked, with predictions), and **demonstrated causes** (the hypothesis whose prediction the loop confirmed).
