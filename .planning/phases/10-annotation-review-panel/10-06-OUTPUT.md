# 10-06 OUTPUT — Full `npm run test` End-to-End Run Record (Phase 10 Honest-Suite Gate)

**Purpose:** Permanent record that the full automated suite was run end-to-end in a single
`npm run test` invocation, with honest pass + fail + skip counts — mirroring `04-11-OUTPUT.md`
and `09-07-OUTPUT.md` per the PROJECT.md honest-suite precedent. The executor ran the suite
itself; no prior SUMMARY's claim was trusted.

---

## 1. Command Run

```
npm run test
```

`package.json` defines `test` as: `npm run test:unit -- --run && npm run test:e2e`

- `test:unit` → `vitest` (jsdom; `tests/unit/**` + `tests/component/**`)
- `test:e2e`  → `playwright test` (chromium + firefox + webkit + chromium-throttled-mobile
  confined to `perf.harness`; `tests/e2e/**`)

No `--grep`, no filter, no subset aggregation, no engine skip, no watch flags. Single
invocation per recorded run, full output captured.

**Preconditions verified before the final run:**
- Working tree clean (`git status` → only the two pre-existing untracked
  `.planning/research/.cache/*.json` files, unrelated to this plan).
- Dev server NOT already running (port 5173 free — Playwright's `webServer` starts its own).
- All three browser engines installed; Node v22.22.3.

---

## 2. Honest Counts (the recorded exit-0 run)

**Run window:** 2026-08-16, ~5.9m e2e wall clock (vitest leg green first, then Playwright).

### By suite

| Suite | Tool | Passed | Failed | Skipped | Flaky |
|-------|------|--------|--------|---------|-------|
| Unit + component | vitest (jsdom) | **871** | 0 | 7 | 0 |
| E2E (3 engines + throttled perf profile) | playwright | **925** | 0 | 6 | 0 |
| **TOTAL** | | **1796** | **0** | **13** | **0** |

vitest summary line (verbatim): `Test Files  65 passed (65)` / `Tests  871 passed | 7 skipped (878)`
playwright summary line (verbatim): `925 passed (5.9m)` + `6 skipped`

### E2E by engine

| Engine | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| chromium | 308 | 0 | 2 |
| firefox  | 308 | 0 | 2 |
| webkit   | 308 | 0 | 2 |
| chromium-throttled-mobile (perf.harness only) | 1 | 0 | 0 |
| **Total**| **925** | **0** | **6** |

The 6 e2e skips are 2 per engine, both in `tests/e2e/ingestion/ssrf-matrix.spec.ts` and both
documented residuals (identical to the 09-07 baseline): "redirect-into-internal 302" (covered
by `safe-fetch.spec.ts` unit — Measure 9) and "DNS-rebinding refuses" (T-7-04 residual TOCTOU
on Node, closed by a future Workers deploy per D7-10). The 7 unit skips are the deliberate
set Phase 08 recorded. **13 intentional skips total — exactly the 09-07 baseline; no NEW
skip.** Exit 0 with skips ≠ zero-skips — the gate is fail=0.

---

## 3. Exit Status

```
EXIT_CODE=0
```

`npm run test` exited **0**. The `&&` chain in the `test` script means both `test:unit`
(exit 0, 871 passed / 7 skipped) AND `test:e2e` (exit 0, 925 passed / 6 skipped) succeeded.

---

## 4. First-Run Failure Triage (recorded honestly, then fixed)

The FIRST full invocation this plan ran was **exit 1**: unit green (871/0/7) but 1 webkit-only
e2e failure under full-suite parallel load — passing in isolation (835ms):

1. `typography-live-apply.spec.ts` READ-02 — the beforeEach `page.goto(BASE/)` exceeded the
   default 30s test budget when the webkit context's first module fetch was starved by
   sibling workers. This is the exact 09-07 load-race class (same mechanism as its
   section-announce cell). Fixed with `test.setTimeout(60_000)` — the 09-07 / calibration /
   perf-harness precedent; assertions byte-unchanged (commit `3d2b650`).

The exit-0 counts in §2 are from the re-run AFTER that fix — a clean single invocation, not
an aggregate across runs.

---

## 5. Stabilization Outcome (files note)

The plan's `files_modified` entry for `jump-bidirectional.spec.ts` anticipated possible
load-race stabilization during this gate; no such stabilization was needed there (the Task 1
loop cells were green in both the targeted run and both full-suite runs). The one
stabilization the gate demanded landed in `tests/e2e/typography-live-apply.spec.ts` (§4) —
a Phase 2 spec, test-only, semantics unchanged.

---

## 6. Anti-Pattern Guard (attestation)

- The executor ran `npm run test` itself (single invocation per recorded run). ✓
- The executor did NOT trust any prior SUMMARY's "green" claim — including the 10-02/03/04/05
  targeted-run counts. ✓
- The executor did NOT run a subset + aggregate for the gate. ✓
- The executor did NOT pass `--grep` or any filter. ✓
- The executor did NOT skip any engine. ✓
- Both pass AND fail counts are recorded for EVERY invocation (run 1: 1 failed, exit 1 —
  recorded in §4 with the fix; run 2: fail = 0, recorded honestly, not omitted). ✓
- The literal exit codes (1, then 0) are recorded. ✓

No euphemisms. No selective reporting. The suite is green; this file is the proof.
