---
phase: 21
slug: integrated-refinement-and-acceptance
status: populated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
populated: 2026-08-31
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from plan `<verify>` blocks + 21-RESEARCH §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + Playwright Test 1.61.1 (e2e: chromium / firefox / webkit + chromium-throttled) |
| **Config file** | Vitest defaults + `playwright.config.ts` (workers: 3 pinned; single Vite webServer :5173) |
| **Quick run command** | `npm run test:unit -- --run <file>` / `npx playwright test <spec> --project=chromium` |
| **Full suite command** | `npm run test` (unit --run && playwright; exit 0 = gate) + `npm run lint` (new milestone gate, D21-15) |
| **Estimated runtime** | Targeted unit ≲30 s; single-engine spec runs ≲2 min; full multi-engine gate minutes-scale (spine alone 90–120 s/engine) — the first honest gate run (21-06 Task 3) pins the real figure |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted command from the per-task map below
- **After every plan wave:** Run `npm run test:unit -- --run` (full unit suite)
- **Before `/gsd-verify-work`:** `npm run test` AND `npm run lint` both exit 0 (recorded gate ledger, webkit-starvation discipline per RESEARCH §Pitfall 5)
- **Max feedback latency:** ~120 s targeted (unit in seconds; single-engine e2e spec ≤2 min)

---

## Per-Task Verification Map

13 task-level `<verify>` commands across the 6 plans — the phase's complete feedback-sampling contract:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | POLISH-09 | T-21-01/02 | Clamp maps only the enumerated legacy 72→64; every other invalid measure still fails parse → corrupt (STATE-04/V5) | unit + component (TDD, RED-first) | `npm run test:unit -- --run tests/unit/settings/measure-clamp.test.ts tests/unit/settingsSchema.test.ts tests/unit/settings/mirror.test.ts tests/unit/storageFallback.test.ts && npm run test:unit -- --run tests/component/SettingsContext.test.tsx` | clamp test 🆕 in-task; 4 suites ✅ | ⬜ pending |
| 21-01-02 | 01 | 1 | POLISH-09 | — | N/A — truth assertion (64-"0" ruler vs surface width, both modes) | e2e (3 engines) | `npx playwright test tests/e2e/typography-live-apply.spec.ts tests/e2e/polish/cold-load-no-snap.spec.ts tests/e2e/polish/first-paint-mode-surface.spec.ts && npx playwright test tests/e2e/pagination` | ✅ (extend) | ⬜ pending |
| 21-02-01 | 02 | 1 | POLISH-08 | — | N/A — geometry-only CSS; no input surface | e2e | `npx playwright test tests/e2e/chrome/tag-popover.spec.ts` | ✅ | ⬜ pending |
| 21-02-02 | 02 | 1 | POLISH-08 | T-21-05 | Popover stays fully in-viewport at 240px via native flip fallbacks | e2e (3 engines, new spec) | `npx playwright test tests/e2e/chrome/tag-menu-geometry.spec.ts tests/e2e/chrome/tag-popover.spec.ts` | geometry spec 🆕 in-task | ⬜ pending |
| 21-03-01 | 03 | 2 | POLISH-10 | T-21-06 | Glyph stays decorative (aria-hidden, non-interactive) inside the native row button | unit + e2e | `npm run test:unit -- --run tests/unit/review-filter.test.ts && npx playwright test tests/e2e/review-panel/listing.spec.ts tests/e2e/review-panel/tri-state.spec.ts` | ✅ | ⬜ pending |
| 21-03-02 | 03 | 2 | POLISH-10 | — | N/A | e2e (3 engines) | `npx playwright test tests/e2e/review-panel` | ✅ (extend) | ⬜ pending |
| 21-04-01 | 04 | 3 | POLISH-11 | — | Audit changes no code — full unit suite green proves it | doc gate + unit | `test -s .planning/phases/21-integrated-refinement-and-acceptance/21-AUDIT-FINDINGS.md && grep -c 'Anti-Patterns' .planning/phases/21-integrated-refinement-and-acceptance/21-AUDIT-FINDINGS.md && grep -c 'D21-10' .planning/phases/21-integrated-refinement-and-acceptance/21-AUDIT-FINDINGS.md && npm run test:unit -- --run` | findings doc 🆕 in-task | ⬜ pending |
| 21-04-02 | 04 | 3 | POLISH-11 | T-21-08/09 | Remediation adds no dangerous HTML (check-no-danger) and weakens no a11y floor (a11y/forced-colors/reduced-motion green) | unit + e2e (a11y/edge) + script | `npm run test:unit -- --run && npx playwright test tests/e2e/a11y.spec.ts tests/e2e/forced-colors.spec.ts tests/e2e/reduced-motion.spec.ts && node scripts/check-no-danger.js` | ✅ | ⬜ pending |
| 21-05-01 | 05 | 4 | ACPT-07 | — | Journey exercises the existing validateBundle/zipSlip defenses; no new parsing code | e2e (3 engines, two-context) | `npx playwright test tests/e2e/portability/v21-core-flow-spine.spec.ts` | spine spec 🆕 in-task | ⬜ pending |
| 21-05-02 | 05 | 4 | ACPT-07 (D21-15) | T-21-10/11 | zipSlip edits behavior-identical — byte-stable unit + e2e regression nets green | lint + unit + e2e | `npx eslint src/portability/zipSlip.ts && npm run test:unit -- --run tests/unit/portability/zip-slip.test.ts && npx playwright test tests/e2e/portability/zip-slip-regression.spec.ts` | ✅ | ⬜ pending |
| 21-06-01 | 06 | 5 | ACPT-08 | — | N/A — extend existing invariant machinery (strengthen-only) | e2e (3 engines) | `npx playwright test tests/e2e/forced-colors.spec.ts tests/e2e/reduced-motion.spec.ts tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts tests/e2e/touch-targets.spec.ts tests/e2e/panel-keyboard.spec.ts` | ✅ (extend) | ⬜ pending |
| 21-06-02 | 06 | 5 | ACPT-08 | T-21-12 | Flow outcomes authored as role + accessible name + state (no verbatim SR-phrasing gates) | doc structural (grep) | `grep -c '1\.3' docs/ACCEPTANCE-PROTOCOL.md && grep -c 'Add dialog' docs/ACCEPTANCE-PROTOCOL.md && grep -c '21-VERIFICATION' docs/ACCEPTANCE-PROTOCOL.md && grep -c 'table of contents\\|TOC' docs/ACCEPTANCE-PROTOCOL.md` | ✅ (v1.2 ships; v1.3 authored in-task) | ⬜ pending |
| 21-06-03 | 06 | 5 | ACPT-08 (phase gate) | T-21-13/14 | Honest gate: every invocation recorded incl. red runs; webkit starvation classified, never silently green | phase gate (lint + full suite) | `npm run lint && npm run test` | ✅ | ⬜ pending |

