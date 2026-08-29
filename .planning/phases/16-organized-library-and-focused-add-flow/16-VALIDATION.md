---
phase: 16
slug: organized-library-and-focused-add-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit + component, jsdom via `test.projects`) + Playwright Test 1.61.1 (chromium / firefox / webkit) |
| **Config file** | `vitest.config.ts` (projects: `unit`, `server`), `playwright.config.ts` (3 desktop projects + chromium-throttled-mobile) |
| **Quick run command** | `npx vitest run tests/component/AddDialog.test.tsx && npx playwright test tests/e2e/ingestion/happy-path.spec.ts --project=chromium` |
| **Full suite command** | `npm run test` (unit `--run` then e2e; honest gate = exit 0 in ONE invocation, fresh dev server) |
| **Estimated runtime** | ~quick 60–90s / full ~10–15 min |

---

## Sampling Rate

- **After every task commit:** Quick run — the migrated/added component spec + the single most-related e2e spec on chromium (`npx vitest run tests/component/AddDialog.test.tsx && npx playwright test <spec> --project=chromium`)
- **After every plan wave:** Library + ingestion e2e directories on all 3 engines (`npx playwright test tests/e2e/library tests/e2e/ingestion tests/e2e/chrome/library-tidy.spec.ts`)
- **Before `/gsd-verify-work`:** Full suite must be green — `npm run test` exit 0 in one invocation on a fresh Vite dev server (15-04 webkit-starvation lesson; honest-gate discipline 04-11/09-07/15-04)
- **Max feedback latency:** ~120 seconds (quick run)

---

## Per-Task Verification Map

> Task IDs assigned at planning time; requirement-level rows below derive from 16-RESEARCH.md §Validation Architecture. Planner must bind each row to a task in `verify` blocks.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | LIB-09 | — | N/A | e2e | `npx playwright test tests/e2e/library/search-tag-filter.spec.ts` | ✅ (strengthen: no-matches + clear-filters) | ⬜ pending |
| TBD | — | — | LIB-09 | — | N/A | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts` | ✅ (strengthen: counts-pure-mid-search) | ⬜ pending |
| TBD | — | — | LIB-10 | — | N/A | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/library/progress-recent.spec.ts` | ❌ view-gating cases → W0 | ⬜ pending |
| TBD | — | — | ADD-01 | — | N/A | e2e | `npx playwright test tests/e2e/ingestion/happy-path.spec.ts` | ✅ (migrate + strengthen) | ⬜ pending |
| TBD | — | — | ADD-01 | — | N/A | e2e | `npx playwright test tests/e2e/a11y.spec.ts` | ✅ (strengthen: dialog-open axe scan) | ⬜ pending |
| TBD | — | — | ADD-02 | — | N/A | component + e2e | `npx vitest run tests/component/AddDialog.test.tsx` | ❌ W0 (migrate from IngestControl.test.tsx) | ⬜ pending |
| TBD | — | — | ADD-02 | — | N/A | component | `npx vitest run tests/component/AddDialog.test.tsx` (switch-preservation, always-Web-address) | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-03 | — | N/A | unit | `npx vitest run tests/unit/pdf-copy.test.ts tests/unit/epub-copy.test.ts` | ✅ (import-path update only) | ⬜ pending |
| TBD | — | — | ADD-03 | — | N/A | component + e2e | component + `npx playwright test tests/e2e/library/upload-queue.spec.ts` | ✅ (migrate helpers) | ⬜ pending |
| TBD | — | — | ADD-03 | — | N/A | e2e | `npx playwright test tests/e2e/library/focused-add.spec.ts` (dismissal blocked while submitting) | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-04 | — | N/A | e2e | focused-add spec — focus restore, WebKit explicit initial focus, Esc when idle, 3 engines | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-04 | — | N/A | e2e | happy-path (article) + epub-intake (book), migrated | ✅ (migrate) | ⬜ pending |
| TBD | — | — | ADD-04 | — | N/A | e2e | `npx playwright test tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts` | ✅ (strengthen: dialog-open states) | ⬜ pending |
| TBD | — | — | ADD-04 | — | N/A | e2e | a11y.spec.ts keyboard-walkthrough pattern (radio arrows, Tab order, focus ring) | ✅ (strengthen or focused-add spec) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/component/AddDialog.test.tsx` — NEW; migrate IngestControl state-machine/copy/dedupe coverage + add picker/switch-preservation/always-Web-address cases (covers ADD-02/03 component layer)
- [ ] `tests/e2e/library/add-dialog.ts` — NEW shared `openAddDialog`/`pickSource` helper (Pattern 7)
- [ ] `tests/e2e/library/focused-add.spec.ts` — NEW; dismissal-blocking (Pitfall 3), focus restore, switch-preservation e2e, reopen-on-Web-address, close-then-navigate ordering (covers ADD-03/04 e2e layer)
- [ ] Strengthen `search-tag-filter.spec.ts` (no-matches + clear-filters), `reading-views.spec.ts` (strip gating + counts-pure-mid-search), `reflow.spec.ts`/`high-zoom.spec.ts` (dialog-open states)
- [ ] Migrate the 12 ingest-surface driver specs to the shared helper (same plan as the add-section dissolution — Pitfall 1)

*Test framework itself: no gaps — vitest/playwright/RTL all configured and green at Phase 15 close (2529 passed / 0 failed / 23 documented skips).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader pass on open dialog (name/role, live-region announcements for submitting/error) | ADD-04 | Axe covers automatable checks only; project convention retains manual SR verification | Open Add dialog with NVDA/VoiceOver, submit a URL, confirm status announcements and refusal copy are read calmly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
