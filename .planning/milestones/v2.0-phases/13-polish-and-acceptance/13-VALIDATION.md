---
phase: 13
slug: polish-and-acceptance
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-18
updated: 2026-08-19
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated at plan time (2026-08-18 revision) from 13-RESEARCH.md § Validation Architecture and the adopted plans 13-01 … 13-06.
> Gap-closure rows 13-07-01 … 13-10-03 appended 2026-08-19 (revision 1) from the adopted gap-closure plans 13-07 … 13-10 (G1–G5); 13-10-03 owns the post-wave-5 honest full-suite re-run.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit — `npm run test:unit -- --run`) + Playwright Test 1.61.1 (e2e — `npm run test:e2e`); React Testing Library 16.3.2 available for component tests |
| **Config file** | playwright.config.ts (chromium/firefox/webkit projects); vitest via package defaults + tests/setup.ts |
| **Quick run command** | the owning task's targeted spec (see map below), e.g. `npx vitest run tests/unit/pagination/progress-formula.test.ts` or `npx playwright test tests/e2e/polish/cold-load-no-snap.spec.ts` |
| **Full suite command** | `npm run test` (vitest --run && playwright test — the D13-10 phase gate) |
| **Estimated runtime** | targeted unit spec < 10s; single e2e spec × 3 engines ~1–3 min; full suite ~10–20 min (baseline 12-08: ~1160 unit + 1000 e2e cells, exit 0) |

---

## Sampling Rate

