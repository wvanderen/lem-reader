---
phase: 18
slug: reader-orientation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-30
updated: 2026-08-30
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from plan `<verify>` blocks + 18-RESEARCH §Validation Architecture (revision R1, per checker fix).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e — chromium/firefox/webkit) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` (existing, byte-stable) |
| **Quick run command** | `npm run test:unit -- --run` (unit) · `npx playwright test tests/e2e/toc` (phase specs, once 18-02 creates them) |
| **Full suite command** | `npm run test` (unit + 3-engine e2e + throttled perf; exit 0 = honest gate) |
| **Estimated runtime** | ~45–90s (unit quick) · ~2–4min (toc subset) · ~15–25min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run` (plus `npx playwright test tests/e2e/toc` from Plan 18-02 onward)
- **After every plan wave:** Run `npm run test:e2e` (full e2e)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-T1 | 01 | 1 | ORNT-04 | T-18-01, T-18-02 | Pure derivation — no DOM/HTML construction; numeric blockIndex/offset only, no invented ids | unit (TDD) | `npx vitest run tests/unit/toc.test.ts` | ❌ W0 — created by this task (RED-first) | ⬜ pending |
| 18-01-T2 | 01 | 1 | ORNT-04 | — | Announcer contract byte-stable (zero spec diff — Pitfall 5 gate) | e2e + unit | `npx playwright test tests/e2e/section-announce.spec.ts && npx vitest run tests/unit/toc.test.ts` | ✅ | ⬜ pending |
| 18-02-T1 | 02 | 2 | ORNT-01, ORNT-04 | T-18-01 | Entry text renders as React text children only; NO dialog role claimed; aria-current token "true" | unit (TDD) | `npx vitest run tests/unit/TocPanel.test.tsx` | ❌ W0 — created by this task (RED-first) | ⬜ pending |
| 18-02-T2 | 02 | 2 | ORNT-01, ORNT-03, ORNT-04 | T-18-02, T-18-03, T-18-04, T-18-05 | Activations intercepted (router never re-parses); [data-block-index] resolution; ONE toggle close seam; panel never resizes content column | e2e | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts` | ❌ W0 — created by this task | ⬜ pending |
| 18-02-T3 | 02 | 2 | ORNT-05 | T-18-04 | 5-button row: no wrap/overflow/silent overlap; clip-based collapse keeps links in a11y tree + tab order; :focus-visible un-clip | e2e | `npx playwright test tests/e2e/touch-targets.spec.ts tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts` | ✅ | ⬜ pending |
| 18-03-T1 | 03 | 3 | ORNT-06 | T-18-07, T-18-08 | saveLocation call family stays singular (useScrollSave only); bounded rAF retry (RETRY_CAP_MS 5000); deep-link precedence preserved; no Dexie schema change | e2e + unit | `npx playwright test tests/e2e/persistence.spec.ts && npx vitest run --project unit` | ✅ | ⬜ pending |
| 18-03-T2 | 03 | 3 | ORNT-06 | T-18-06, T-18-09 | Marker mounts ONLY on genuine restore-landing; CSS-transition fade only (reduced-motion gate kills it); pointer-events none, no interactive descendants | unit + e2e (TDD) | `npx vitest run tests/unit/RestorationMarker.test.tsx && npx playwright test tests/e2e/toc/restoration-cue.spec.ts` | ❌ W0 — created by this task (RED-first) | ⬜ pending |
| 18-03-T3 | 03 | 3 | ORNT-06 (D18-06) | — | Retirement grep gate clean across src/ + tests/; announce copy survives exactly once (inside the marker) | grep + e2e | `! rg -q 'resume-banner\|Resume reading\|Start from top' src tests && npx playwright test tests/e2e/chrome/mobile-first-page-chrome.spec.ts tests/e2e/library/reading-views.spec.ts` | ✅ | ⬜ pending |
| 18-04-T1 | 04 | 4 | ORNT-01, ORNT-03, ORNT-04 | T-18-10 | All corpus rows pass ArticleSchema.parse in Node before raw IndexedDB puts | e2e | `npx playwright test tests/e2e/toc/toc-navigation.spec.ts` | ✅ (extended, strengthen-only) | ⬜ pending |
| 18-04-T2 | 04 | 4 | ORNT-05, ORNT-06 | T-18-12 | assertEdgeInvariant on open-panel state; AxeBuilder zero serious/critical; zero fixed sleeps | e2e | `npx playwright test tests/e2e/toc/toc-geometry.spec.ts tests/e2e/toc/restoration-cue.spec.ts` | ❌ W0 — toc-geometry created by this task | ⬜ pending |
| 18-04-T3 | 04 | 4 | ORNT-01, ORNT-03, ORNT-04, ORNT-05, ORNT-06 (gate) | T-18-11 | Strengthen-only audit (3 sanctioned retirement sites only); ONE full invocation; literal counts recorded | full suite | `npm run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan — the phase's test scaffolds ship inside the executing tasks (TDD RED-first), per 18-RESEARCH §Validation Architecture §Wave 0 Gaps:

- [ ] `tests/unit/toc.test.ts` — derivation invariants — created by **18-01-T1** (RED-first)
- [ ] `tests/e2e/toc/toc-navigation.spec.ts` — core cells created by **18-02-T2**; corpus matrix extended by **18-04-T1** (strengthen-only)
- [ ] `tests/e2e/toc/restoration-cue.spec.ts` — scrolling cells created by **18-03-T2**; paginated + matrix cells extended by **18-04-T2**
- [ ] `tests/e2e/toc/toc-geometry.spec.ts` — 320px/400% edge cells — created by **18-04-T2**
- [ ] `tests/e2e/toc/_corpus.ts` — seeded TOC corpus (skip/duplicates/h5-h6/chapter) — created by **18-04-T1**
- [ ] ResumeBanner retirement specs — 2 assertion-site replacements inside **18-03-T3** (phase-owned retirements)
- [ ] Framework install: **none needed** — infrastructure complete (RESEARCH: existing Vitest/Playwright configs)

*`wave_0_complete` flips true when 18-01-T1's first RED commit lands (the phase's first scaffold).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader browse of the non-modal TOC panel (new surface pattern — no dialog semantics) | ORNT-01, ORNT-04 | Axe reports only automatable issues; VoiceOver/NVDA browse behavior of a `popover="manual"` surface is not automatable (ACPT-02 history; RESEARCH Pitfall 3 mandates the manual SR protocol for this NEW pattern) | With SR active: open the panel from the trigger; browse the nested entries and hear depth from list structure + aria-current on the current entry; activate an entry — focus lands on the destination heading; Esc returns focus to the trigger; confirm nothing announces as dialog/modal |

*All other phase behaviors have automated verification (see map above).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (11/11 rows; 5 task-created scaffolds are RED-first inside their own tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (scaffolds owned by the tasks listed above; existing infra covers the rest)
- [x] No watch-mode flags (`vitest run` / `--run` throughout; Playwright non-watch)
- [x] Feedback latency < 120s (quick command)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-30 (planner sign-off, revision R1 — populated from plan verify blocks per checker fix_hint)
