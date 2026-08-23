# 11-06 OUTPUT — Full `npm run test` End-to-End Run Record (Phase 11 Honest-Suite Gate)

**Purpose:** Permanent record that the full automated suite was run end-to-end in a single
`npm run test` invocation, with honest pass + fail + skip counts — mirroring `04-11-OUTPUT.md`,
`09-07-OUTPUT.md`, and `10-06-OUTPUT.md` per the PROJECT.md honest-suite precedent. The executor
ran the suite itself; no prior SUMMARY's claim was trusted.

> **RESOLUTION (2026-08-17, continuation session):** the §2 exit-1 record below is the ORIGINAL
> honest RED run, retained verbatim for audit. The Rule 4 checkpoint has since resolved (user
> decisions: corpus swap to IDOM 50 editorial.pdf, TRACE running-head label deletions, resume
> section relabeling) — see §5 for the final GREEN gate run (`npm run test` exit 0).

---

## 1. Command Run

```
npm run test
```

`package.json` defines `test` as: `npm run test:unit -- --run && npm run test:e2e`

- `test:unit` → `vitest` (2 projects: `unit` + `server`, both jsdom; `tests/unit/**` + `tests/component/**`)
- `test:e2e`  → `playwright test` (chromium + firefox + webkit + chromium-throttled-mobile
  confined to `perf.harness`; `tests/e2e/**`)

No `--grep`, no filter, no subset aggregation, no engine skip, no watch flags. Single
invocation per recorded run, full output captured.

**Preconditions verified before the run:**
- Working tree clean except the committed Task-3 artifacts (3 production commits
  `2ac6940`, `903bec3`, `887e3b1` + the pre-existing untracked
  `.planning/research/.cache/*.json`, unrelated to this plan).
