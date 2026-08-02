---
phase: 2
slug: accessible-scrolling-reader
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `02-RESEARCH.md` § Validation Architecture + § Security Domain.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component, jsdom) + Playwright 1.61.1 (e2e, 3 engines) + `@axe-core/playwright` 4.12.1 |
| **Config file** | `vitest.config.ts` (jsdom, `tests/unit` + `tests/component`) / `playwright.config.ts` (`tests/e2e`, chromium+firefox+webkit) |
| **Quick run command** | `npm run test:unit -- --run` |
| **Full suite command** | `npm run test` (unit `--run` + e2e across Chromium/Firefox/WebKit) |
| **Estimated runtime** | ~20–40 seconds (full suite incl. 3-engine Playwright) |

> **jsdom is NOT authoritative** for `<dialog>` focus-trap/inert, IntersectionObserver, scroll, or zoom. Those behaviors MUST run in Playwright across Chromium/Firefox/WebKit (per STACK.md "What NOT to Use" and the existing `vitest.config.ts` comment).

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run` (fast jsdom logic + schema + grapheme-offset resolution)
- **After every plan wave:** Run `npm run test` (full unit + Playwright across Chromium/Firefox/WebKit)
- **Before `/gsd-verify-work`:** Full suite must be green; manual keyboard + screen-reader pass before ship (axe reports only automatable issues)
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

> Threat Ref column is "—" — no high-severity threats in this phase (see Security Domain: persisted values are Zod enums/numbers; renderer forbids `dangerouslySetInnerHTML`).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01 (tokens) | 01 | 1 | READ-02 | — | N/A (enum/number via setProperty) | unit/component | `npm run test:unit -- --run tests/component/SettingsPanel.test.tsx` | ❌ W0 | ⬜ pending |
| 02-01 (theme) | 01 | 1 | READ-03 | — | `data-theme` on `<html>`, Zod literal | component | `npm run test:unit -- --run tests/component/SettingsContext.test.tsx` | ❌ W0 | ⬜ pending |
| 02-01 (quiet UI) | 01 | 1 | READ-04 | — | N/A | e2e (visual+axe) | `npx playwright test a11y.spec.ts` | ✅ (extend) | ⬜ pending |
| 02-03 (hairline) | 03 | 3 | READ-05 | — | hairline `aria-hidden` | e2e | `npx playwright test progress.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (no trap) | 01 | 1 | A11Y-01 | — | N/A | e2e (keyboard) | `npx playwright test panel-keyboard.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (focus restore) | 01 | 1 | A11Y-02 | — | focus restored to gear trigger (showModal does NOT auto-restore) | e2e (keyboard) | `npx playwright test panel-keyboard.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (single tree) | 01 | 1 | A11Y-03 | — | article `inert`, not duplicated | e2e (axe + DOM) | `npx playwright test a11y.spec.ts` | ✅ (extend) | ⬜ pending |
| 02-01 (reflow) | 01 | 1 | A11Y-04 | — | N/A | e2e | `npx playwright test reflow.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (forced-colors) | 01 | 1 | A11Y-05 | — | N/A | e2e (emulated) | `npx playwright test forced-colors.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (reduced-motion) | 01 | 1 | A11Y-06 | — | no required animation | e2e (emulated) | `npx playwright test reduced-motion.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01 (touch) | 01 | 1 | A11Y-07 | — | 44×44px targets; pointer parity | e2e | `npx playwright test touch-targets.spec.ts` | ❌ W0 | ⬜ pending |
| 02-03 (announce) | 03 | 3 | A11Y-08 | — | debounced heading-change announce | e2e | `npx playwright test section-announce.spec.ts` | ❌ W0 | ⬜ pending |
| 02-03 (restore) | 03 | 3 | STATE-01 | — | N/A | unit (resolve) + e2e | `npm run test:unit -- --run tests/unit/restoreLocation.test.ts` | ❌ W0 | ⬜ pending |
| 02-02 (persist) | 02 | 1 | STATE-02 | — | N/A | e2e | `npx playwright test persistence.spec.ts` | ❌ W0 | ⬜ pending |
| 02-02 (schema) | 02 | 1 | STATE-04 | T-V5 | Zod rejects corrupt settings/location | unit | `npm run test:unit -- --run tests/unit/settingsSchema.test.ts` | ❌ W0 | ⬜ pending |
| 02-02 (fallback) | 02 | 1 | STATE-05 | T-V7 | banner + in-memory fallback; no silent wipe | unit + e2e | `npm run test:unit -- --run tests/unit/storageFallback.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These test files are referenced by tasks but do not yet exist — they are Wave 0 stubs to be created before/alongside the first implementation task:

- [ ] `tests/component/SettingsPanel.test.tsx` — open/close state, `aria-labelledby`, control presence, focus-restore call site (NOT the trap itself — that's e2e)
- [ ] `tests/component/SettingsContext.test.tsx` — live token application + `data-theme`
- [ ] `tests/unit/restoreLocation.test.ts` — grapheme offset → DOM block resolution (pure domain logic, jsdom-safe)
- [ ] `tests/unit/settingsSchema.test.ts` + `tests/unit/locationSchema.test.ts` — Zod accept/reject (STATE-04)
- [ ] `tests/unit/storageFallback.test.ts` — named-error classification + in-memory-default path (mock Dexie)
- [ ] `tests/e2e/panel-keyboard.spec.ts` — focus trap + restore + Esc + scrim dismiss (3 engines)
- [ ] `tests/e2e/persistence.spec.ts` — settings + location survive reload; `visibilitychange` flush
- [ ] `tests/e2e/section-announce.spec.ts` + `progress.spec.ts` — hairline + debounced announce
- [ ] `tests/e2e/reflow.spec.ts` / `forced-colors.spec.ts` / `reduced-motion.spec.ts` / `touch-targets.spec.ts` — a11y variant coverage

*Existing infrastructure (vitest + playwright + axe-core) is already installed from Phase 1 — Wave 0 adds test files, not frameworks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader heading-change announce quality | A11Y-08 | axe cannot judge announce conciseness/flood; semantics need human + AT | Run NVDA/VoiceOver across the fixture corpus; confirm the live region announces current section without flooding on fast scroll |
| Calm/quiet aesthetic of header + panel | READ-04 | "calm" is a design judgment, not automatable | Visual review that header is thin/low-contrast and panel does not permanently compete with content |
| Focus visibly logical across navigation | A11Y-02 | visible focus ring predictability is partly visual | Keyboard traverse the full reader surface; confirm focus is visible and logical at each step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
