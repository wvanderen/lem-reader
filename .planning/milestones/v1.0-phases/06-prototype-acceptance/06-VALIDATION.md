---
phase: 6
slug: prototype-acceptance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from `06-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.61.1 (e2e/acceptance/perf) + Vitest 4.1.10 (unit) |
| **Config file** | `playwright.config.ts` (3-engine matrix; extended with throttled-mobile project — chromium-only) |
| **Quick run command** | `npm run test:e2e -- --grep acceptance` (acceptance specs only) |
| **Full suite command** | `npm run test` (unit + e2e, all 3 engines — Plan 04-11/05-05 precedent) |
| **Estimated runtime** | ~120–180 seconds (full suite, 3 engines) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:e2e -- --grep <relevant spec>` (the relevant slice, all 3 engines)
- **After every plan wave:** Run `npm run test` (full suite — no subset, no grep, no engine-skip)
- **Before `/gsd-verify-work`:** Full suite must be green + acceptance specs green + perf budget gate green
- **Max feedback latency:** ~180 seconds

---

## Per-Task Verification Map

> Filled by the planner. Each acceptance/perf/edge spec maps to its requirement + the shared invariant (D6-09).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-XX-01 | 01 | 1 | ACPT-01 | — | N/A | e2e | `npm run test:e2e -- --grep "core-reading-flow"` | ❌ W1 (NEW) | ⬜ pending |
| 6-XX-02 | 02 | 1 | ACPT-03 | — | Reader never blocked by measurement/font failure (V7) | e2e | `npm run test:e2e -- --grep "high-zoom"` | ❌ W1 (NEW) | ⬜ pending |
| 6-XX-03 | 02 | 1 | ACPT-03 | V12 test-only | Font-injection test-tier only | e2e | `npm run test:e2e -- --grep "font-failure"` | ❌ W1 (NEW) | ⬜ pending |
| 6-XX-04 | 03 | 1 | ACPT-04 | — | N/A | e2e + CI gate | `npm run perf` | ❌ W1 (NEW) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/acceptance/core-reading-flow.spec.ts` — ACPT-01 consolidated corpus flow (extends/siblings `open-every-fixture.spec.ts`)
- [ ] `tests/e2e/_edge-invariant.ts` — shared-invariant helper (D6-09): (a) full content reachable via keyboard in both modes; (b) no required function unreachable; (c) no overflow clips content
- [ ] `tests/e2e/high-zoom.spec.ts` — ACPT-03 high-zoom gap (400% + 320 CSS px reflow)
- [ ] `tests/e2e/font-failure.spec.ts` — ACPT-03 font-failure gap (block/delay/swap via injected `@font-face` + `page.route()`)
- [ ] `tests/e2e/perf/perf.harness.spec.ts` + `budget.compare.ts` + `budget.json` — ACPT-04 perf harness + regression CI gate
- [ ] `playwright.config.ts` extension — throttled-mobile project (chromium-only CPU + network throttle)
- [ ] `package.json` extension — `"perf"` script (mirrors `calibrate`)
- [ ] `docs/ACCEPTANCE-PROTOCOL.md` — versioned manual SR protocol (D6-08)

*Existing edge specs (`forced-colors`, `reduced-motion`, `reflow`, `touch-targets`, `panel-keyboard`, `section-announce`, `a11y`) audited in place against the shared invariant — no new file for those.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader flows (NVDA+Firefox, VoiceOver+Safari) | ACPT-02 | axe catches only automatable issues; SR output is not automatable cross-engine | Per `docs/ACCEPTANCE-PROTOCOL.md`: scripted checklist (open → read → switch mode → highlight+note CRUD → settings) + exploratory charter; zero-blocker pass policy (D6-07) |
| Full device-matrix perf (incl. firefox/webkit mobile) | ACPT-04 | CI hardware cannot faithfully represent throttled mobile across engines | Measure in `06-VERIFICATION.md` release sign-off |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
