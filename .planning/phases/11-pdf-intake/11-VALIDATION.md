---
phase: 11
slug: pdf-intake
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-16
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, projects `unit` + `server`) + Playwright 1.61.1 (e2e, chromium/firefox/webkit) |
| **Config file** | vitest.config.ts (workspace projects) + playwright.config.ts |
| **Quick run command** | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` (per-task targeted file) |
| **Full suite command** | `npm run test` (one invocation — the honest gate; 04-11/09-07 precedent) |
| **Estimated runtime** | unit ~40s; e2e ~4–6 min (3 engines); calibration replay < 5s |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted vitest/playwright file(s) from `<verify><automated>`
- **After every plan wave:** Run `npm run test:unit -- --run` + the phase's playwright project files
- **Before `/gsd-verify-work`:** Full suite must be green (11-06 Task 3 records it in 11-06-OUTPUT.md)
- **Max feedback latency:** ~60s per task (targeted files only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | — | T-11-SC | Human approves unpdf legitimacy + exact pin before install | checkpoint | (blocking human-verify gate) | n/a | ⬜ pending |
| 11-01-02 | 01 | 1 | — | T-11-01, T-11-05 | Schemas widen additively; caps defined; no unpdf import under src/ | unit | `npx vitest run tests/unit/ingestion-schema.test.ts && npx tsc --noEmit` | ✅ (extends) | ⬜ pending |
| 11-01-03 | 01 | 1 | — | — | Synthetic fixtures committable (NOT the D11-04 corpus) | unit + e2e | `node tests/fixtures/pdf/generate-synthetic-pdfs.ts && npx vitest run tests/unit/server/pdf-to-blocks.spec.ts tests/unit/server/ingest-pdf.spec.ts && npx playwright test pdf-intake` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | ING-04 | T-11-01/03/06/08 | Caps before extraction; timeout race; page-weighted detect+refuse; encrypted/corrupt typed | unit | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` | ✅ (sentinel → suite) | ⬜ pending |
| 11-02-02 | 02 | 2 | ING-04 | T-11-05 | Block JSON inert; outline-first headings; honest unsupported blocks; sane titles | unit | `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 3 | ING-04 | T-11-10/11/12 | pdf-hash id stability; decoded size re-check; D11-07/09 chains | unit | `npx tsc --noEmit` (behavior proven by 11-03-02) | ✅ (source) | ⬜ pending |
| 11-03-02 | 03 | 3 | ING-04 | T-11-02 | 413 pre-read body cap; round-trip anchor on admitted PDF; typed refusals | unit | `npx vitest run tests/unit/server/ingest-pdf.spec.ts && npm run test:unit -- --run` | ✅ (sentinel → suite) | ⬜ pending |
| 11-04-01 | 04 | 2 | ING-04 | — | Client posts widened envelope; typed refusal throw; re-validation intact | unit | `npx vitest run tests/unit/ingestion-client.test.ts` | ✅ (extends) | ⬜ pending |
| 11-04-02 | 04 | 2 | ING-04 | T-11-02/04/09 | Pre-POST size cap; exact calm copy; bundle free of pdfjs code | unit + build | `npx vitest run tests/unit/pdf-copy.test.ts && npm run build && npm run test:unit -- --run` | ❌ W0 | ⬜ pending |
| 11-05-01 | 05 | 4 | ING-04 | T-11-03/04/13 | Refusals prove copy AND zero side effects; dedupe; upload→read | e2e | `npx playwright test pdf-intake` | ✅ (sentinel → suite) | ⬜ pending |
| 11-05-02 | 05 | 4 | ING-04 | — | Annotate + location restore identical to other articles | e2e | `npx playwright test pdf-intake` | ✅ | ⬜ pending |
| 11-06-01 | 06 | 5 | ING-04 | T-11-07 | Manifest SHA-256 integrity; D11-06 bar validation; refuse-empty | unit | `npx vitest run tests/unit/server/pdf-calibration/harness.test.ts && git check-ignore corpus/pdf/x.pdf` | ❌ W0 | ⬜ pending |
| 11-06-02 | 06 | 5 | — | — | Human supplies real corpus (cannot be synthesized per D11-04) | checkpoint | (blocking human-verify gate) | n/a | ⬜ pending |
| 11-06-03 | 06 | 5 | ING-04 | T-11-14/15 | Evidence at the bar; replay never silently skips; honest full gate | integration + full | `npm run calibrate:pdf && npx vitest run tests/unit/server/pdf-calibration && npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/server/pdf-to-blocks.spec.ts` — sentinel created by 11-01 Task 3, suite filled by 11-02
- [ ] `tests/unit/server/ingest-pdf.spec.ts` — sentinel created by 11-01 Task 3, suite filled by 11-03
- [ ] `tests/e2e/pdf-intake.spec.ts` — sentinel created by 11-01 Task 3, suite filled by 11-05
- [ ] `tests/unit/pdf-copy.test.ts` — created by 11-04 Task 2
- [ ] `tests/unit/server/pdf-calibration/{harness.test,derive.spec,replay.spec}.ts` — created by 11-06
- [ ] `tests/fixtures/pdf/*` — synthetic fixtures committed by 11-01 Task 3

*Existing infrastructure (vitest workspace, playwright matrix, lint:no-danger) covers everything else.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Corpus class labeling correctness (ground truth) | ING-04 (SC#4) | Human-labeled ground truth IS the calibration standard — cannot be self-verified | Review the agent-drafted ground-truth labels against each PDF's actual structure before the derive run (11-06 Task 2) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint tasks are gates, not verification gaps)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
