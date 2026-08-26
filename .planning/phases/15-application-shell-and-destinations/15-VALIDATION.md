---
phase: 15
slug: application-shell-and-destinations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component, jsdom) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (both existing) |
| **Quick run command** | `npx vitest --run tests/component/App.test.tsx tests/unit/library/library-session.test.ts` |
| **Full suite command** | `npm run test` (unit `--run` + full e2e; exit-0 gate) |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run lint` + quick unit command for touched module + single-engine (`--project=chromium`) run of the touched spec
- **After every plan wave:** 3-engine run of shell-nav + library-restore + renamed review-panel specs
- **Before `/gsd-verify-work`:** Full suite must be green (`npm run test` exit 0)
- **Max feedback latency:** 60 seconds (per-task quick path)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (populated at planning) | — | — | NAV-01 | T-10-02c discipline | parseHash literal allowlist for `#/highlights`; no route value interpolated into DOM/URL | e2e (3-engine) | `npx playwright test chrome/shell-nav.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | NAV-02 | T-14-04 | Constant same-origin hrefs (`#/`, `#/highlights`) | e2e | `npx playwright test chrome/shell-nav.spec.ts -g brand` | ❌ W0 | ⬜ pending |
| TBD | — | — | NAV-03 | — | Snapshot holds only app-generated values; row lookup keyed, never DOM-anchored | e2e + unit | `npx playwright test library/library-restore.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | NAV-05 | — | ModeToggle gated on reader context only | e2e | `npx playwright test chrome/shell-nav.spec.ts -g gating` | ❌ W0 | ⬜ pending |
| TBD | — | — | POLISH-07 | — | 48px single-row header at 320px; touch targets ≥44px | e2e | `npx playwright test chrome/shell-nav.spec.ts -g "320"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/chrome/shell-nav.spec.ts` — NAV-01/NAV-02/NAV-05 + 320px geometry
- [ ] `tests/e2e/library/library-restore.spec.ts` — NAV-03 restore matrix (reuse search-tag-filter seeding helpers + wipeDatabase beforeEach)
- [ ] `tests/unit/library/library-session.test.ts` — pure comparators/snapshot logic
- [ ] Extend `tests/component/App.test.tsx` — `#/highlights` + `#/review` alias parseHash cases
- [ ] Rename update pass (same commit as rename): ~10 spec files pinning "Review highlights"/`#/review`

*Framework install: none needed — existing infrastructure covers the phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token coherence audit (gutters/headers/spacing/focus across 4 surfaces) | POLISH-07 | Visual judgment across surfaces; e2e spot-assertions cover reflow + touch targets | Run `npx playwright test reflow.spec.ts touch-targets.spec.ts`, then visually compare Library/Highlights/Add/Reader at 320px/768px/1280px; check focus ring visibility on all interactive elements |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
