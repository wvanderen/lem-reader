---
phase: 19
slug: cross-block-highlights
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-30
updated: 2026-08-30
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from plan `<verify>` blocks + 19-RESEARCH §Validation Architecture (revision R1, per checker fix).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, jsdom env) + Playwright Test 1.61.1 (e2e — chromium/firefox/webkit + chromium-throttled-mobile) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` (workers: 3 — existing, byte-stable) |
| **Quick run command** | `npx vitest run tests/unit/annotations` (unit) · `npx playwright test tests/e2e/annotations/<touched-spec>` (touched specs) |
| **Full suite command** | `npm run test` (unit `--run` + 3-engine e2e + throttled perf; exit 0 = honest gate) |
| **Estimated runtime** | ~30–60s (unit quick) · ~3–6min (annotations e2e subset) · ~15–25min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/annotations` + the touched-spec Playwright file(s) from the map below
- **After every plan wave:** Run `npm run test:unit -- --run && npx playwright test tests/e2e/annotations`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Phase gate (19-05-T3):** full `npm run test` in ONE invocation — exit 0, no engine skips; check dev-server freshness before diagnosing webkit "failures" (Phase 18 webkit-starvation lesson)
- **Max feedback latency:** 120 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-T1 | 01 | 1 | ANNO-08, ANNO-12 | T-19-01, T-19-02, T-19-03 | Closed-set reason literals (not reader input); refusals return reason-only with NO position; composed offsets derive solely from endpoint block metadata; zero schema/persistence/normalizeText change (Pitfall 9) | unit | `npx vitest run tests/unit/annotations/capture-offset-mapping.test.ts` | ✅ (extends; span cells land 19-01-T3) | ⬜ pending |
| 19-01-T2 | 01 | 1 | ANNO-12 (D19-06/D19-09) | T-19-01 | One new closed hint string; retired reason literal + retired copy zero-match across src/; overlap math untouched (D19-07 caller discipline); toolbar buttons byte-stable | grep | `! grep -rn '"multi-block"' src/ && ! grep -rq "Select within a single block" src/` | ✅ | ⬜ pending |
| 19-01-T3 | 01 | 1 | ANNO-08, ANNO-12 | T-19-01 | Span success proven in real browsers both modes; one-record semantics (`countHighlightsInDexie === 1`); refusal surfaces honestly reduced (overlap + measurement-body stay); no skips | unit + e2e | `npx vitest run tests/unit/annotations/capture-offset-mapping.test.ts && npx playwright test tests/e2e/annotations/capture-rejects.spec.ts tests/e2e/annotations/span-capture.spec.ts` | ❌ W0 — span-capture.spec.ts created by this task | ⬜ pending |
| 19-02-T1 | 02 | 1 | ANNO-11 (D19-10) | — | Pure derivation — no React/DOM/side effects; never invents content for impossible empty exact; ellipsis honesty locked (no ellipsis on complete single fragment) | unit | `npx vitest run tests/unit/annotations/excerpt.test.ts` | ❌ W0 — created by this task | ⬜ pending |
| 19-02-T2 | 02 | 1 | ANNO-11 | T-19-05 | React text children only (react/no-danger); per-surface caps unchanged; ReviewRow anatomy byte-stable — no span badge (D19-11) | unit + e2e | `npx vitest run tests/unit/annotations && npx playwright test tests/e2e/annotations/drawer-view.spec.ts tests/e2e/annotations/note-popover-focus.spec.ts tests/e2e/annotations/delete-confirm.spec.ts` | ✅ | ⬜ pending |
| 19-02-T3 | 02 | 1 | ANNO-10 (export leg), ANNO-11 | T-19-04 | `escapeMarkdownLine` applied PER LINE — continuation lines cannot forge blockquote-breaking structure (V5 guard); export never truncates (full span round-trips) | unit | `npx vitest run tests/unit/portability/markdown.test.ts` | ✅ (extends) | ⬜ pending |
| 19-03-T1 | 03 | 2 | ANNO-09, ANNO-12 | T-19-07 | First-slice-only DOM id (Pitfall 2 anti-clobbering; ids derive from crypto.randomUUID); every slice keeps data-highlight-id + tabIndex + aria discipline; ArticleView focus consumers untouched | unit + e2e | `npx vitest run tests/unit/annotations/list-highlight-render.test.tsx && npx playwright test tests/e2e/annotations/cross-fragment-render.spec.ts` | ❌ W0 — list-highlight-render.test.tsx created by this task | ⬜ pending |
| 19-03-T2 | 03 | 2 | ANNO-09, ANNO-12 | T-19-09 | List markers stay CSS chrome — never inside a mark (D19-14); slicer consumed not forked; zero schema change; PERF_FIXTURES untouched (perf budget pinned) | unit + e2e | `npx vitest run tests/unit/annotations/list-highlight-render.test.tsx tests/unit/annotations/blockquote-highlight-render.test.tsx && npx playwright test tests/e2e/pagination/coverage-invariant.spec.ts tests/e2e/acceptance/core-reading-flow.spec.ts` | fixture ❌ W0 — nested-list-paths.canonical.json created by this task | ⬜ pending |
| 19-03-T3 | 03 | 2 | ANNO-09, ANNO-12 | T-19-08 | Caption/code segments are string slices rendered as React text children (no dangerouslySetInnerHTML); code segments round-trip byte-exact; zero/one additive CSS guard under existing tokens only | unit | `npx vitest run tests/unit/annotations/list-highlight-render.test.tsx && npx vitest run tests/unit/annotations` | ✅ (file from 19-03-T1) | ⬜ pending |
| 19-04-T1 | 04 | 3 | ANNO-09 | T-19-11 | Entry-local coordinates never mix with D-05 globals in one call (Pitfall 4); data-block-index / data-block-grapheme-start emission byte-identical (capture round-trip depends on it); no capture.ts change (no cross-page escape) | unit | `npx vitest run tests/unit/annotations/cross-fragment-slicing.test.ts` | ✅ (extends) | ⬜ pending |
| 19-04-T2 | 04 | 3 | ANNO-09, ANNO-10 | T-19-10, T-19-12 | Exactly one `id="hl-…"` per highlight per mounted page (locator count===1 — axe will not catch duplicate-id, A1); cross-page capture refusal stays green byte-unchanged (ANNO-13 Future); caption/code entry routing pinned (no silent paginated bypass) | unit + e2e | `npx vitest run tests/unit/annotations/cross-fragment-slicing.test.ts && npx playwright test tests/e2e/annotations/cross-fragment-render.spec.ts tests/e2e/annotations/capture-rejects.spec.ts` | ✅ (extends) | ⬜ pending |
| 19-05-T1 | 05 | 4 | ANNO-08, ANNO-12 | — | All 8 endpoint kinds + 3 interior-gap classes + 3 refusal classes proven in real browsers; exact refusal string asserted; harness imported never forked; no skips | e2e | `npx playwright test tests/e2e/annotations/eligibility-matrix.spec.ts` | ❌ W0 — created by this task | ⬜ pending |
| 19-05-T2 | 05 | 4 | ANNO-10, ANNO-11 | T-19-14 | Atomic delete (zero marks + note cascade in both modes); jump lands on span-start slice; note-edit on a span reaches the ONE record (D5-10 1:1); multi-line exact survives export→import; long-span degradation never silent (tri-state) | unit + e2e | `npx vitest run tests/unit/annotations/resolve-quote-selector.test.ts && npx playwright test tests/e2e/annotations/survive-relayout.spec.ts tests/e2e/annotations/persist-reload.spec.ts tests/e2e/annotations/delete-confirm.spec.ts tests/e2e/annotations/span-capture.spec.ts tests/e2e/annotations/note-create-edit.spec.ts tests/e2e/portability/round-trip.spec.ts` | ✅ (all extend strengthen-only) | ⬜ pending |
| 19-05-T3 | 05 | 4 | ANNO-08..12 (gate) | T-19-13 | One-invocation honest gate; verbatim pass/fail counts in SUMMARY; zero skips; pre-existing unrelated failures logged to deferred-items.md — not absorbed | full suite | `npm run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan — the phase's test scaffolds ship inside the executing tasks, per 19-RESEARCH §Validation Architecture §Wave 0 Gaps (mapped to owners):

- [ ] `tests/e2e/annotations/span-capture.spec.ts` — ANNO-08 success cells (incl. the retired-D5-06 two-block selection moved from capture-rejects.spec.ts) — created by **19-01-T3**
- [ ] `tests/unit/annotations/excerpt.test.ts` — excerpt honesty cells — created by **19-02-T1**
- [ ] `tests/unit/annotations/list-highlight-render.test.tsx` — list/caption/code render cells — created by **19-03-T1**, extended by **19-03-T2/T3**
- [ ] `src/fixtures/articles/nested-list-paths.canonical.json` + registrations (fixtures/index.ts, fixtures-matrix.ts FIXTURES) — D19-15 recursion corpus — created by **19-03-T2**
- [ ] `tests/e2e/annotations/eligibility-matrix.spec.ts` — the ANNO-12 matrix — created by **19-05-T1**
- [ ] Duplicate-id guard assertion (`[id="hl-<id>"]` count === 1 for a multi-block span) — pinned by **19-04-T2** e2e cell (a) (axe will not catch it — A1)
- [ ] Framework install: **none needed** — infrastructure complete (19-RESEARCH §Environment Availability: all dependencies ✓)

*`wave_0_complete` flips true when the first task-created scaffold commits (19-01-T3 or 19-02-T1, whichever lands first in Wave 1).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* Phase 19 introduces no new UI surface pattern — the selection toolbar is unchanged for spans (D19-09) and marks extend the shipped D5-16 anatomy — so no manual screen-reader protocol is mandated beyond the project baseline (19-UI-SPEC §Regression Targets lists no phase-19-specific manual row).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (14/14 rows; 5 task-created scaffolds ship inside their owning tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (scaffold owners listed above; existing infra covers the rest)
- [x] No watch-mode flags (`vitest run` throughout; Playwright non-watch)
- [x] Feedback latency < 120s (quick command)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-30 (planner sign-off, revision R1 — populated from plan verify blocks + 19-RESEARCH §Validation Architecture per checker fix)
