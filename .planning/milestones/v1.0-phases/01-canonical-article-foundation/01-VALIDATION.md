---
phase: 1
slug: canonical-article-foundation
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Body sourced from `01-RESEARCH.md` §Validation Architecture (lines 971–1031) and §Security Domain (lines 1033–1072).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component, jsdom env) + Playwright Test 1.61.1 (e2e, 3-engine matrix) + @axe-core/playwright 4.12.1 (a11y) |
| **Config files** | `vitest.config.ts`, `playwright.config.ts` — both created in Plan 01-01 Task 1 (Wave 0, greenfield) |
| **Quick run command** | `npm run test:unit -- --run` (Vitest only; <5s target) |
| **Full suite command** | `npm test` (unit + component + Playwright across Chromium/Firefox/WebKit) |
| **Estimated runtime** | ~5s quick (unit/component); ~30–60s full (3-engine e2e + axe) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run` (Vitest only; <5s)
- **After every plan wave:** Run `npm test` (full suite, all engines)
- **Before `/gsd-verify-work`:** Full suite must be green PLUS the Phase 1 manual gate (keyboard, screen-reader, zoom/reflow, forced-colors, reduced-motion — see Manual-Only Verifications)
- **Max feedback latency:** 5 seconds (quick), 60 seconds (wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | (scaffold) | T-01-SC | Lockfile committed; no forbidden deps | static | `npm run build && npm run lint` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | DOC-04, DOC-06 | T-01-01, T-01-02, T-01-04, T-01-05 | Zod rejects non-http(s)/mailto href schemes (Pitfall 5); footnote id regex (Pitfall 4); id/revision model (D-06); Dexie version(1) once (Pitfall 9) | unit | `npm run test:unit -- --run schema identity` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | DOC-05 | T-01-03 | Grapheme offsets count segment ordinals not UTF-16 (Pitfall 1); ASCII-only whitespace collapse (Pitfall 2); footnote body after body blocks (Pitfall 3) | unit | `npm run test:unit -- --run normalizeText graphemeOffsets selectors` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | DOC-01 | T-01-11 | Fixture loader fail-fast parse (Pitfall 8); in-memory repository round-trip | unit | `npm run test:unit -- --run` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | DOC-02, DOC-06 | T-01-06, T-01-09 | Renderer emits native elements only; no raw-HTML injection prop (Pitfall 6, ESLint `react/no-danger`); footnote ids derived deterministically (Pitfall 4) | component | `npm run test:unit -- --run BlockRenderer` + `npm run lint` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | DOC-01, DOC-03, DOC-06 | T-01-07, T-01-08, T-01-10 | Source-URL link `rel="noopener noreferrer"` (reverse tabnabbing); no internal jargon in user copy; focus visible; reduced-motion + forced-colors defensive CSS | component | `npm run test:unit -- --run FixtureList ArticleView` + `npm run lint` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | DOC-01, DOC-02, DOC-03, DOC-06 | T-01-11 | D-03 fixture-approval checkpoint — user approves candidates before normalization | checkpoint | (blocking human-verify) | n/a | ⬜ pending |
| 01-03-02 | 03 | 2 | DOC-01, DOC-02, DOC-03, DOC-06 | T-01-11, T-01-12, T-01-15 | Throwaway script never imported by app bundle; every fixture parses through `ArticleSchema` (Pitfall 8); provenance `originalHtmlHash` SHA-256 (A6); no jargon in `plainDescription` | static + build | `npm run build && npm run test:unit -- --run` + grep gates | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | DOC-01, DOC-02 | T-01-08, T-01-13 | axe-core zero serious/critical across 3 engines; no `heading-order`/`list` violations (Pitfall 10); DOC-01 smoke across full corpus | e2e | `npm run test:e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test infrastructure is greenfield. Plan 01-01 Task 1 creates the configs and setup; Plan 01-01 Tasks 2+3 create the Wave 0 unit-test scaffolds. Subsequent plans depend on these.

