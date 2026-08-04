---
phase: 3
slug: trustworthy-layout-measurement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + `@playwright/test` 1.61.1 (e2e + calibration) |
| **Config file** | `vitest.config.ts` (unit/component, jsdom env — NOT authoritative for layout), `playwright.config.ts` (3-engine: chromium, firefox, webkit) |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm run test` (unit + e2e; calibration harness via `npm run calibrate` / CI job) |
| **Calibration command** | `npx playwright test --project=chromium tests/e2e/calibration/` (×3 engines) |
| **Estimated runtime** | ~30–60 seconds (unit); calibration matrix varies (see Calibration Matrix) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite + calibration harness across all 3 engines with committed fingerprint passing the D3-10 diff. The calibration run is the load-bearing gate for PAGE-08.
- **Max feedback latency:** ~60 seconds (unit); calibration is a phase-gate, not per-task.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-xx-yy | TBD | 0 | PAGE-07 | — | N/A | unit | `npm run test:unit -- --run tests/unit/measurement/epoch.test.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | PAGE-07 | — | N/A | e2e | `npx playwright test tests/e2e/measurement/stale-drop.spec.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | PAGE-06 | — | N/A | e2e | `npx playwright test tests/e2e/measurement/last-valid-view.spec.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | PAGE-08 | — | N/A | e2e | `npx playwright test tests/e2e/calibration/` (× chromium, firefox, webkit) | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | D3-06 | — | N/A | unit | `npm run test:unit -- --run tests/unit/measurement/fontGate.test.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | D3-08 | — | N/A | unit | `npm run test:unit -- --run tests/unit/measurement/driftGuard.test.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | D3-05 | — | DiagnosticEvent Zod-validated at emit + consume boundary | unit | `npm run test:unit -- --run tests/unit/measurement/diagnostics.test.ts` | ❌ W0 | ⬜ pending |
| 03-xx-yy | TBD | 0 | D3-10 | — | N/A | e2e | `node tests/e2e/calibration/fingerprint.compare.js` (CI step) | ❌ W0 | ⬜ pending |

*Task IDs (`03-NN-MM`) backfilled once PLAN.md files exist. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/measurement/` module skeleton (types, engine, epoch, fontGate, textMeasurer, domMeasurer, driftGuard, diagnostics, useMeasurement) — no tests pass until this exists
- [ ] `tests/unit/measurement/epoch.test.ts` — PAGE-07 invariant
- [ ] `tests/unit/measurement/fontGate.test.ts` — D3-06
- [ ] `tests/unit/measurement/textMeasurer.test.ts` — adapter contract (Pretext mocked)
- [ ] `tests/unit/measurement/driftGuard.test.ts` — D3-08
- [ ] `tests/unit/measurement/diagnostics.test.ts` — D3-05 shape validation
- [ ] `tests/e2e/measurement/last-valid-view.spec.ts` — PAGE-06
- [ ] `tests/e2e/measurement/stale-drop.spec.ts` — PAGE-07 e2e
- [ ] `tests/e2e/calibration/` — calibration harness + fingerprint compare (PAGE-08, D3-08, D3-10)
- [ ] `calibration/fingerprint.json` — initial committed artifact (produced by first harness run)
- [ ] `package.json` — add `@chenglou/pretext@0.0.8`; consider a `calibrate` script

*Existing infrastructure (Vitest config, Playwright config, 3-engine project matrix, image-stub + IndexedDB-wipe `beforeEach` from `tests/e2e/typography-live-apply.spec.ts`) covers harness runtime needs. No new framework install required.*

---

## Calibration Matrix (PAGE-08 evidence)

The harness measures Pretext-predicted vs rendered-DOM for every eligible block across:
- **6 fixtures** (D3-09 shipped corpus: `essay-long-form`, `technical-post`, `figure-heavy`, `footnote-academic`, `list-reference`, `unsupported-case`).
- **Typography variants:** font {serif, sans, dyslexic} × size {16,18,20,22,24} × spacing {compact, comfortable, spacious} × measure {52,58,64,72}. Full matrix = 180 variants × 6 fixtures × 3 engines. Planner MAY sample a representative subset if too slow for CI, but MUST cover every font × spacing combination (drift drivers).
- **Eligible block kinds:** paragraph, heading (h1/h2/h3/h4 — distinct hardcoded geometry).
- **Per-block metrics (D3-02):** block-height drift (px) AND break-position match (boolean per line). A kind passes a cell iff height-drift ≤ bound AND every break matches.
- **Fingerprint artifact:** `calibration/fingerprint.json` — committed; CI diffs.
- **Tolerance bound (D3-02 discretion):** derived from the FIRST calibration run.

---

## Signal / Failure-Detection Boundaries

- **Unit tests (Vitest/jsdom):** prove the *invariants* (epoch drops late work; fontGate awaits; diagnostics shape validates; adapter calls Pretext with correct args). They do NOT prove layout correctness — jsdom is forbidden for layout truth.
- **Playwright e2e:** prove *reader-visible behavior* (last valid view retained; no console errors during rapid resize; calibration regression fails CI). These ARE authoritative for layout.
- **Calibration harness:** proves *measurement correctness* (Pretext within tolerance of DOM across the matrix). The committed fingerprint is the evidence PAGE-08 demands.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reader sees no visual churn while repagination recomputes after a font swap | PAGE-06 | Visual continuity judgment across the font-swap moment | Load a fixture; force a late @font-face load; confirm the last valid view stays painted until the new trusted result commits |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
