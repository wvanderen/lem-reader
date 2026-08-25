---
phase: 14
slug: navigation-and-library-contracts
status: active
nyquist_compliant: true
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
| 14-01:1 | 14-01 | 1 | LIB-07 | T-14-02 | rows enter the derivation as data only (Zod-validated at the store seam); module outputs a union literal | unit | `npx vitest run tests/unit/library/reading-state.test.ts` | ❌ new (TDD RED first) | ⬜ pending |
| 14-01:2 | 14-01 | 1 | NAV-04 | T-14-01 | document.title text-only assignment + 64-char content truncation; no markup path | unit | `npx vitest run tests/unit/library/page-meta.test.ts` | ❌ new (TDD RED first) | ⬜ pending |
| 14-01:3 | 14-01 | 1 | LIB-08 | — | FINISHED_THRESHOLD single source preserved; consumers swap derivation only (byte-identical output) | e2e regression + grep gates | `npx vitest run tests/unit/library/ && npx playwright test tests/e2e/library/progress-recent.spec.ts --project=chromium` | ✅ (progress-recent unmodified = the guard) | ⬜ pending |
| 14-02:1 | 14-02 | 2 | NAV-04 | T-14-03 | parseHash view segments parsed against a literal allowlist; unknown → All fallback, never interpreted | unit | `npx vitest run tests/component/App.test.tsx` | ✅ extend (strengthen-only) | ⬜ pending |
| 14-02:2 | 14-02 | 2 | LIB-07, LIB-08 | — | counts derive from the same policy functions as membership (structural agreement); no `filter(...).length` shortcuts | e2e regression (chromium) | `npx vitest run tests/component/App.test.tsx && npx playwright test tests/e2e/ingestion/happy-path.spec.ts --project=chromium` | ✅ (happy-path unmodified = the guard) | ⬜ pending |
| 14-02:3 | 14-02 | 2 | NAV-04 | T-14-05 | cold loads/reloads never move focus; h1 focus only on warm mounts + view switches | e2e regression (chromium) | `npx playwright test tests/e2e/ingestion/happy-path.spec.ts tests/e2e/library/search-tag-filter.spec.ts --project=chromium` | ✅ | ⬜ pending |
| 14-03:1 | 14-03 | 2 | NAV-04 | T-14-06 | review title truthful; no restore-on-unmount title gap | e2e regression (chromium) | `npx playwright test tests/e2e/review-panel --project=chromium` | ✅ | ⬜ pending |
| 14-03:2 | 14-03 | 2 | NAV-04 | T-14-01, T-14-06 | title strings exact incl. error form (no trailing-period lie); loading writes no title | unit (jsdom) | `npx vitest run tests/component/ArticleView.test.tsx` | ✅ extend | ⬜ pending |
| 14-03:3 | 14-03 | 2 | NAV-04 | T-14-07 | focus decision lives at ONE point; no third competing effect; cold immunity | unit (jsdom) | `npx vitest run tests/component/ArticleView.test.tsx` | ✅ extend | ⬜ pending |
| 14-04:1 | 14-04 | 3 | LIB-07, LIB-08 | T-14-09 | seed rows are Zod-parsed test-local IndexedDB writes; expected values computed from the imported policy module | e2e 3-engine | `npx playwright test tests/e2e/library/reading-views.spec.ts --project=chromium` | ❌ new | ⬜ pending |
| 14-04:2 | 14-04 | 3 | NAV-04 | T-14-01, T-14-06 | focus/title/history matrix incl. review destination (title + warm h1 focus), error parity, overlay title stability | e2e 3-engine | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/back-nav.spec.ts --project=chromium` | ❌ new / ✅ back-nav extend (strengthen-only) | ⬜ pending |
| 14-04:3 | 14-04 | 3 | a11y | T-14-08 | honest gate: full suite in one invocation, counts recorded, no engine-skip; strengthen-only diffs audited via git | e2e 3-engine + full suite | `npm run test` | ✅ a11y.spec (extend only if gap) | ⬜ pending |

*Task IDs bound to plans 14-01…14-04 (2026-08-25 revision). Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. `wave_0_complete` flips to true during execution once the new test scaffolds land.*

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (new test files are TDD-RED-first inside their tasks; reading-views.spec.ts scaffold created by 14-04 Task 1)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-finalized 2026-08-25 (revision pass — task IDs bound to plans 14-01…14-04 after checker review); `wave_0_complete` flips during execution when the new scaffolds land.