- [x] `package.json` with locked STACK.md versions + npm scripts (`test:unit`, `test:e2e`, `test`, `lint`, `format`, `build`, `dev`, `preview`) — Plan 01-01 Task 1
- [x] `vitest.config.ts` — Vitest 4.1.10, jsdom environment for component tests, setupFiles `./tests/setup.ts` — Plan 01-01 Task 1
- [x] `playwright.config.ts` — three-engine matrix (Chromium, Firefox, WebKit); webServer against `vite dev` — Plan 01-01 Task 1
- [x] `eslint.config.js` — flat config with `react/no-danger`, `react/jsx-no-target-blank`, `react-hooks/*`, `jsx-a11y/*` — Plan 01-01 Task 1
- [x] `tests/setup.ts` — `@testing-library/jest-dom/vitest` matchers — Plan 01-01 Task 1
- [x] `tests/unit/schema.test.ts` — every block kind round-trips; URL scheme rejection (Pitfall 5); footnote id regex (Pitfall 4) — Plan 01-01 Task 2
- [x] `tests/unit/identity.test.ts` — id slug regex; revision `int().min(1)` (D-06) — Plan 01-01 Task 2
- [x] `tests/unit/normalizeText.test.ts` — idempotency, ASCII whitespace collapse, NBSP/ZWJ preservation, single `\n` block separator, code-block verbatim, footnote body offset > reference offset (Pitfall 3) — Plan 01-01 Task 3
- [x] `tests/unit/graphemeOffsets.test.ts` — emoji ZWJ family, precomposed/decomposed accented, CJK; canonical offset = array index not `segment.index` (Pitfall 1) — Plan 01-01 Task 3
- [x] `tests/unit/selectors.test.ts` — `deriveQuoteSelector` round-trip; context radius 32; edge positions — Plan 01-01 Task 3
- [x] `tests/component/BlockRenderer.test.tsx` — one test per block kind asserting native element tag — Plan 01-02 Task 2
- [x] `tests/component/FixtureList.test.tsx` — list renders all fixtures; "Open article" copy; loading/error states — Plan 01-02 Task 3
- [x] `tests/component/ArticleView.test.tsx` — provenance header; source-URL link `target="_blank"` + `rel="noopener noreferrer"`; visually-hidden new-tab announcement — Plan 01-02 Task 3
- [x] `tests/e2e/open-every-fixture.spec.ts` — DOC-01 smoke across full corpus + 3 engines — Plan 01-03 Task 3
- [x] `tests/e2e/a11y.spec.ts` — axe-core on fixture-list + every article view; `heading-order` + `list` rule assertions (Pitfall 10) — Plan 01-03 Task 3

*All Wave 0 gaps are assigned to Plan 01-01 Task 1 (configs/setup) and Plan 01-01 Tasks 2–3 (unit-test scaffolds). No task in Wave 1+ can claim a test passes until these exist.*

---

## Manual-Only Verifications

Per STACK.md: "@axe-core/playwright reports only automatable issues; retain manual keyboard and screen-reader checks." These are the Phase 1 gate manual passes (they inform Phase 6's ACPT-02 but are a Phase 1 baseline). Performed after `npm test` is green and before `/gsd-verify-work`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Keyboard-only navigation through every fixture | DOC-02, A11Y-01 (Phase 2 baseline) | axe cannot verify logical focus order or keyboard operability end-to-end | Open each fixture using only keyboard; Tab through; verify focus is visible (`:focus-visible` ring) and follows reading order; activate the source-URL link (opens new tab); activate a footnote reference (jumps to footnote body); toggle an unsupported-content disclosure (`<details>`); verify no keyboard trap |
| Screen-reader outline and semantics | DOC-02, A11Y-03 (Phase 2 baseline) | axe cannot verify what a screen reader announces | VoiceOver (macOS) or NVDA (Windows): open each fixture; verify heading levels are announced correctly in order; list semantics (`<ul>`/`<ol>` + `<li>`); figure caption association; disclosure announces as expandable; footnotes region announced |
| Zoom and reflow at 200% + 320 CSS px width | A11Y-04 (Phase 2 baseline) | axe cannot verify visual reflow completeness | Set browser zoom to 200%; set viewport to 320 CSS px equivalent; verify no content clipped, no controls hidden, focus still visible, article body reflows within `max-width: 64ch` |
| Forced-colors / High Contrast mode | A11Y-05 (Phase 2 baseline) | axe cannot verify forced-colors adaptations | Enable Windows High Contrast / macOS forced-colors; verify links remain underlined, focus ring remains visible, disclosure marker remains operable, meaning never carried by color alone |
| Reduced-motion preference | A11Y-06 (Phase 2 baseline) | Phase 1 ships no required animations; verify the defensive block | Enable `prefers-reduced-motion: reduce`; verify no transitions/animations run; the `<details>` reveal uses browser default (no motion) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (Per-Task Map above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (longest gap = the D-03 checkpoint, which is a blocking human-verify by design)
- [ ] Wave 0 covers all MISSING references (every ❌ W0 in the Per-Task Map is assigned to Plan 01-01)
- [ ] No watch-mode flags in any `<automated>` command (all use `--run` for Vitest)
- [ ] Feedback latency < 5s (quick), < 60s (wave)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (set to approved YYYY-MM-DD after Phase 1 `/gsd-verify-work` passes the full suite + manual gate)
