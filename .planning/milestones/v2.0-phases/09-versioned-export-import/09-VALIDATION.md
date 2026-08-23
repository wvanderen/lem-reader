---
phase: 9
slug: versioned-export-import
status: final
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-15
finalized: 2026-08-15 (planner revision 1 — mirrors the 7-plan task map)
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, jsdom env, 2 projects) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npm run test:unit -- --run tests/unit/portability` |
| **Full suite command** | `npm run test` (unit + e2e, all engines — the honest gate) |
| **Estimated runtime** | unit ~30s; full suite minutes (3 engines) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run tests/unit/portability && npx playwright test tests/e2e/portability/ --project=chromium`
- **After every plan wave:** Scoped suites above stay green (unit portability + chromium e2e). The FULL `npm run test` is red-on-known-debt (the 24 pre-existing cells logged in Phase 08's deferred-items.md) until Wave 6 — Plan 09-07 Task 3 is the honest full-suite exit gate (RESEARCH Open Question 1, RESOLVED).
- **Before `/gsd-verify-work`:** Full suite green via 09-07-T3 (exit 0, counts recorded in 09-07-OUTPUT.md)
- **Max feedback latency:** ~60 seconds (unit + chromium-only e2e)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-T1 | 09-01 | 1 | PORT-01/02 (infra) | T-9-SC | fflate pinned exact (audited OK); appVersion build wiring | e2e scaffold + build | `npx playwright test tests/e2e/portability/ --project=chromium` | ❌ 09-01-T1 | ⬜ |
| 09-01-T2 | 09-01 | 1 | PORT-01/02 | T-9-01 | Zip Slip guard refuses mandated traversal corpus; schemaVersion literal gate | unit (TDD) | `npx vitest run tests/unit/portability/bundle-schema.test.ts tests/unit/portability/zip-slip.test.ts` | ❌ 09-01-T2 | ⬜ |
| 09-01-T3 | 09-01 | 1 | PORT-01/02 | T-9-03 | Deterministic SHA-256 manifest (known-answer verified) | unit (TDD) | `npx vitest run tests/unit/portability/manifest.test.ts` | ❌ 09-01-T3 | ⬜ |
| 09-02-T1 | 09-02 | 1 | PORT-03 | T-9-05 | Markdown structure-injection escaping; honest tri-state inclusion | unit (TDD) | `npx vitest run tests/unit/portability/markdown.test.ts` | ❌ 09-02-T1 | ⬜ |
| 09-02-T2 | 09-02 | 1 | PORT-01 | T-9-07 | Whole-library reads drop corrupt rows silently (STATE-04) | unit (TDD) | `npx vitest run tests/unit/portability/bulk-reads.test.ts` | ❌ 09-02-T2 | ⬜ |
| 09-03-T1 | 09-03 | 2 | PORT-02 | T-9-10 | Dry-run pass performs zero writes; 5-kind detection; fixture-lookup precedence | unit (TDD) | `npx vitest run tests/unit/portability/conflicts.test.ts` | ❌ 09-03-T1 | ⬜ |
| 09-03-T2 | 09-03 | 2 | PORT-02 | T-9-08, T-9-09 | Skip-by-default overrides; keep-both FK rewrite pre-transaction | unit (TDD) | `npx vitest run tests/unit/portability/conflicts.test.ts` | ❌ 09-03-T2 | ⬜ |
| 09-04-T1 | 09-04 | 3 | PORT-01 | — | Fixtures never serialized; self-validating export; sourceUrl carriage (SC#1) | unit (TDD) | `npx vitest run tests/unit/portability/export-service.test.ts` | ❌ 09-04-T1 | ⬜ |
| 09-04-T2 | 09-04 | 3 | PORT-02 | T-9-02, T-9-12, T-9-13, T-9-14 | Six refusal kinds before any write; bomb cap; peek-before-parse | unit (TDD) | `npx vitest run tests/unit/portability/validate-bundle.test.ts` | ❌ 09-04-T2 | ⬜ |
| 09-04-T3 | 09-04 | 3 | PORT-02 | T-9-11, T-9-15 | Atomic 5-store transaction; injected-failure rollback proof; puts-only closure | unit (TDD) | `npx vitest run tests/unit/portability/atomic-import.test.ts` | ❌ 09-04-T3 | ⬜ |
| 09-05-T1 | 09-05 | 4 | PORT-02 | T-9-16, T-9-17 | Dialog consent semantics; initial focus on non-destructive action | unit (RTL) | `npx vitest run tests/unit/portability/import-preview-dialog.test.tsx` | ❌ 09-05-T1 | ⬜ |
| 09-05-T2 | 09-05 | 4 | PORT-01/02/03 | T-9-18 | Refusal copy strings; applyImport isolated to Proceed handler; insecure-context guard | unit + build | `npx vitest run tests/unit/portability && npm run build` | ❌ 09-05-T2 | ⬜ |
| 09-05-T3 | 09-05 | 4 | PORT-03 | T-9-06 | Sanitized download filename; live-region announcement | build + chromium e2e | `npm run build && npx playwright test tests/e2e/portability/ --project=chromium` | ❌ 09-05-T3 | ⬜ |
| 09-06-T1 | 09-06 | 5 | SC#4, SC#1 | T-9-20 | Round-trip offsets byte-equal; sourceUrl carried; no page keys in bundle | e2e (3 engines) | `npx playwright test tests/e2e/portability/round-trip.spec.ts` | scaffold 09-01-T1 → real 09-06-T1 | ⬜ |
| 09-06-T2 | 09-06 | 5 | SC#2, PORT-02 | T-9-01 (verified) | Crafted traversal zips refused, zero state change; keep-both + default-skip proofs | e2e (3 engines) | `npx playwright test tests/e2e/portability/zip-slip-regression.spec.ts tests/e2e/portability/import-preview.spec.ts` | scaffold 09-01-T1 → real 09-06-T2 | ⬜ |
| 09-06-T3 | 09-06 | 5 | PORT-03, A11Y | — | .md content matches locked template; axe + keyboard on new surfaces | e2e (3 engines) | `npx playwright test tests/e2e/portability/` | scaffold 09-01-T1 → real 09-06-T3 | ⬜ |
| 09-07-T1 | 09-07 | 6 | PAGE-03, PAGE-04 | T-9-22 | Strengthen-only spec repair; root-cause fix at measurement seam | e2e (3 engines) | `npx playwright test tests/e2e/pagination/` | ✅ exists (repair) | ⬜ |
| 09-07-T2 | 09-07 | 6 | ANNO-01, STATE-04 | T-9-22 | Re-authored assertions preserve semantics against current UI shapes | e2e (3 engines) | `npx playwright test tests/e2e/annotations/ tests/e2e/ingestion/` | ✅ exists (repair) | ⬜ |
| 09-07-T3 | 09-07 | 6 | all (exit gate) | T-9-21 | Honest full-suite run, exit 0, counts recorded in 09-07-OUTPUT.md | full suite | `npm run test` | ❌ 09-07-T3 (record) | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirements → Test Map (from RESEARCH.md Validation Architecture)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | ExportBundleSchema accepts a valid 5-block bundle; rejects wrong schemaVersion literal | unit | `npx vitest run tests/unit/portability/bundle-schema.test.ts` | ❌ 09-01-T2 (Wave 1) |
| PORT-01 | Export produces a zip with bundle.json + manifest.json; fixtures NOT serialized; fixtureIds present; sourceUrl carried (SC#1) | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/export-service.test.ts` | ❌ 09-04-T1 (Wave 3) |
| PORT-02 | isSafeEntryName rejects `../../evil.sh`, `..%2F..%2Fevil.sh`, absolute, drive-letter, backslash, NUL, reserved names; accepts valid | unit | `npx vitest run tests/unit/portability/zip-slip.test.ts` | ❌ 09-01-T2 (Wave 1) |
| PORT-02 | validateBundle refuses: not-a-zip, unsafe-entry, missing-entry, newer-schemaVersion, invalid (issues LIST), corrupted (manifest mismatch) | unit | `npx vitest run tests/unit/portability/validate-bundle.test.ts` | ❌ 09-04-T2 (Wave 3) |
| PORT-02 | Conflict dry-run detects all 5 D9-14 kinds with correct defaults | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/conflicts.test.ts` | ❌ 09-03-T1/T2 (Wave 2) |
| PORT-02 | Import applies atomically — injected mid-write failure rolls back ALL stores | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/atomic-import.test.ts` | ❌ 09-04-T3 (Wave 3) |
| PORT-03 | Markdown renderer: blockquote+citation+note; [approx]/[orphan] markers; footer counts; orphan renders stored exact; note never dropped | unit | `npx vitest run tests/unit/portability/markdown.test.ts` | ❌ 09-02-T1 (Wave 1) |
| PORT-01/02 | Manifest determinism: export → stringify round-trip → recompute = identical | unit | `npx vitest run tests/unit/portability/manifest.test.ts` | ❌ 09-01-T3 (Wave 1) |
| SC#4 | Round-trip: machine A export → machine B import → highlights confident/honestly tri-state; page numbers absent from bundle.json; sourceUrl present (SC#1) | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts` | scaffold 09-01-T1 (Wave 1) → real 09-06-T1 (Wave 5) |
| SC#2 | Malicious zip upload (crafted buffer) refused; no state change | e2e | `npx playwright test tests/e2e/portability/zip-slip-regression.spec.ts` | scaffold 09-01-T1 (Wave 1) → real 09-06-T2 (Wave 5) |
| PORT-02 | Preview dialog: counts, defaults, data-initial-focus on cancel, Esc restore, Proceed applies | e2e + component | `npx playwright test tests/e2e/portability/import-preview.spec.ts` | scaffold 09-01-T1 (Wave 1) → real 09-06-T2 (Wave 5); RTL unit 09-05-T1 (Wave 4) |
| PORT-03 | Per-article + library-wide .md export downloads render expected content | e2e | `npx playwright test tests/e2e/portability/highlights-export.spec.ts` | scaffold 09-01-T1 (Wave 1) → real 09-06-T3 (Wave 5) |
| A11Y | Preview dialog keyboard/axe checks across engines | e2e | `npx playwright test tests/e2e/portability/a11y.spec.ts` | scaffold 09-01-T1 (Wave 1) → real 09-06-T3 (Wave 5) |

---

## Per-Wave Test Distribution (Wave 0 / scaffolding contract)

Test files land TDD-style **with their modules**, distributed across waves — not all up front:

- [ ] **Wave 1 (09-01-T2/T3):** bundle-schema, zip-slip, manifest unit specs land with their pure modules; **(09-01-T1):** fflate@0.8.3 exact install + fflate import-lint (only `zipSync`/`unzipSync`/`strToU8`/`strFromU8`) + `__APP_VERSION__` wiring + download-capture smoke spec + 5 sentinel e2e scaffolds (acceptDownloads verification — Pitfall 9 / A1)
- [ ] **Wave 1 (09-02-T1/T2):** markdown + bulk-reads unit specs land with the renderer and the bulk loaders
- [ ] **Wave 2 (09-03-T1/T2):** conflicts unit spec lands with detectImportPreview/resolveImportPlan
- [ ] **Wave 3 (09-04-T1/T2/T3):** export-service, validate-bundle, atomic-import unit specs land with their service functions
- [ ] **Wave 5 (09-06-T1..T3):** the 5 sentinel e2e specs are replaced by the real phase-exit gates
- [x] **24-pre-existing-failures gap-closure ownership** — RESOLVED at planning: Plan 09-07 (Wave 6) owns it (RESEARCH Open Question 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *None anticipated — all phase behaviors have automated verification paths in the Requirements → Test Map above.* | | | |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (per-task map above — all 19 tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 / per-wave distribution covers all MISSING references (no task references a test file that no plan creates)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized by planner (revision 1, 2026-08-15) — per-task map mirrors the 09-01..09-07 plan set; `wave_0_complete` remains false until executors flip it during Wave 1.