*File Exists: ✅ = file ships today · extend = additive cells in an existing file · 🆕 in-task = created inside the owning task (RED-first where `tdd`) before its verify runs — zero `MISSING` references in the plan set. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No standalone Wave 0 — existing infrastructure (Vitest 4.1.10 + Playwright 1.61.1, both pinned) covers every phase requirement. RESEARCH §Validation Architecture's Wave 0 gaps were resolved by the plan set adopting in-task authoring:

- `tests/unit/settings/measure-clamp.test.ts` — authored RED-first inside 21-01 Task 1 (`tdd="true"`, behavior block present)
- `tests/e2e/chrome/tag-menu-geometry.spec.ts` — authored inside 21-02 Task 2 (after the Task 1 CSS lands)
- truthful-measure cells — additive describe inside 21-01 Task 2 (typography-live-apply.spec.ts extension)
- `tests/e2e/portability/v21-core-flow-spine.spec.ts` — authored inside 21-05 Task 1
- `21-AUDIT-FINDINGS.md` — authored inside 21-04 Task 1 (the audit's own artifact)
- ACCEPTANCE-PROTOCOL v1.3 capability flows — authored inside 21-06 Task 2

Zero `<automated>MISSING` references exist; every command runs against a file that exists by run time.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NVDA + Firefox run of protocol v1.3 | ACPT-08 | SR arm locked to real Windows hardware (D13-06/D13-07); NVDA unavailable on this macOS machine (RESEARCH Environment Availability) | Execute protocol v1.3 scripted flows + exploratory charters on NVDA+Firefox; record findings in the v1.3 results sheets; zero blocker/major flips the requirement (fix-then-re-run loop otherwise) |
| VoiceOver + Safari run of protocol v1.3 + D21-12 sighted image pass | ACPT-08 (+ D21-12) | SR arm locked to real hardware; real-Safari Blob→IDB truth cannot be proven in Playwright-webkit (D21-11 boundary) | Run the VO+Safari session per protocol v1.3, folding the one-time sighted image pass: save article with images → reopen offline → export → import → verify images; evidence in the v1.3 results sheets with a pointer from 21-VERIFICATION.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an in-task creation path (13/13 tasks across 6 plans; zero MISSING)
- [x] Sampling continuity: every task carries automated verify (no gaps, let alone 3 consecutive)
- [x] Wave 0 covers all MISSING references — none exist; new test files are authored inside their owning tasks (see Wave 0 section)
- [x] No watch-mode flags (unit invocations use `--run`; playwright invocations are single-shot)
- [x] Feedback latency ≲120 s targeted (unit in seconds; single-engine spec ≤2 min; full gate is wave/phase-scoped)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** populated 2026-08-31 from the six plans' 13 task-level `<verify>` blocks + 21-RESEARCH §Validation Architecture — ready for execution.
