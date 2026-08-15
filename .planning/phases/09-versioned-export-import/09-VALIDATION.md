---
phase: 9
slug: versioned-export-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
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
- **After every plan wave:** Run `npm run test` (full suite, all engines — honest gate; see RESEARCH.md Pitfall 8 for the 24 pre-existing failures decision)
- **Before `/gsd-verify-work`:** Full suite green (or scoped-green with logged deficit decision)
- **Max feedback latency:** ~60 seconds (unit + chromium-only e2e)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| — pending planner task IDs — | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirements → Test Map (from RESEARCH.md Validation Architecture)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | ExportBundleSchema accepts a valid 5-block bundle; rejects wrong schemaVersion literal | unit | `npx vitest run tests/unit/portability/bundle-schema.test.ts` | ❌ Wave 0 |
| PORT-01 | Export produces a zip with bundle.json + manifest.json; fixtures NOT serialized; fixtureIds present | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/export-service.test.ts` | ❌ Wave 0 |
| PORT-02 | isSafeEntryName rejects `../../evil.sh`, `..%2F..%2Fevil.sh`, absolute, drive-letter, backslash, NUL, reserved names; accepts valid | unit | `npx vitest run tests/unit/portability/zip-slip.test.ts` | ❌ Wave 0 |
| PORT-02 | validateBundle refuses: not-a-zip, unsafe-entry, missing-entry, newer-schemaVersion, invalid (issues LIST), corrupted (manifest mismatch) | unit | `npx vitest run tests/unit/portability/validate-bundle.test.ts` | ❌ Wave 0 |
| PORT-02 | Conflict dry-run detects all 5 D9-14 kinds with correct defaults | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/conflicts.test.ts` | ❌ Wave 0 |
| PORT-02 | Import applies atomically — injected mid-write failure rolls back ALL stores | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/atomic-import.test.ts` | ❌ Wave 0 |
| PORT-03 | Markdown renderer: blockquote+citation+note; [approx]/[orphan] markers; footer counts; orphan renders stored exact; note never dropped | unit | `npx vitest run tests/unit/portability/markdown.test.ts` | ❌ Wave 0 |
| PORT-01/02 | Manifest determinism: export → stringify round-trip → recompute = identical | unit | `npx vitest run tests/unit/portability/manifest.test.ts` | ❌ Wave 0 |
| SC#4 | Round-trip: machine A export → machine B import → highlights confident/honestly tri-state; page numbers absent from bundle.json | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts` | ❌ Wave 0 |
| SC#2 | Malicious zip upload (crafted buffer) refused; no state change | e2e | `npx playwright test tests/e2e/portability/zip-slip-regression.spec.ts` | ❌ Wave 0 |
| PORT-02 | Preview dialog: counts, defaults, data-initial-focus on cancel, Esc restore, Proceed applies | e2e + component | `npx playwright test tests/e2e/portability/import-preview.spec.ts` | ❌ Wave 0 |
| PORT-03 | Per-article + library-wide .md export downloads render expected content | e2e | `npx playwright test tests/e2e/portability/highlights-export.spec.ts` | ❌ Wave 0 |
| A11Y | Preview dialog keyboard/axe checks across engines | e2e | `npx playwright test tests/e2e/portability/a11y.spec.ts` | ❌ Wave 0 |

---

## Wave 0 Requirements

- [ ] `tests/unit/portability/` — all 8 unit spec files (bundle-schema, zip-slip, validate-bundle, manifest, conflicts, atomic-import, markdown, export-service)
- [ ] `tests/e2e/portability/` — 5 spec files (round-trip, zip-slip-regression, import-preview, highlights-export, a11y)
- [ ] `src/persistence/highlightsStore.ts` — add `loadAllHighlights()`; `src/persistence/notesStore.ts` — add `loadAllNotes()` (mirror `loadAllLocations`)
- [ ] `npm install fflate@0.8.3` + import-lint: only `zipSync`/`unzipSync`/`strToU8`/`strFromU8` named imports (tree-shaking discipline per fflate README)
- [ ] Download-capture smoke spec (acceptDownloads verification — Pitfall 9 / A1)
- [ ] Decide the 24-pre-existing-failures gap-closure ownership (Pitfall 8) — surface to user at planning

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *None anticipated — all phase behaviors have automated verification paths in the Requirements → Test Map above.* | | | |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
