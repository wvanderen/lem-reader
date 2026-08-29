---
phase: 17
slug: reader-owned-metadata
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-29
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from 17-RESEARCH.md §Validation Architecture + the per-task `<automated>` commands in 17-01..17-05 PLAN.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit) + Playwright Test 1.61.1 (e2e — chromium, firefox, webkit) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/library/effective-metadata.test.ts` |
| **Full suite command** | `npm run test` (= `vitest --run` then `playwright test`) |
| **Estimated runtime** | unit suite ~30s; single e2e spec (3 engines) ~1–3 min; full suite ~8–12 min |

---

## Sampling Rate

- **After every task commit:** the task's targeted vitest file(s) and/or the touched e2e spec (see Per-Task Map)
- **After every plan wave:** `npm run test:unit -- --run && npm run test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm run test` exit 0, one invocation — honest-gate precedent 09-07/13-06/15-04)
- **Max feedback latency:** ≤60s (unit) / ≤3 min (single e2e spec across 3 engines)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | META-01, META-03 | T-17-01 / T-17-02 | Override fields validated at the Zod boundary (`z.string().min(1).optional()`); strip mode drops unknown keys; blank override unrepresentable | unit + lint | `npx vitest run tests/unit/ingestion-schema.test.ts && npm run lint` | ✅ (extend) | ⬜ pending |
| 17-01-02 | 01 | 1 | META-01, META-03 | T-17-01 | Effective-value truth table; strip-mode round-trip guard; provenance byte-untouched; v5-row hydration | unit | `npx vitest run tests/unit/library/effective-metadata.test.ts tests/unit/ingestion-schema.test.ts` | ❌ → authored by 17-01 T2 (TDD, RED-first) / ✅ ingestion-schema | ⬜ pending |
| 17-02-01 | 02 | 2 | META-02 | T-17-03 | Search matches override only (renamed article not found by old name); React-escaped rendering | unit + e2e | `npx vitest run tests/unit/library-search.test.ts && npx playwright test tests/e2e/library/search-tag-filter.spec.ts --project=chromium` | ✅ (extend) | ⬜ pending |
| 17-02-02 | 02 | 2 | META-01, META-02 | T-17-04 / T-17-05 | Single `db.articles.put` override write site; blank-title Save refused; fixture gate blocks shadow rows | e2e (regression anchors) | `npx playwright test tests/e2e/library/remove-cascade.spec.ts tests/e2e/library/browse-open.spec.ts --project=chromium` | ✅ | ⬜ pending |
| 17-02-03 | 02 | 2 | META-01, META-02, META-03 | T-17-03 / T-17-04 / T-17-05 | Row-level override truth via readRow; Reset deletes the key (no blank persisted); Esc/focus hygiene; fixture-gate | e2e | `npx playwright test tests/e2e/library/metadata-edit.spec.ts` | ❌ → authored by 17-02 T3 (TDD) | ⬜ pending |
| 17-03-01 | 03 | 2 | META-02 | T-17-06 | `document.title` text-only assignment; chapter/book halves stay canonical | e2e (regression anchors) | `npx playwright test tests/e2e/library/browse-open.spec.ts tests/e2e/library/v1-regression.spec.ts --project=chromium` | ✅ | ⬜ pending |
| 17-03-02 | 03 | 2 | META-02 | T-17-06 / T-17-07 | Markdown export escapes effective titles; canonical title asserted absent (one name) | unit | `npx vitest run tests/unit/portability/markdown.test.ts tests/unit/review-filter.test.ts` | ✅ (extend) | ⬜ pending |
| 17-04-01 | 04 | 2 | META-04 | T-17-08 | Bundle v3 union (v1/v2 read unchanged); peek refuses 4+ as newer-schema-version; hostile override strings schema-validated at bundle parse | unit | `npx vitest run tests/unit/portability/bundle-schema.test.ts tests/unit/portability/validate-bundle.test.ts tests/unit/portability/export-service.test.ts` | ✅ (extend + 12-07-discipline assertion flips 2→3 / 3→4) | ⬜ pending |
| 17-04-02 | 04 | 2 | META-04 | T-17-09 | Merge-on-win keeps local overrides; keep-local skip default; resolver performs zero writes; puts-only transaction unchanged | unit | `npx vitest run tests/unit/portability/conflicts.test.ts tests/unit/portability/atomic-import.test.ts` | ✅ (extend) | ⬜ pending |
| 17-04-03 | 04 | 2 | META-04 | T-17-10 | Per-item take-incoming is explicit reader choice; keep-both not offered for the kind; single onProceed invocation | unit | `npx vitest run tests/unit/portability/import-preview-dialog.test.tsx` | ✅ (extend) | ⬜ pending |
| 17-05-01 | 05 | 3 | META-04 | — | Pre-Phase-17 v5 rows hydrate overrides with zero write-back (raw row byte-unchanged) | e2e | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | ✅ (extend) | ⬜ pending |
| 17-05-02 | 05 | 3 | META-04 | T-17-09 | Override round-trip byte equality in a schemaVersion-3 bundle; conflict defaults + per-item resolution; removal cascade leaves no residue | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts tests/e2e/portability/import-preview.spec.ts` | ✅ (extend + v3 assertion flip at round-trip L169) | ⬜ pending |
| 17-05-03 | 05 | 3 | META-02, META-04 | T-17-11 | Cross-surface one-name proof + honest one-invocation full-suite gate (exact counts recorded; no subsets/skips) | e2e + full suite | `npm run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing infrastructure covers all phase requirements.

The two NEW test files (`tests/unit/library/effective-metadata.test.ts`, `tests/e2e/library/metadata-edit.spec.ts`) are authored RED-first inside their own TDD tasks (17-01 Task 2, 17-02 Task 3): the plans' `tdd="true"` task ordering provides the Nyquist scaffold without a separate Wave 0 plan. Every other touched test file exists at HEAD and is extended strengthen-only (plus the explicitly-scoped 12-07-discipline version-bump assertion updates in 17-04/17-05).

---

## Manual-Only Verifications

All phase behaviors have automated verification. (Keyboard Esc/focus-restore paths and dialog semantics are e2e-asserted in 17-02 Task 3; no behavior in this phase lacks an automated command.)

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none missing — new files authored RED-first in-task)
- [x] No watch-mode flags (`vitest run` / plain `playwright test` throughout)
- [x] Feedback latency < 60s unit / ≤3 min e2e spec
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