- Dev server NOT already running (Playwright's `webServer` starts its own).
- All three browser engines installed; Node v22.

---

## 2. Honest Counts (the recorded exit-1 run)

**Run window:** 2026-08-17, unit leg ~10.3s, then the `&&` chain short-circuited (unit exit 1
⇒ e2e leg not reached inside the single invocation).

### Unit leg (inside the single `npm run test` invocation)

| Suite | Tool | Passed | Failed | Skipped |
|-------|------|--------|--------|---------|
| unit + server projects | vitest (jsdom) | **968** | **1** | 10 |

vitest summary line (verbatim): `Test Files  1 failed | 69 passed | 1 skipped (71)` /
`Tests  1 failed | 968 passed | 10 skipped (979)`

**The 1 failure is the honest D11-06 bar gate itself, by design** —
`tests/unit/server/pdf-calibration/replay.spec.ts > validates the committed evidence against
the manifest at the D11-06 bar` (T-11-14/T-11-15: replay fails loudly while 3 of 6 corpus
files sit below the promotion bar pending human decisions — see §4 and the 11-06 Rule 4
checkpoint). The 10 skips are the 3 env-gated local-only derive skips (documented,
user-accepted D11-04 CI limitation) + the 7 pre-existing documented intentional skips
(identical to the 09-07/10-06 baseline).

### E2E leg

`&&` short-circuited — the e2e leg did NOT run inside the recorded invocation. For the
record (clearly labeled **supplementary separate invocations**, not part of the gate run):

| Run | Passed | Failed | Skipped |
|-----|--------|--------|---------|
| Full `npm run test:e2e` (supplementary) | **941** | **5** | 6 |
| The 5 failed specs re-run in isolation (supplementary) | **20/20** | 0 | 0 |

Supplementary per-engine counts: chromium 315/0/2, firefox 314/1/2, webkit 311/4/2.

All 5 supplementary failures are **load flakes, not regressions**: each passes on retry in
isolation (the 09-07 webkit load-race precedent; one firefox pdf-intake dedupe cell that is
green in isolation and exercises no changed id logic). None touches code changed by 11-06.
The 6 e2e skips are the documented ssrf-matrix residuals (2/engine, identical to the
09-07/10-06 baseline).

### Literal exit code

```
npm run test → exit 1   (unit leg failed at the honest calibration bar gate)
```

**The phase gate is RED.** It stays red until the 11-06 Rule 4 checkpoint resolves the three
human decisions below; the replay spec is the load-bearing enforcement of "never a silent
skip" (T-11-15) and "no uncalibrated promotion" (T-11-14).

---

## 3. Anti-Pattern Attestation

- The executor ran the suite itself (`npm run test`, one invocation, output captured to a log
  file; counts above transcribed from that log, not from any SUMMARY claim).
- Failures are recorded honestly — including the gate's own red exit code and the flake
  classification for the supplementary e2e run. No subset was presented as the full suite;
  no engine was skipped; the short-circuit is disclosed, not hidden.
- The 5 e2e flakes were re-run and disclosed as supplementary evidence, not merged into the
  gate record.

---

## 4. Why the gate is red — the three open D11-06 items (Rule 4 checkpoint)

The committed `pdf-evidence.json` records, at the current corpus-calibrated thresholds:

| Corpus file | Class | Verdict | Agreement |
|-------------|-------|---------|-----------|
| Lunar Meditation -word.pdf | single-column | admitted ✓ | **0.94** ✓ |
| T.J.CHISUM HX DATA-scanned.pdf | scanned | refused:pdf-scanned ✓ | — |
| wage-labour-capital-1-col.pdf | single-column | admitted ✓ (was refused round-trip-anchor-failed) | **0.9356** ✓ |
| TRACE_INSTITUTE_WHITE_PAPER-borderline.pdf | borderline | admitted ✓ | 0.8932 ✗ (bar 0.90) |
| WilliamVanDeren-resume-latex.pdf | single-column | admitted ✓ | 0.6154 ✗ (bar 0.90) |
| YouAreTheOne book-2-col.pdf | multi-column | refused:round-trip-anchor-failed ✗ (expected pdf-multi-column) | — |

1. **YouAreTheOne book-2-col.pdf** — geometric proof the PDF is single-column: MediaBox
   `[0,0,396,612]`, body items individually span the full 301pt measure with coherent
   English; only 3/223 text-bearing pages (TOC pages) detect as columnar. Forcing a
   pdf-multi-column refusal would require `columnarMajorityRatio ≈ 0.013` — refusing ANY
   document with one columnar-looking page — violating locked D11-03 and flipping the
   synthetic 1-of-3 test. Its anchor refusal is caused by duplicated front/back matter
   (half-title + title, copyright + colophon), not running heads (those strip correctly;
   549 coherent blocks flow). **Decision needed:** replace with a genuinely multi-column
   PDF (manifest SHA update; no labels needed) OR reclassify + label OR direct the honest
   single-column admission path.
2. **TRACE 0.8932** — the residual gap is two label artifacts ("A Science of Reality:
   Observers, Interfa" ×2) that describe RUNNING HEADS, not document content (the string
   appears in the PDF only as the title and the per-page heads); deleting those two labels
   lifts the projection to ≈0.913. The other four misses are honest equation
   reading-order/boundary disagreements.
3. **Resume 0.6154** — the corrected labels are internally inconsistent: Summary / Core
   Strengths / Experience are labeled heading-split, while geometrically identical
   Selected Projects / Education & Certification are labeled paragraph-merged (same
   17.9pt gap-above, same size/family — no extractor signal separates them). Relabeling
   those two as heading + paragraph lifts the projection to ≈1.0 with the shipped arms.

---

## 5. The final GREEN gate run (post-checkpoint continuation, 2026-08-17)

Same command, same single-invocation discipline, after the three user decisions were applied
(commit `b5fe525`): corpus swap to IDOM 50 editorial.pdf (refuses `pdf-multi-column`), TRACE's
two running-head labels deleted, resume sections relabeled heading + paragraph, plus the
corpus-evidenced `scriptFragmentGapRatio` calibration (TRACE 0.8932 → 0.92; synthetic
extremes 35/35 green before the gate run).

### Unit leg (inside the single `npm run test` invocation)

| Suite | Tool | Passed | Failed | Skipped |
|-------|------|--------|--------|---------|
| unit + server projects | vitest (jsdom) | **969** | **0** | 10 |

vitest summary (verbatim): `Test Files 70 passed | 1 skipped (71)` /
`Tests 969 passed | 10 skipped (979)`. The previously-failing replay bar gate now PASSES
(the committed evidence satisfies the D11-06 bar). The 10 skips are the unchanged documented
set (3 env-gated derive + 7 pre-existing intentional).

### E2E leg (same invocation, after `&&`)

| Engine | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| chromium | 315 | 0 | 2 |
| firefox | 315 | 0 | 2 |
| webkit | 315 | 0 | 2 |
| chromium-throttled-mobile (perf.harness) | 1 | 0 | 0 |
| **e2e total** | **946** | **0** | **6** |

Playwright summary (verbatim): `6 skipped` / `946 passed (5.9m)`. The 5 flakes from the §2
supplementary run all passed inside this single invocation — zero flakes, zero failures. The
6 e2e skips are the documented ssrf-matrix residuals (2/engine, identical to baseline).

### Literal exit code

```
npm run test → exit 0   (both legs green inside ONE invocation)
```

**The phase gate is GREEN.** Note for honesty: a dev server from a prior manual session was
already listening during this run (`node_modules/.bin/vite`, pid 84265, started Sun);
Playwright's webServer reuses an existing server on the port, so the e2e leg ran against that
instance. Exit 0 with 946/946 e2e either way; disclosed rather than silently restarted.

### Anti-pattern attestation (green run)

- The executor ran the suite itself (`npm run test`, one invocation, full output captured to a
  log file; counts above transcribed from that log).
- No subset, no `--grep`, no engine skip, no watch flags; both legs ran inside the single
  invocation; pass AND skip counts recorded; the prior RED record above was not overwritten.

---

*Executor: 11-06 continuation agent, 2026-08-17 (RED record) and 11-06 close-out continuation agent, 2026-08-17 (GREEN record).*
