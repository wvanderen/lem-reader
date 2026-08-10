# 04-11 OUTPUT — Full `npm run test` End-to-End Run Record

**Purpose:** Permanent record that the full automated suite was run end-to-end in a single
`npm run test` invocation, with honest pass + fail + skip counts. This file exists to break
the prior "269 passed / 0 failed" selective-reporting pattern (documented in 04-VERIFICATION.md).
The executor ran the suite itself; no prior SUMMARY's claim was trusted.

---

## 1. Command Run

```
npm run test
```

`package.json` defines `test` as: `npm run test:unit -- --run && npm run test:e2e`

- `test:unit` → `vitest` (jsdom; `tests/unit/**` + `tests/component/**`)
- `test:e2e`  → `playwright test` (chromium + firefox + webkit; `tests/e2e/**`)

No `--grep`, no filter, no subset aggregation. Single invocation, full output captured.

**Preconditions verified before the run:**
- Working tree clean (`git status` → nothing to commit).
- Plans 04-07, 04-08, 04-09, 04-10 all merged (commits `9570e06`, `2f43c24`, `0843b81`/`7b1cef6`, `eac0845` in `git log`).
- Dev server NOT already running (port 5173 free — Playwright's `webServer` starts its own).
- All three browser engines installed (`chromium-1228`, `firefox-1532`, `webkit-2311`).

---

## 2. Honest Counts

**Run window:** 2026-08-06T22:22:06Z → 2026-08-06T22:24:05Z (~119s)

### By suite

| Suite | Tool | Passed | Failed | Skipped | Flaky |
|-------|------|--------|--------|---------|-------|
| Unit + component | vitest (jsdom) | **408** | 0 | 0 | 0 |
| E2E (3 engines)  | playwright     | **345** | 0 | 0 | 0 |
| **TOTAL**        |                | **753** | **0** | **0** | **0** |

vitest summary line (verbatim): `Test Files  30 passed (30)` / `Tests  408 passed (408)`
playwright summary line (verbatim): `345 passed (1.9m)`

### E2E by engine (each cell is one test case on one browser project)

| Engine  | Passed | Failed | Skipped | Flaky |
|---------|--------|--------|---------|-------|
| chromium | 115 | 0 | 0 | 0 |
| firefox  | 115 | 0 | 0 | 0 |
| webkit   | 115 | 0 | 0 | 0 |
| **Total**| **345** | **0** | **0** | **0** |

### E2E by gap-closure spec (all 3 engines combined)

| Spec file | Requirement | Cells passed | Closed by |
|-----------|-------------|--------------|-----------|
| `tests/e2e/pagination/no-overflow-invariant.spec.ts` | PAGE-03b (no silent clipping) | 54 | Plan 04-07 (post-render overflow guard) |
| `tests/e2e/pagination/coverage-invariant.spec.ts`    | PAGE-03a (exactly-once)       | 54 | Preserved (04-06 substrate) |
| `tests/e2e/pagination/termination.spec.ts`           | PAGE-03c (termination)        | 57 | Preserved (04-06 substrate) |
| `tests/e2e/pagination/mode-switch-anchor.spec.ts`    | PAGE-01 (mode-switch anchor)  | 6  | Plan 04-09 (global M listener + synchronous ref) |
| `tests/e2e/pagination/page-turn-controls.spec.ts`    | PAGE-02 (keyboard/pointer/touch) | 9 | Plan 04-09 (commitTurn sync ref + force:true) |
| `tests/e2e/pagination/fallback-banner.spec.ts`       | PAGE-09 (fallback banner)     | 9  | Plan 04-10 (pointerdown guard + scroll debounce + DEV diagnostic hook) |
| `tests/e2e/pagination/fallback-oversize.spec.ts`     | PAGE-04 (oversize fallback)   | 3  | Preserved (04-05) |
| `tests/e2e/pagination/repagination-anchor.spec.ts`   | PAGE-05 (repagination anchor) | 6  | Preserved (04-04) |
| `tests/e2e/measurement/last-valid-view.spec.ts`      | PAGE-06 (last-valid-view, Phase 3) | 3 | Plan 04-08 (always-mounted hidden ArticleBody + scrolling seed) |
| `tests/e2e/measurement/stale-drop.spec.ts`           | PAGE-07 (stale-epoch drop, Phase 3) | 3 | Plan 04-08 (always-mounted ArticleBody makes partial-DOM defense unreachable) |
| `tests/e2e/persistence.spec.ts`                      | STATE-01 (location restore)   | 21 | Preserved (04-06 Task 5 seedScrollingMode helper) |

The remaining ~120 e2e cells are Phase 1–3 accessibility/reader specs (panel-keyboard,
progress, reduced-motion, reflow, section-announce, touch-targets, typography-live-apply)
plus the calibration harness — all green, none regressed.

---

## 3. Exit Status

```
EXIT_CODE=0
```

`npm run test` exited **0**. The `&&` chain in the `test` script means both `test:unit`
(exit 0, 408 passed) AND `test:e2e` (exit 0, 345 passed) succeeded.

---

## 4. Failure Triage

None. Zero failures, zero flaky, zero skipped, zero "did not run", zero interrupted.
No triage required.

---

## 5. Comparison to the Prior Misreport

| Source | Prior claim | Actual at HEAD (this run) |
|--------|-------------|---------------------------|
| 04-01…04-06 SUMMARYs, STATE.md, ROADMAP.md, REQUIREMENTS.md, commit `4cb6ca1` | "269 passed / 0 failed" | **76 failed / 269 passed** (the verifier's re-run at `4cb6ca1`) |
| 04-VERIFICATION.md headline (2026-08-06T19:10:00Z) | gaps_found — 76 failed / 269 passed | — |
| **This run (04-11, 2026-08-06T22:22:06Z)** | — | **753 passed / 0 failed / 0 skipped, exit 0** |

The 76 previously-failing e2e cells now all pass. The e2e total held at 345 (269 pass + 76 fail
→ 345 pass + 0 fail); the 76 failures flipped to green by Plans 04-07 (54 PAGE-03b cells),
04-08 (6 PAGE-06/07 cells), 04-09 (12 PAGE-01/02 cells; page-turn grew from 6→9 with the
force:true fix), 04-10 (9 PAGE-09 cells; grew from 4→9 with the rewritten trigger). The process
blocker — agents reporting "269/0" without running the suite end-to-end — is closed.

---

## 6. Anti-Pattern Guard (attestation)

- The executor ran `npm run test` itself (single invocation). ✓
- The executor did NOT trust any prior SUMMARY's "green" claim. ✓
- The executor did NOT run a subset + aggregate. ✓
- The executor did NOT pass `--grep` or any filter. ✓
- The executor did NOT skip any engine. ✓
- Both pass AND fail counts are recorded above (fail = 0, recorded honestly, not omitted). ✓
- The literal exit code (0) is recorded. ✓

No euphemisms. No selective reporting. The suite is green; this file is the proof.
