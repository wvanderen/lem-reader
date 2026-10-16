# Test discipline: shared machine

The reference machine is not dedicated. The same Mac that runs these test suites also runs:

- this repo's self-hosted CI runner (`lem-reference`), executing the PR Playwright suite on every PR and push to `main`, and exhaustive three-engine coverage nightly (see `CONTRIBUTING.md`, "CI runners");
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

`npm run test:e2e:coverage` verifies discovery against the exhaustive configuration: every Chromium case must remain, and secondary-engine omissions must match reviewed files exactly. CI runs this check before browser execution. `npm run test:e2e` remains the exhaustive three-engine functional command for nightly/manual/release verification. CI uploads `.test-reports/functional.json` on success and failure so subsequent work can rank cases by duration. Compare timings on the same hardware and record machine load. `scripts/summarize-e2e.mjs` reports first-attempt and retry worker time separately — read flake retries as contention evidence, not suite cost.

The reference jobs (`e2e-reference`, `exhaustive-reference`) share a job-level
concurrency group and run serially; never dispatch a manual run while a PR
gate is mid-flight expecting parallel capacity, and treat timings from any
historical overlapping run as void.

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
