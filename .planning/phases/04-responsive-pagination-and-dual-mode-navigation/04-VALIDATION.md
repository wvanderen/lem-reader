---
phase: 4
slug: responsive-pagination-and-dual-mode-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Pagination correctness (PAGE-03) is the highest-risk requirement in the prototype. Its invariants MUST be validated in real browsers (Playwright, 3 engines) across the corpus × viewport × typography matrix — never in a DOM emulator (jsdom/happy-dom do not implement authoritative `Range.getClientRects()` line-box geometry).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/property) + Playwright 1.61.1 (real-browser layout truth, 3 projects: chromium/firefox/webkit) |
| **Config file** | `vitest.config.*` (unit) + `playwright.config.ts` (e2e) |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm run test` (unit + `npm run test:e2e`) |
| **Estimated runtime** | ~30s (unit) / ~3–6 min (full Playwright corpus matrix) |

> **Critical (STACK.md):** jsdom/happy-dom do NOT implement authoritative layout or `Range.getClientRects()` line-box geometry. Unit tests cover pure logic (offset math, fragmentation policy, widow rules, anchor round-trips); Playwright covers layout truth (page count, exactly-once coverage, no-overflow, focus restoration). Mixing these is the #1 pagination-test anti-pattern.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run`
- **After every plan wave:** Run `npm run test:e2e -- --grep pagination` (3 engines)
- **Before `/gsd-verify-work`:** Full suite must be green — full Playwright corpus matrix
- **Max feedback latency:** ~30 seconds (unit) / ~6 minutes (e2e wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner-assigned) | 01 | 1 | PAGE-01 | — | N/A | e2e | `playwright test tests/e2e/pagination/mode-switch-anchor.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-02 | — | N/A | e2e + unit | `playwright test tests/e2e/pagination/page-turn-controls.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-03a | — | N/A | e2e (corpus) | `playwright test tests/e2e/pagination/coverage-invariant.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-03b | — | N/A | e2e (corpus) | `playwright test tests/e2e/pagination/no-overflow-invariant.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-03c | — | N/A | e2e + unit | `playwright test tests/e2e/pagination/termination.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-03d | — | N/A | unit | `vitest tests/unit/pagination/fragmentOrder.test.ts` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-04 | — | N/A | e2e | `playwright test tests/e2e/pagination/fallback-oversize.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-05 | — | N/A | e2e | `playwright test tests/e2e/pagination/repagination-anchor.spec.ts -x` | ❌ W0 | ⬜ pending |
| (planner-assigned) | 01 | 1 | PAGE-09 | — | N/A | e2e + unit | `playwright test tests/e2e/pagination/fallback-banner.spec.ts -x` | ❌ W0 | ⬜ pending |
| (cross) | 01 | 1 | D4-03/D4-04 | — | N/A | unit | `vitest tests/unit/pagination/widowRules.test.ts` | ❌ W0 | ⬜ pending |
| (cross) | 01 | 1 | D-05 | — | N/A | unit | `vitest tests/unit/pagination/lineBoxMapping.test.ts` | ❌ W0 | ⬜ pending |
| (cross) | 01 | 1 | readingMode schema | — | N/A | unit | `vitest tests/unit/settingsSchema.test.ts` (extend) | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs assigned by the planner.*

---

## Observable Invariants (PAGE-03 contract)

The Playwright corpus matrix MUST assert these on every (fixture × viewport × typography) cell:

1. **Exactly-once coverage** — union of every page fragment's source ranges == `[0, graphemeLength(article))`, no gaps, no overlaps.
2. **No clipping** — no page's rendered content overflows its content-box (`scrollHeight <= contentBoxHeight + tolerance`); page is `overflow: hidden`.
3. **No duplication** — a D-05 offset range appears on exactly one page.
4. **Canonical order** — for pages i < j, every offset on page i < every offset on page j.
5. **Termination** — finite `pages[]` with `pages.length <= 300`; bounded wall-clock.
6. **D-05 round-trip** — saved offset in scrolling mode → paginated lands on containing page → back to scrolling re-lands same block (`findScrollTarget`).
7. **Focus restoration (D4-07)** — content-triggered turn focuses new page's first heading/focusable; control-triggered turn keeps focus on the control.
8. **Fallback-on-oversized (PAGE-04)** — atomic block > 75% of page height triggers `dom-fallback` diagnostic + whole-article scrolling at the same offset.

---

## Wave 0 Requirements

- [ ] `tests/e2e/pagination/` directory + the 8 e2e specs (covers PAGE-01/02/03/04/05/09 in real browsers)
- [ ] `tests/unit/pagination/` directory + the 4 unit specs (pure fragmentation/offset/widow logic)
- [ ] `tests/e2e/pagination/fixtures-matrix.ts` — corpus × viewport × typography enumeration (mirror Phase 3's `tests/e2e/calibration/fixtures-matrix.ts`)
- [ ] Extend `tests/unit/settingsSchema.test.ts` — `readingMode` field + default-on-read for v1 records
- [ ] Framework install: none needed (`vitest` + `@playwright/test` already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader reading order matches visual order across a turn | PAGE-03 / A11Y | AT behavior is not fully automatable; axe covers structure not live-turn announcements | With NVDA/VoiceOver, turn forward/back; confirm announced heading order matches visual page sequence |
| Reduced-motion: page-turn transitions respect `prefers-reduced-motion` | A11Y | Visual motion timing is subjective; spot-check the transition feels calm | Toggle OS reduced-motion; turn pages; confirm no slide/parallax, only instant swap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit) / < 6 min (e2e)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
