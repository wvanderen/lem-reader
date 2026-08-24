---
phase: 14
slug: navigation-and-library-contracts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit+component, jsdom env, `vitest.config.ts` projects) + Playwright Test 1.61.1 (chromium/firefox/webkit + chromium-throttled perf-only) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/library/reading-state.test.ts tests/component/App.test.tsx` |
| **Full suite command** | `npm run test` (honest gate: exit 0, fail counts recorded) |
| **Estimated runtime** | quick ~10s unit / full suite minutes (3-engine e2e) |

---

## Sampling Rate

- **After every task commit:** Run quick unit set + targeted new e2e spec (`npx playwright test reading-views.spec.ts --project=chromium` for fast inner loop)
- **After every plan wave:** Run `npm run test:e2e` (3 engines) + `npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm run test` exit 0)
- **Max feedback latency:** ~30 seconds (quick loop)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (planner fills) | — | — | NAV-04 | — | parseHash view segments parsed against literal allowlist; unknown → All fallback, never interpreted | unit | `npx vitest run tests/component/App.test.tsx` | ✅ extend (strengthen-only) | ⬜ pending |
| TBD (planner fills) | — | — | NAV-04 | — | N/A | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/back-nav.spec.ts` | ❌ W0 (new spec) / ✅ back-nav | ⬜ pending |
| TBD (planner fills) | — | — | NAV-04 | T-14 XSS-via-title | document.title is text-only assignment; no innerHTML surface | e2e + unit (title string builder) | `npx playwright test reading-views.spec.ts` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | NAV-04 | — | N/A | e2e | `npx playwright test reading-views.spec.ts back-nav.spec.ts` | partially ✅ | ⬜ pending |
| TBD (planner fills) | — | — | LIB-07 | — | N/A | unit | `npx vitest run tests/unit/library/reading-state.test.ts` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | LIB-07 | — | N/A | e2e | `npx playwright test reading-views.spec.ts` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | LIB-08 | — | N/A | e2e (imports policy module for expected values) | `npx playwright test reading-views.spec.ts` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | LIB-08 | — | N/A | e2e (strengthen-only guard) | `npx playwright test tests/e2e/library/progress-recent.spec.ts` | ✅ | ⬜ pending |
| TBD (planner fills) | — | — | a11y | — | N/A | e2e (axe, 3 engines) | `npx playwright test tests/e2e/a11y.spec.ts` | ✅ extend if needed | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/library/reading-state.test.ts` — LIB-07 policy truth table (unread/in-progress/finished; 0% opened; ≥98%; 39/40 chapters; missing chapter row 11/12; zero-length edge)
- [ ] `tests/e2e/library/reading-views.spec.ts` — views/counts/empty/focus/title/history matrix × 3 engines; clone the progress-recent.spec beforeEach (image stub + clear-rows) + seedLocation/seedBook helpers
- [ ] `tests/component/App.test.tsx` — extend parseHash describe with view-segment cases (strengthen-only: existing cases byte-stable)
- [x] No framework installs needed — existing infrastructure covers all phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SR announcement quality (screen reader reads the focused h1 on route/view swap, D14-09) | NAV-04 | Announcement voice is not automatable; axe/jsdom do not assert AT reading behavior | Manual SR pass (VoiceOver/NVDA); automatable substrate (focus landed on h1) asserted via `toBeFocused`; SR-voice check deferred to milestone acceptance matrix (ACPT-08, Phase 21) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
