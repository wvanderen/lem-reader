---
phase: 10
slug: annotation-review-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit + component, jsdom via `test.projects`) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit + chromium-throttled-mobile) |
| **Config file** | `vitest.config.ts` (projects: `unit` incl. tests/component/**, `server`); `playwright.config.ts` (webServer auto-starts Vite on :5173) |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm run test` (unit + e2e, all engines — no subsets, no `--grep`, no engine skip) |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run` (+ targeted `npx playwright test tests/e2e/review-panel/<spec>`)
- **After every plan wave:** Run `npm run test` (full suite, all engines — record fail counts honestly per the 04-11/09-07 anti-pattern guard)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

> Task IDs are pending until PLAN.md files exist. Rows are keyed to the RECV-01 sub-behaviors from the Validation Architecture in `10-RESEARCH.md`; each plan task MUST map to at least one row.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01 T2 | 10-01 | 1 | RECV-01.a route entry (`#/review` swap, LibraryView entry button) | Route-param injection | regex-anchored grammar; unknown → list | e2e | `npx playwright test tests/e2e/review-panel/route-entry.spec.ts` | ✅ | ⬜ pending |
| 10-01 T2 | 10-01 | 1 | RECV-01.b cross-article listing w/ article/date/position metadata | Stored XSS | React text children only | e2e | `npx playwright test tests/e2e/review-panel/listing.spec.ts` | ✅ | ⬜ pending |
| 10-03 T2 (sentinel 10-01 T2) | 10-03 | 3 | RECV-01.c jump bidirectional (both reading modes) + deep-link no re-jump — arrival half + no-re-jump + calm no-op + back-to-#/review proven 15/15; click-from-row half closes in 10-06 | — | replaceState strip, calm no-op | e2e | `npx playwright test tests/e2e/review-panel/jump-bidirectional.spec.ts` | ✅ | ⬜ pending |
| 10-01 T1 | 10-01 | 1 | RECV-01.d filter (AND-composed) + sort (date/article/position) | — | pure derivation | unit + e2e smoke | `npm run test:unit -- --run tests/unit/review-filter.test.ts` | ✅ | ⬜ pending |
| 10-01 T2 | 10-01 | 1 | RECV-01.e tri-state honest (ambiguous/orphan badges, orphan tail) | — | never silently hidden | unit + e2e | `npx playwright test tests/e2e/review-panel/tri-state.spec.ts` | ✅ | ⬜ pending |
| 10-01 T2 | 10-01 | 1 | RECV-01.f curate in place (edit note, delete w/ confirm + cascade copy, `.status`) | Destructive fire; XSS | `[data-initial-focus]` on non-destructive button | e2e | `npx playwright test tests/e2e/review-panel/curate.spec.ts` | ✅ | ⬜ pending |
| 10-01 T2 | 10-01 | 1 | RECV-01.g empty states (no highlights vs filters-zero) | — | `.status` announcements | e2e | `npx playwright test tests/e2e/review-panel/empty-states.spec.ts` | ✅ | ⬜ pending |
| ⬜ TBD | TBD | TBD | RECV-01.h parseHash grammar (`/h/`, `#/review`, unknown→list, Gap 3) | Route-param injection | regex-constrained params | unit (component) | `npm run test:unit -- --run tests/component/App.test.tsx` | ✅ EXTEND (strengthen-only) | ⬜ pending |
| ⬜ TBD | TBD | TBD | Regress: forced-colors / reduced-motion / keyboard / a11y on `#/review` | — | global reduced-motion gate | e2e | existing forced-colors/reduced-motion/panel-keyboard/a11y specs | ✅ extend if scoped | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/review-filter.test.ts` — pure derivation coverage (filters AND, three sorts, orphan tail, tri-state join, ISO-date ordering) — RECV-01.d/e
- [ ] `tests/e2e/review-panel/` spec files — RECV-01.a/b/c/e/f/g/i (reuse `tests/e2e/portability/_portability.ts` seeders + `wipeDatabase` from `tests/e2e/annotations/_fixtures.ts`)
- [ ] `tests/component/App.test.tsx` — EXTEND parseHash cases (strengthen-only; keep existing 5 route cases + Gap 3 cases green)
- [ ] a11y pass: run existing `@axe-core/playwright`-backed a11y specs against `#/review` (add page to whichever spec enumerates routes)

*Existing Vitest + Playwright infrastructure covers the framework requirement — no installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader announcement quality of tri-state badges | RECV-01.e | Axe cannot judge SR semantics beyond roles/names | Navigate panel with VoiceOver; confirm ambiguous/orphan badges are announced per row |
| Focus-restore feel on panel return | RECV-01.c | Timing/feel judgment across engines | Jump from row → Back; confirm focus lands on the origin row in chromium, firefox, webkit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
