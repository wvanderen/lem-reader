# Test discipline: shared machine

The reference machine is not dedicated. The same Mac that runs these test suites also runs:

- this repo's self-hosted CI runner (`lem-reference`), executing the full three-engine Playwright suite on every PR and push to `main` (see `CONTRIBUTING.md`, "CI runners");
- often two to four concurrent T3 Code sessions in this or other repos, plus the user's browser and editor.

Treat machine load as an input to every test decision.

## Check load before long test commands

Run `uptime` first. A load average above ~6 on the 10-core reference box means contended (the `playwright.config.ts` worker-cap note records this same threshold as "ordinary multi-user load"). Under contention:

- Expect 2–3x inflation on e2e runs and up to 10x on unit tests. Observed 2026-10-09: unit suite 25 s quiet vs 290–313 s contended; full e2e budget ≈10 min vs 15–25 min contended.
- Do not read a slow run as a code regression, and do not re-run it hoping for a different number — check `uptime` again instead.
- Prefer `--project=chromium` and single-area specs while contended; the three-engine suite triples the load you add to an already loaded box.

## Iterate targeted, full suite once per task

- Single area: `npx playwright test tests/e2e/<area> --project=chromium`
- Single spec: `npx playwright test tests/e2e/<area>/<spec>.spec.ts --project=chromium`
- Unit: `npm run test:unit -- --run tests/unit/<area>` (whole suite baseline ≈25 s; minutes-long means contention — see above)
- Full three-engine suite once, at the end of the task. It is the expensive shape: budget ≈10 min quiet, several times that under contention.

Cap test-command timeouts at 15 minutes. A run that outlives the documented budget signals contention, machine sleep, or a hang; investigate (`uptime`, `ps`) rather than wait out a larger timeout.

## CI owns full-suite evidence when a PR is open

The `e2e-reference` CI job runs the identical full suite on this same box for every PR. With a PR open, check `gh run list` before launching a local full suite: if CI is mid-run, a local full run doubles the contention for both and duplicates evidence. Keep local runs targeted and let the gate gather the full-suite result.