- **After every task commit:** the task's targeted spec (unit or single e2e spec) green — see map
- **After every plan wave:** `npm run test:unit -- --run` + every e2e directory touched by the wave
- **Before `/gsd-verify-work`:** full `npm run test` single invocation green (D13-10 — owned by task 13-10-03 in the gap-closure wave; runs LAST, gap-closure precedent)
- **Max feedback latency:** ~3 min (one e2e spec across 3 engines)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | POLISH-01 | T-13-01 / T-13-02 | Mirror reads null-on-doubt (ReaderSettingsSchema.safeParse); writes are silent no-ops never routed through classifyStorageError | unit (TDD) | `npx vitest run tests/unit/settings/mirror.test.ts` | ❌ → created by this task (test-first) | ⬜ pending |
| 13-01-02 | 01 | 1 | POLISH-01 | T-13-03 | Inline script writes only via setProperty/dataset (no markup-string APIs); lazy-init prevents React re-introducing the flash | unit + typecheck | `npx vitest run tests/unit/settings/mirror.test.ts && npx tsc --noEmit` | ✅ (mirror.test.ts from 13-01-01) | ⬜ pending |
| 13-01-03 | 01 | 1 | POLISH-01 | T-13-01 | Corrupt/absent/quota-blocked mirror fails silent to defaults; wipe clears the mirror (no zombie preferences) | e2e (3 engines) | `npx playwright test tests/e2e/polish/cold-load-no-snap.spec.ts` | ❌ → created by this task | ⬜ pending |
| 13-02-01 | 02 | 1 | POLISH-02 | — | Pure clamped ratio over already-validated canonical records; never persisted | unit (pure, TDD) | `npx vitest run tests/unit/pagination/progress-formula.test.ts` | ❌ → created by this task (test-first) | ⬜ pending |
| 13-02-02 | 02 | 1 | POLISH-02 | — | Hairline stays aria-hidden, zero-motion, origin-left (strengthen-only; PageIndicator untouched) | typecheck + e2e regression | `npx tsc --noEmit && npx playwright test tests/e2e/progress.spec.ts` | ✅ (progress.spec.ts existing, byte-unchanged) | ⬜ pending |
| 13-02-03 | 02 | 1 | POLISH-02 | — | — | e2e (3 engines) | `npx playwright test tests/e2e/polish/first-paint-progress.spec.ts` | ❌ → created by this task | ⬜ pending |
| 13-03-01 | 03 | 1 | POLISH-04 | — | CSS-only fix; side-sheet (settings-panel/annotations-drawer) isolation rules byte-unchanged; no JS positioning | e2e (3 engines) | `npx playwright test tests/e2e/chrome/dialog-centering.spec.ts` | ❌ → created by this task | ⬜ pending |
| 13-03-02 | 03 | 1 | POLISH-06 | — | Byte-stable library anchors preserved (main#main, h1 "Saved articles", .status live region, LibraryRow markup) | e2e (new + existing) | `npx playwright test tests/e2e/chrome/library-tidy.spec.ts tests/e2e/library/` | ❌ tidy spec → created by this task; tests/e2e/library/ ✅ existing | ⬜ pending |
| 13-04-01 | 04 | 2 | POLISH-05 | T-13-06 (accept) | Deep-link fallback assigns only the literal "#/" route — never exits the app origin; keyboard-reachable native button | e2e (3 engines) | `npx playwright test tests/e2e/chrome/back-nav.spec.ts` | ❌ → created by this task | ⬜ pending |
| 13-04-02 | 04 | 2 | POLISH-03 | — | 09-07 grid cap byte-unchanged; TagEntry inert-at-mount discipline carried to the new home | e2e (new + corpus regression) | `npx playwright test tests/e2e/chrome/header-geometry.spec.ts tests/e2e/pagination/ tests/e2e/open-every-fixture.spec.ts` | ❌ geometry spec → created by this task; corpus ✅ existing | ⬜ pending |
| 13-05-01 | 05 | 1 | ACPT-05 | T-13-07 | Protocol byte-unchanged; role+name outcome discipline recorded (no verbatim SR phrasing); flip condition stated | doc/gate check | `test -f .planning/phases/13-polish-and-acceptance/13-VERIFICATION.md && grep -c "NVDA" .planning/phases/13-polish-and-acceptance/13-VERIFICATION.md && git diff --stat docs/ACCEPTANCE-PROTOCOL.md \| wc -l \| grep -x "0"` | ❌ → created by this task | ⬜ pending |
| 13-05-02 | 05 | 1 | ACPT-05 (D13-11) | — | Zero production changes; typed server-error rejection + always-destroy finally proven by test alone | unit (fake timers, TDD) | `npx vitest run tests/unit/server/pdfTimeout.spec.ts` | ❌ → created by this task (test-first) | ⬜ pending |
| 13-06-01 | 06 | 3 | ACPT-06 | T-13-08 | Shipped Zod-at-boundary ingest pipeline exercised, not modified; no production source changes | e2e (3 engines) | `npx playwright test tests/e2e/portability/core-flow-spine.spec.ts` | ❌ → created by this task | ⬜ pending |
| 13-06-02 | 06 | 3 | ACPT-06 (D13-10) | T-13-09 | Honest gate: single plain npm run test invocation; counts + full red-run history recorded in 13-06-OUTPUT.md | full-suite gate | `npm run test` | ✅ command exists; record = 13-06-OUTPUT.md (created by this task) | ⬜ pending |
| 13-07-01 | 07 | 4 | POLISH-06 | T-13-07-01/02 | Token-only CSS measure fix; no new selectors reachable by content strings | e2e (strengthened) | `npx playwright test tests/e2e/chrome/library-tidy.spec.ts` | ✅ existing (strengthened by this task) | ⬜ pending |
| 13-07-02 | 07 | 4 | POLISH-06 | T-13-07-SC (accept) | Accessible name + RemoveConfirm gating byte-identical through the SVG glyph swap | e2e + unit | `npx playwright test tests/e2e/library/remove-cascade.spec.ts tests/e2e/chrome/dialog-centering.spec.ts tests/e2e/chrome/library-tidy.spec.ts && npx vitest run tests/unit/library/` | ✅ existing | ⬜ pending |
| 13-08-01 | 08 | 4 | ING-03 (traceability — G2 maps to no Phase-13 ID) | T-13-08-01/02 | Remove is type=button (cannot submit); cap/dedupe guards byte-unchanged, resets added after the refusal copy | typecheck + unit | `npx tsc --noEmit && npx vitest run tests/unit/pdf-copy.test.ts tests/unit/epub-copy.test.ts` | ✅ existing | ⬜ pending |
| 13-08-02 | 08 | 4 | ING-03 (traceability) | — | Reset discipline proven in real browsers; zero fixed sleeps in the new spec | e2e (new, 3 engines) | `npx playwright test tests/e2e/library/upload-queue.spec.ts tests/e2e/library/markdown-upload.spec.ts tests/e2e/pdf-intake.spec.ts` | ❌ upload-queue → created by this task | ⬜ pending |
| 13-09-01 | 09 | 4 | POLISH-01/02 | T-13-09-03 | First publication still carries page height + firstPageReservedPx reserve together (05-06/13-04 contracts) | typecheck + unit + e2e | `npx tsc --noEmit && npx vitest run tests/unit/pagination/ && npx playwright test tests/e2e/pagination/initial-pagination-even.spec.ts tests/e2e/polish/cold-load-no-snap.spec.ts tests/e2e/polish/first-paint-progress.spec.ts` | ✅ existing | ⬜ pending |
| 13-09-02 | 09 | 4 | POLISH-01/02 | T-13-09-02 (accept) | Recorder is test-only plain JS reading the DOM; no production surface | e2e (new, 3 engines) | `npx playwright test tests/e2e/polish/first-paint-mode-surface.spec.ts tests/e2e/polish/cold-load-no-snap.spec.ts` | ❌ first-paint-mode-surface → created by this task | ⬜ pending |
| 13-10-01 | 10 | 5 | POLISH-03 | T-13-10-01/04 | Popover renders only React children (no markup-string APIs); toggle-event close seam restores focus (Pitfall 1) | typecheck + e2e | `npx tsc --noEmit && npx playwright test tests/e2e/library/search-tag-filter.spec.ts tests/e2e/chrome/header-geometry.spec.ts tests/e2e/library/v1-regression.spec.ts` | ✅ existing (realigned by this task) | ⬜ pending |
| 13-10-02 | 10 | 5 | POLISH-03 | T-13-10-02/03 | Export handler + filename sanitization unchanged (trigger mount point only); smaller page-1 reserve proven by geometry + corpus specs | e2e (new + realigned) | `npx playwright test tests/e2e/chrome/tag-popover.spec.ts tests/e2e/chrome/header-geometry.spec.ts tests/e2e/chrome/dialog-centering.spec.ts tests/e2e/a11y.spec.ts tests/e2e/portability/highlights-export.spec.ts` | ❌ tag-popover → created by this task; highlights-export ✅ existing (realigned — drawer-open step) | ⬜ pending |
| 13-10-03 | 10 | 5 | ACPT-06 (D13-10 re-run) | — | Honest full-suite gate re-run after the gap-closure wave (13-10 is wave 5, runs last); exit 0 with counts recorded in 13-10-SUMMARY.md | full-suite gate | `npm run test` | ✅ command exists; record = 13-10-SUMMARY.md (created by this task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing infrastructure (Vitest + Playwright 3-engine matrix, `npm run test` harness) covers all phase requirements. Every new spec file in the map above is created **by its owning task**, test-first where the plan marks `tdd="true"` (13-01-01, 13-02-01, 13-05-02); no separate Wave 0 plan is needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NVDA+Firefox acceptance protocol run (6 scripted flows + 5 exploratory charters), zero blocker/major to pass | ACPT-05 | NVDA + Windows hardware unavailable to the agent (D13-07 prepare-then-run-later) | Run docs/ACCEPTANCE-PROTOCOL.md AS-DOCUMENTED on Windows; record role+name outcomes in the 13-VERIFICATION.md findings table; fix-then-re-run per D13-06; ACPT-05 flips only when results land |
| VoiceOver+Safari supplementary re-run over the NEW v2.0 surfaces | D13-05 (supplementary — explicitly NOT an ACPT-05 gate) | VoiceOver is interactive AT on the user's macOS hardware; not agent-runnable | Follow the VO checklist in 13-VERIFICATION.md (library browse/search/tags, ingest + refusals, review panel, export/import dialogs, book groupings); record findings; same fix-then-re-run policy |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (no MISSING refs — every new spec is created by its owning task)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in the map has one)
- [x] Wave 0 covers all MISSING references (none exist — see Wave 0 section)
- [x] No watch-mode flags (all commands are single-shot `--run` invocations)
- [x] Feedback latency < 3 min per task; full gate ~10–20 min
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-18 (plan-time — populated from adopted plans 13-01…13-06 per checker revision; re-affirmed per wave during execution)
