---
phase: 8
slug: markdown-pipeline-and-personal-library
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-12
revised: 2026-08-12
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Regenerated from the plans' actual `<verify><automated>` commands + the RESEARCH.md §Validation Architecture test map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e, Chromium + Firefox + WebKit) + @axe-core/playwright 4.12.1 (a11y) |
| **Config file** | `vitest.config.ts` (project root) + `playwright.config.ts` (project root) — both inherited from the v1.0 + Phase 7 baseline |
| **Quick run command** | `npm run test:unit -- --run` (Vitest only; < 30s on the existing ~408-test Phase 7 suite) |
| **Full suite command** | `npm run test` (Vitest + Playwright across all three engines — the "honest-suite" gate per PROJECT.md Key Decision #9) |
| **Build command** | `npm run build` (tsc type-check + Vite client build — Pitfall 8-6 bundle-size guard) |
| **Estimated runtime** | ~25s unit; ~3-5min full suite across three engines (refine during Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` verify command (see Per-Task Verification Map below) — max latency ~30s.
- **After every plan wave:** Run `npm run test:unit -- --run && npm run build` (Vitest + build; < 1min) to catch type + cross-task regressions before the next wave starts.
- **Before `/gsd-verify-work`:** Full suite `npm run test` must exit 0 across Chromium + Firefox + WebKit.
- **Max feedback latency:** ~30s per task commit; ~60s per wave merge; ~5min phase gate.
- **No watch-mode flags.** Every command uses `--run` (Vitest) or a single-shot invocation (Playwright).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-T1 | 01 | 1 | ING-03 | T-8-01, T-8-02, T-8-05 | Raw HTML escaped to inert text; link/image scheme allow-listed; round-trip gate catches normalization drift | unit | `cd /Users/eggfam/dev/lem-reader && npm run test:unit -- --run tests/unit/server/markdown-to-blocks.spec.ts` | ❌ W0 (this task creates it) | ⬜ pending |
| 08-01-T2 | 01 | 1 | ING-03 | T-8-SC | Schema widening additive; D8-17 title-fallback chain wired; zero Phase 7 regressions | unit + build | `cd /Users/eggfam/dev/lem-reader && npm run test:unit -- --run && npm run build` | ✅ (existing suite) | ⬜ pending |
| 08-02-T1 | 02 | 2 | LIB-04 (substrate) | T-8-09 | Dexie v4 append-only (Pitfall 9); no `.upgrade()` callback; existing rows hydrate `[]` | unit | `cd /Users/eggfam/dev/lem-reader && npm run test:unit -- --run` | ✅ (existing suite) | ⬜ pending |
| 08-02-T2 | 02 | 2 | LIB-04 | T-8-06, T-8-07 | Tag-store row injection (corrupt rows dropped — STATE-04); auto-prune (Pitfall 8-3); tag-name XSS (React escapes) | unit + e2e | `cd /Users/eggfam/dev/lem-reader && npm run test:unit -- --run tests/unit/ingestion-tags.test.ts` | ❌ W0 (this task creates it) + ✅ (extend dexie-migration.spec.ts) | ⬜ pending |
| 08-03-T1 | 03 | 3 | LIB-03 | — | N/A (pure helper — filter+sort; no trust boundary) | unit | `cd /Users/eggfam/dev/lem-reader && npm run test:unit -- --run tests/unit/library-search.test.ts` | ❌ W0 (this task creates it) | ⬜ pending |
| 08-03-T2 | 03 | 3 | LIB-05, LIB-06 | — | Source badge renders text (no HTML injection); ProgressHairline ratio in [0,1] | build + unit | `cd /Users/eggfam/dev/lem-reader && npm run build && npm run test:unit -- --run` | ✅ (existing suite) | ⬜ pending |
| 08-03-T3 | 03 | 3 | LIB-01, LIB-05, LIB-06 | — | `<h1>Saved articles</h1>` + `<ul><li><a>` structure byte-stable (Pitfall 8-5 v1.0 regression bar) | build + unit | `cd /Users/eggfam/dev/lem-reader && npm run build && npm run test:unit -- --run` | ✅ (existing suite) | ⬜ pending |
| 08-04-T1 | 04 | 4 | ING-03 | T-8-14 | Client-side 5MB cap refuses oversized files; D8-17 filename channel wired (file.name forwarded through ingestMarkdown) | build + unit | `cd /Users/eggfam/dev/lem-reader && npm run build && npm run test:unit -- --run` | ✅ (existing suite) | ⬜ pending |
| 08-04-T2 | 04 | 4 | LIB-02, LIB-04 | T-8-16, T-8-17, T-8-18 | TagEntry inert at mount (Pitfall 8-5); RemoveConfirm gates destructive cascade (Pitfall 8); tag-name XSS (React escapes) | build + unit | `cd /Users/eggfam/dev/lem-reader && npm run build && npm run test:unit -- --run` | ✅ (existing suite) | ⬜ pending |
| 08-05-T1 | 05 | 5 | LIB-01, LIB-02, ING-03 | — | SC#1 v1.0 regression bar; SC#2 cascade-remove; SC#4 markdown upload (incl. D8-17 filename fallback via end-to-end path) | e2e (3 engines) | `cd /Users/eggfam/dev/lem-reader && npx playwright test tests/e2e/library/browse-open.spec.ts tests/e2e/library/v1-regression.spec.ts tests/e2e/library/remove-cascade.spec.ts tests/e2e/library/markdown-upload.spec.ts` | ❌ W0 (this task creates them) | ⬜ pending |
| 08-05-T2 | 05 | 5 | LIB-03, LIB-04, LIB-06 + honest-suite gate | — | SC#3 search + tag + filter; SC#5 progress + continue-reading; full honest-suite exit 0 | e2e (3 engines) + full suite | `cd /Users/eggfam/dev/lem-reader && npx playwright test tests/e2e/library/search-tag-filter.spec.ts tests/e2e/library/progress-recent.spec.ts && npm run test` | ❌ W0 (this task creates them) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> All Wave 0 test files are CREATED by the tasks above (the task that creates a test file also writes its first passing case). No separate Wave 0 scaffolding plan is needed — every "❌ W0" entry in the Per-Task Map is satisfied by the task that owns it.

Test files created during execution:
- [ ] `tests/unit/server/markdown-to-blocks.spec.ts` — covers ING-03 (mdast mapping, raw-HTML escape, front-matter, `stripMarkdownExtension` helper, round-trip). Owner: 08-01-T1.
- [ ] `tests/unit/ingestion-tags.test.ts` — covers LIB-04 (denormalize, auto-prune, corrupt-row drop, empty-library). Owner: 08-02-T2.
- [ ] `tests/unit/library-search.test.ts` — covers LIB-03 + LIB-06 (filter+sort helper, progress computation). Owner: 08-03-T1.
- [ ] `tests/e2e/library/browse-open.spec.ts` — covers SC#1 (LIB-01 + LIB-05). Owner: 08-05-T1.
- [ ] `tests/e2e/library/v1-regression.spec.ts` — covers SC#1 regression bar. Owner: 08-05-T1.
- [ ] `tests/e2e/library/remove-cascade.spec.ts` — covers SC#2 (LIB-02). Owner: 08-05-T1.
- [ ] `tests/e2e/library/markdown-upload.spec.ts` — covers SC#4 (ING-03 + D8-17 filename fallback end-to-end). Owner: 08-05-T1.
- [ ] `tests/e2e/library/search-tag-filter.spec.ts` — covers SC#3 (LIB-03 + LIB-04). Owner: 08-05-T2.
- [ ] `tests/e2e/library/progress-recent.spec.ts` — covers SC#5 (LIB-06). Owner: 08-05-T2.

Test files EXTENDED during execution:
- [ ] Extend `tests/e2e/ingestion/dexie-migration.spec.ts` — assert v3→v4 additive (`*tags` index; existing rows hydrate `[]`). Owner: 08-02-T2. Pitfall 9 defense.

Existing v1.0 + Phase 7 vitest + Playwright infrastructure covers the baseline; the new files above are additive.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader announcement of TagEntry add/remove + RemoveConfirm body | LIB-04, LIB-02 (A11Y-08) | `@axe-core/playwright` catches automatable a11y issues only; SR vocabulary + focus-restore semantics require a human SR pass (NVDA + Firefox is the Phase 13 acceptance pair; a quick VoiceOver pass during Phase 8 catches gross regressions) | With TagEntry mounted, add then remove a tag via keyboard; confirm the `.status` live region announces the change. Open RemoveConfirm via keyboard, confirm focus lands on "Keep article" (non-destructive default), Esc closes, focus restores to trigger. |
| Visual calm of the library list (D8-01 calm minimal row) | LIB-01 | The "calm reading-room shelf" positioning (PROJECT.md) is a visual judgment no automated check encodes | Open the library with 10+ articles present; confirm rows are spare (no excerpt, no cover thumbnail, single-line progress hairline only), source badges are visually quiet, and the continue-reading strip is visually distinct from the main list. |

All other phase behaviors have automated verification (Per-Task Map above + RESEARCH.md §Validation Architecture L910-927).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every "❌ W0" row is owned by the task that creates the test file)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has an automated command)
- [x] Wave 0 covers all MISSING references (test files are created by their owning tasks; no separate scaffolding plan needed)
- [x] No watch-mode flags (all Vitest commands use `--run`; Playwright commands are single-shot)
- [x] Feedback latency < 60s per task (unit + build ≈ 25-45s; e2e ≈ 3-5min but only at wave boundaries)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready — populated from the plans' actual `<verify><automated>` commands (Plans 01-05) and the RESEARCH.md §Validation Architecture test map (L910-927).
