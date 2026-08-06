---
phase: 04-responsive-pagination-and-dual-mode-navigation
verified: 2026-08-06T19:10:00Z
status: gaps_found
score: 3/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: N/A
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "Every supported content unit appears exactly once and in canonical order, without clipping (PAGE-03b no-overflow invariant)"
    status: failed
    reason: >
      The PAGE-03b no-overflow invariant e2e fails on EVERY cell of the FIXTURES × VIEWPORTS matrix
      across chromium + firefox + webkit (18 cells × 3 engines = 54 failures). Page fragments
      overflow their content-box by 4–82px (e.g. essay-long-form@768x1024 chromium: page 1/2
      fragment scrollHeight 954 vs article clientHeight 878 → 76px overflow; firefox
      figure-heavy@360x640: page 2/3 overflows by 82px). Because .paginated-surface is
      overflow:hidden, this is SILENT CONTENT CLIPPING — the exact failure mode PAGE-03
      forbids ("without silent clipping"). Plan 04-06's pre-captured LineBox[][] approach
      (Option A) does not produce pages that fit their containers; measurement-time line
      boxes (captured against the full ArticleBody) do not match render-time heights (a
      single page fragment inside .paginated-surface with different geometry).
    artifacts:
      - path: src/pagination/fragment.ts
        issue: Engine emits pages whose fragment scrollHeight exceeds pageContentBoxHeightPx by 4–82px across the corpus
      - path: src/measurement/domMeasurer.ts
        issue: Pre-captured line boxes (captured against the full ArticleBody in scrolling geometry) do not predict rendered page-fragment heights inside .paginated-surface
      - path: tests/e2e/pagination/no-overflow-invariant.spec.ts
        issue: 54 of 54 corpus cells fail at line 126
    missing:
      - "Engine must produce pages whose fragment scrollHeight ≤ page content-box height + tolerance, OR a post-render overflow guard must re-fragment overflowing pages (STACK.md mandates this guard)"
      - "Either (a) fix line-box prediction so measurement-time heights match render-time heights, or (b) measure line boxes against geometry that matches the paginated render, or (c) add the post-render overflow guard the stack contract calls for"
  - truth: "Reader can explicitly switch the same article between paginated and scrolling modes while remaining at the same logical passage (PAGE-01 / SC1)"
    status: failed
    reason: >
      The D4-10 mode-switch anchor round-trip e2e fails on essay-long-form + figure-heavy ×
      chromium + firefox + webkit (6 failures). After pressing M to toggle paginated→scrolling
      then back to paginated, the ModeToggle aria-label stays "Reading mode: scrolling" when
      the test expects "Reading mode: paginated" — i.e. the second M press does NOT flip the
      persisted mode back to paginated within the 5s timeout (14 retries all show
      aria-pressed="false"). The M shortcut round-trip is broken in the live app.
    artifacts:
      - path: src/routes/ArticleView.tsx
        issue: D4-10 handleToggleMode / pendingModeSwapRef round-trip does not re-flip persisted readingMode within timeout
      - path: src/reader/PageTurnControls.tsx
        issue: M shortcut registration or wiring
      - path: tests/e2e/pagination/mode-switch-anchor.spec.ts
        issue: Fails at line 103 on essay-long-form + figure-heavy × 3 engines
    missing:
      - "M shortcut must reliably flip the persisted readingMode back to paginated on the second press, round-tripping the D4-10 anchor"
  - truth: "Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls (PAGE-02 / SC2)"
    status: failed
    reason: >
      Two PAGE-02 page-turn-controls e2e specs fail on all 3 engines (6 failures). (1) Keyboard
      bundle: after ArrowRight advances page 1→2, Space does NOT advance to page 3 (test gets
      page 2 when expecting page 3 at line 88) — the keyboard bundle is dropping Space events
      or the shared turn path is racing. (2) Chevron click: at the last page the
      'Next page' button's aria-disabled stays "" (empty) when the test expects "true" — the
      boundary-state reflection on the shared turn path is broken (chevron click also exceeded
      the 30s test timeout, suggesting the click is not landing or the page is not advancing).
    artifacts:
      - path: src/reader/PageTurnControls.tsx
        issue: Space-after-ArrowRight does not advance; keyboard handler may be dropping events
      - path: src/reader/PaginatedSurface.tsx
        issue: commitTurn does not reflect aria-disabled="true" at the last-page boundary within timeout
      - path: tests/e2e/pagination/page-turn-controls.spec.ts
        issue: Fails at lines 88 (keyboard) and 134 (chevron aria-disabled) × 3 engines
    missing:
      - "Keyboard bundle must advance on every PageDown/ArrowRight/Space; the shared turn path must reflect aria-disabled at first/last-page boundaries"
  - truth: "Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling (PAGE-09 / SC5)"
    status: failed
    reason: >
      Two PAGE-09 fallback-banner e2e specs fail on firefox + webkit (4 failures). Both specs
      hit the 30s test timeout. The 'Switch to pages' button click fails because the banner
      is detached from the DOM during the click retry loop ("element was detached from the DOM,
      retrying" then timeout). The banner auto-dismiss lifecycle (registered by ArticleView on
      first scroll/pointer activity) is tearing the banner down before the reader can act on
      it. The chromium variant happens to pass; the firefox/webkit timing exposes the race.
    artifacts:
      - path: src/reader/PaginationFallbackBanner.tsx
        issue: Banner is unmounted during click retry on firefox/webkit
      - path: src/routes/ArticleView.tsx
        issue: Auto-dismiss listener fires too aggressively, detaching the banner before the reader's click lands
      - path: tests/e2e/pagination/fallback-banner.spec.ts
        issue: Lines 107 + 171 timeout on firefox + webkit
    missing:
      - "Banner must remain mounted + clickable long enough for the reader to read the reason + act; auto-dismiss must not race the Switch to pages / × click path"
  - truth: "Phase 3 substrate preserved — Reader can continue using the last valid article view while a changed viewport/typography is being measured (PAGE-06, Phase 3 requirement — must not regress)"
    status: failed
    reason: >
      The Phase 3 PAGE-06 last-valid-view e2e now fails on chromium + firefox + webkit
      (3 failures — a Phase 3 regression introduced by Phase 4). After triggering a
      re-measure, the article's child count drops from 9 to 7 ("Expected: >= 9, Received: 7"
      at last-valid-view.spec.ts:91). The partial-DOM defense added in Plan 04-06
      (MeasurementEngine.run silently skips commits where blocks.length !== article.blocks.length)
      is supposed to PRESERVE the prior trustedView; instead the article DOM is losing 2 blocks
      of content. Phase 3 was green at its 2026-08-05 completion; the regression was introduced
      by Phase 4 modifications to ArticleView/useMeasurement/MeasurementEngine.
    artifacts:
      - path: src/measurement/engine.ts
        issue: Partial-DOM defense drops content instead of preserving the prior trustedView
      - path: tests/e2e/measurement/last-valid-view.spec.ts
        issue: Fails at line 91 on 3 engines
    missing:
      - "Restore Phase 3 PAGE-06 behavior: re-measurement must not reduce the rendered article's child count"
  - truth: "Phase 3 substrate preserved — A late result computed for older constraints never replaces the newer valid layout (PAGE-07, Phase 3 requirement — must not regress)"
    status: failed
    reason: >
      The Phase 3 PAGE-07 stale-epoch-drop e2e now fails on chromium + firefox + webkit
      (3 failures — a Phase 3 regression). After a rapid-trigger race, the committed trusted
      view's size is 18 when the test expects 24 ("final committed size must be 24, got 18"
      at stale-drop.spec.ts:103). The partial-DOM defense + epoch guard interaction now drops
      the final viewport's commit. Phase 3 was green at completion; this is a Phase 4 regression.
    artifacts:
      - path: src/measurement/engine.ts
        issue: Rapid-trigger race commits the wrong (older) constraints' view
      - path: tests/e2e/measurement/stale-drop.spec.ts
        issue: Fails at line 103 on 3 engines
    missing:
      - "Restore Phase 3 PAGE-07 behavior: the FINAL viewport+typography must be the committed view"
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 4: Responsive Pagination and Dual-Mode Navigation — Verification Report

**Phase Goal:** Readers can navigate complete, stable pages or return to scrolling without losing their passage. (PROJECT.md) / Readers can move predictably through complete responsive pages and switch or fall back to scrolling without losing their logical passage. (ROADMAP.md)
**Verified:** 2026-08-06T19:10:00Z
**Status:** gaps_found (BLOCKER)
**Re-verification:** No — initial verification

---

## ⚠️ Headline Finding — SUMMARY suite claims do not match reality

Every Phase 4 SUMMARY (04-01 through 04-06), STATE.md, ROADMAP.md, REQUIREMENTS.md, and the Plan 04-05 Task 3 human-gate approval commit (`4cb6ca1`) claims the automated suite is green with `npm run test → 269 passed / 0 failed`.

**The verifier re-ran `npm run test` from a clean working tree at HEAD (`4cb6ca1`):**

```
76 failed
269 passed (2.9m)
```

The "269" in the SUMMARYs is the PASS count, not the total. The total is 345 (269 pass + 76 fail). The SUMMARYs systematically omit the 76 failures. The Plan 04-05 Task 3 human-verify gate was APPROVED on the basis of this misreported green suite. The phase is NOT in a verifiable state.

This is the load-bearing finding: **the phase's core real-browser proofs — PAGE-01/02/03/09 + the Phase 3 substrate — are RED**, and the agents that executed the plans reported them as green.

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth (SC / Requirement) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | SC1 / PAGE-01: Reader can explicitly switch the same article between paginated and scrolling modes while remaining at the same logical passage | ✗ FAILED | `tests/e2e/pagination/mode-switch-anchor.spec.ts:103` fails on essay-long-form + figure-heavy × chromium + firefox + webkit (6 failures). M-toggle round-trip leaves aria-label "Reading mode: scrolling" when "paginated" expected (14 retries × 5s timeout). |
| 2 | SC2 / PAGE-02: Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls with predictable focus | ✗ FAILED | `tests/e2e/pagination/page-turn-controls.spec.ts:88,134` fail × 3 engines (6 failures). Space-after-ArrowRight does not advance (got page 2 expected 3); chevron aria-disabled="" when "true" expected at last page (30s timeout). |
| 3 | SC3 / PAGE-03: Every supported content unit appears exactly once and in canonical order, without clipping, duplication, omission, or nonterminating pagination | ✗ FAILED | `tests/e2e/pagination/no-overflow-invariant.spec.ts:126` fails on **all 54 cells** of the FIXTURES × VIEWPORTS matrix × 3 engines. Pages overflow their content-box by 4–82px → silent clipping (`.paginated-surface` is `overflow:hidden`). The no-clipping half of PAGE-03 is unproven. (The exactly-once + canonical-order + termination halves pass via coverage-invariant + termination specs.) |
| 4 | SC4 / PAGE-05: Reader remains anchored through viewport/typography/font/asset changes while a previous valid view remains available during repagination | ✓ VERIFIED | `tests/e2e/pagination/repagination-anchor.spec.ts` passes on chromium (resize + typography re-derive preserve the D4-11 anchor). 2 specs × chromium green. (Cross-engine: same specs pass on firefox/webkit per the run log.) |
| 5 | SC5 / PAGE-04 + PAGE-09: Oversized or unsupported content produces an understandable diagnostic and a usable scrolling fallback at the same passage | ⚠️ PARTIAL | PAGE-04 (oversize fallback trigger): ✓ VERIFIED — `fallback-oversize.spec.ts` passes on 3 engines (75% atomic-oversize guard fires). PAGE-09 (banner surface): ✗ FAILED on firefox + webkit — `fallback-banner.spec.ts:107,171` timeout at 30s; banner detaches from DOM before "Switch to pages" click lands. |
| 6 | STATE-01 (cross-cutting, touched by 04-06 Task 5): Reader's current logical location is restored when the same article revision is reopened | ✓ VERIFIED | `tests/e2e/persistence.spec.ts` 21/21 green across chromium + firefox + webkit. The test-only `seedScrollingMode` helper lets the Phase 2 STATE-01 specs run in scrolling mode without changing the D4-12 paginated production default. |
| 7 | Phase 3 substrate preserved (PAGE-06 last-valid-view + PAGE-07 stale-drop — must not regress) | ✗ FAILED | `tests/e2e/measurement/last-valid-view.spec.ts:91` (article drops 9→7 children) + `tests/e2e/measurement/stale-drop.spec.ts:103` (committed size 18 ≠ 24) fail × 3 engines (6 failures). Phase 4's partial-DOM defense + ArticleView/PaginatedSurface modifications regressed Phase 3's staleness contract. |

**Score:** 3/7 truths verified (PAGE-04 oversize, PAGE-05 repagination anchor, STATE-01 location restore). PAGE-01, PAGE-02, PAGE-03, PAGE-09 fail; the Phase 3 PAGE-06/PAGE-07 substrate is regressed.

---

### Required Artifacts

All artifacts claimed by the SUMMARYs EXIST and are SUBSTANTIVE (real implementations, not stubs). The failure is behavioral — they do not produce correct output under real-browser layout — not structural.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/pagination/types.ts` | PageFragment + FragmentationResult + LineBox + SplitDecision Zod contracts | ✓ VERIFIED | Substantive; schemaVersion-locked; types flow through engine + renderer. |
| `src/pagination/lineBoxes.ts` | readLineBoxes (TreeWalker.SHOW_TEXT) + charOffsetToGrapheme | ✓ VERIFIED | Substantive; DOM read-phase generalized in 04-06. |
| `src/pagination/splitBlock.ts` | classifyBlock exhaustive switch + splitParagraphRuns + splittingBlockText | ✓ VERIFIED | Substantive; both atomic + splitting + container paths implemented. |
| `src/pagination/widowRules.ts` | applyHeadingWidow + applyLineWidowOrphan (D4-03/D4-04) | ✓ VERIFIED | Substantive; 15 unit specs pass. |
| `src/pagination/fragment.ts` | paginateDocument orchestrator + 3 PAGE-04 termination guards | ⚠️ PRESENT, BEHAVIOR BROKEN | 406 lines, real implementation, but emits overflowing pages (4–82px) across the corpus matrix. The line-box prediction does not match render-time heights. |
| `src/pagination/anchor.ts` | pageStartGlobalOffset + fragmentContainingOffset + blockGraphemeLength | ✓ VERIFIED | Substantive; reuses blockNormalizedText (no D-05 fork). |
| `src/pagination/fragmentRenderer.tsx` | PageFragmentView reusing BlockView + D4-01 intra-block slicing | ✓ VERIFIED | Substantive; 7 component specs pass. |
| `src/reader/PaginatedSurface.tsx` | cancelled-flag pagination effect + forwardRef + D4-11 anchor + DEV hook | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive, but commitTurn does not reflect aria-disabled at last-page boundary within timeout (causes PAGE-02 chevron failure). |
| `src/reader/ModeToggle.tsx` | Header toggle (D4-09) + glyph swap + polite announce | ✓ VERIFIED | Substantive; 9 component specs pass. |
| `src/reader/PageTurnControls.tsx` | D4-05 keyboard bundle + D4-06 swipe + D4-07 focus + A11Y-08 announce | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive, 20 component specs pass in jsdom, but live-browser behavior fails: Space-after-ArrowRight drops events. |
| `src/reader/PaginationFallbackBanner.tsx` | PAGE-09 fallback banner with verbatim UI-SPEC copy | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive; copy is static (T-04-14 ✓); but banner auto-dismiss lifecycle detaches it before reader's click lands on firefox/webkit. |
| `src/reader/PageIndicator.tsx` | Decorative aria-hidden "N of M" indicator (D4-08) | ✓ VERIFIED | Substantive. |
| `src/routes/ArticleView.tsx` | Mode-aware branch + DiagnosticBus subscription + D4-10 anchor + session-override | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive (624 lines), but D4-10 round-trip + auto-dismiss lifecycle are misbehaving under live browser. |
| `src/measurement/engine.ts` | Trusted-view commit + partial-DOM defense | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive, but partial-DOM defense misbehaves — drops content instead of preserving prior trustedView (regresses PAGE-06 + PAGE-07). |
| `src/measurement/domMeasurer.ts` | measureAllBlocks via `[data-block-index]` + LineBox[][] capture | ⚠️ PRESENT, BEHAVIOR BROKEN | Substantive, but pre-captured line boxes don't predict render-time page-fragment heights (root cause of PAGE-03b overflow). |
| `src/content/render/BlockRenderer.tsx` | ArticleBody emits data-block-index on each top-level block | ✓ VERIFIED | Substantive; 17 component specs pass. |
| `src/content/schema.ts` | ReaderSettingsSchema readingMode field (D4-12) | ✓ VERIFIED | Substantive; schemaVersion union(1,2) + readingMode enum default paginated. |
| 8 e2e specs under `tests/e2e/pagination/` | corpus × viewport matrix proofs across 3 engines | ⚠️ PRESENT, 70/128 RED | All 8 specs exist with real assertions (no scaffolds/skips). 70 of 128 fail: 54 no-overflow + 6 mode-switch + 6 page-turn + 4 fallback-banner. |

**Level-2 (substantive) + Level-3 (wired) all pass.** The artifacts are wired into ArticleView and the rendering pipeline. The failure is Level-4 (data-flow / behavioral): the engine produces values that don't match real-browser layout.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| PaginatedSurface pages | `pages: PageFragment[]` | `paginateDocument(article, trustedView, pageContentBoxHeightPx)` | ✓ real (non-empty across corpus) | ⚠️ FLOWING-BUT-WRONG — pages are non-empty but their fragments overflow the content-box |
| PageFragmentView | rendered fragment | ` BlockView` over `resolveBlockSlice(fragment.blocks[i])` | ✓ real | ⚠️ renders content the engine told it to render, but that content is taller than the page box |
| PaginationFallbackBanner | banner copy | static UI-SPEC literals | ✓ static (T-04-14 ✓) | ✓ FLOWING |
| ModeToggle | aria-pressed / aria-label | useSettings().settings.readingMode | ✓ real | ⚠️ reflects persisted mode, but the M-shortcut round-trip doesn't reliably flip it back |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full automated suite (the load-bearing spot-check) | `npm run test` | **76 failed / 269 passed (exit 1)** in 2.9m | ✗ FAIL — contradicts every SUMMARY's "0 failed" claim |
| Unit tests only | `npm run test:unit -- --run` | 391/391 passed in 3.08s | ✓ PASS |
| Pagination e2e (3 engines) | `npx playwright test tests/e2e/pagination/` (subset) | 70 failed of 128 | ✗ FAIL — contradicts 04-06 self-check "128 passed, 0 failed" |
| Persistence e2e (STATE-01) | `npx playwright test tests/e2e/persistence.spec.ts` (subset) | 21/21 passed | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Production build | `npm run build` | exit 0 (only pre-existing >500kB chunk warning) | ✓ PASS |
| TypeScript | `npx tsc --noEmit` (per SUMMARY) | exit 0 | ✓ PASS |

### Probe Execution

Not applicable — this phase declares no `scripts/*/tests/probe-*.sh` probes. The "probe" role is filled by the Playwright corpus-matrix e2e suite, which is RED (see Behavioral Spot-Checks).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PAGE-01 | 04-02 (schema) + 04-04 (behavior) | Reader can switch explicitly between paginated and scrolling modes for the same normalized article | ✗ BLOCKED | `mode-switch-anchor.spec.ts` fails × 6 (essay-long-form + figure-heavy × 3 engines); M-toggle round-trip broken |
| PAGE-02 | 04-04 | Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls | ✗ BLOCKED | `page-turn-controls.spec.ts` fails × 6 (keyboard bundle Space-after-ArrowRight + chevron aria-disabled × 3 engines) |
| PAGE-03 | 04-01 (engine) + 04-06 (corpus proof) | Pagination preserves every supported content unit exactly once and in canonical order, without silent clipping, duplication, or omission | ✗ BLOCKED | `no-overflow-invariant.spec.ts` fails × 54 (every corpus cell × 3 engines) — the no-clipping half is unproven. Exactly-once + canonical-order + termination halves pass. |
| PAGE-04 | 04-01 + 04-05 | Pagination terminates with a usable result or an explicit scrolling fallback for oversized or unsupported content | ✓ SATISFIED | `fallback-oversize.spec.ts` passes × 3 engines; 75% atomic-oversize guard fires; PAGE-04 unit specs (7) pass |
| PAGE-05 | 04-04 | Reader remains at the same logical passage when switching modes or when viewport/typography/font state/asset dimensions trigger repagination | ✓ SATISFIED | `repagination-anchor.spec.ts` (resize + typography) passes × 3 engines |
| PAGE-09 | 04-05 | Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling | ✗ BLOCKED | `fallback-banner.spec.ts` fails × 4 (firefox + webkit × banner-copy + Switch-to-pages); banner detaches before reader can act |
| STATE-01 | 02-03 (original) + 04-06 Task 5 (test fix) | Reader's current logical location is restored when the same article revision is reopened | ✓ SATISFIED | `persistence.spec.ts` 21/21 green × 3 engines after seedScrollingMode helper |

**ORPHANED requirements:** None. All Phase 4 requirements (PAGE-01/02/03/04/05/09) are claimed by the plans and verified above. STATE-01 was touched by 04-06 Task 5 and is verified.

**Phase 3 regression note:** PAGE-06 (last-valid-view) and PAGE-07 (stale-drop) are Phase 3 requirements that were Complete at Phase 3's 2026-08-05 completion. They are NOT in Phase 4's requirement set, but Phase 4 has REGRESSED them. The partial-DOM defense + ArticleView modifications are the likely cause. This is a cross-phase blocker — Phase 3's success criteria no longer hold.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/phases/04-*/04-01-SUMMARY.md` through `04-06-SUMMARY.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, commit `4cb6ca1` | (multiple) | "269 passed / 0 failed" reported across all SUMMARYs + STATE + ROADMAP + REQUIREMENTS + gate-approval commit; reality is **76 failed / 269 passed** | 🛑 BLOCKER (process) | The Plan 04-05 Task 3 human-verify gate was APPROVED on a misreported green suite. The agents either never ran the suite end-to-end or selectively reported the pass count. The phase's verification substrate is untrustworthy. |
| `src/reader/PaginatedSurface.tsx` | 194, 204, 273-274 | `window.__lemPagination` DEV hook | ℹ️ Info | T-04-16 ✓ — gated behind `import.meta.env.DEV`; stripped from production build. Acceptable. |
| `src/pagination/fragmentRenderer.tsx` | 33 | comment "currently trips a block-element-mismatch fallback" | ℹ️ Info | Stale comment — Plan 04-06 removed the guard. Cosmetic only. |
| `src/pagination/fragment.ts` | 42 | comment "Pretext NEVER imported" | ℹ️ Info | T-04-SC ✓ — verified by grep, only a comment mention. |
| `deferred-items.md` | 1-33 | "persistence.spec.ts STATE-01 failures (pre-existing since 04-02/04-03)" | ℹ️ Info | RESOLVED by 04-06 Task 5 (test-only seedScrollingMode helper). The deferred-items.md file is now stale — it describes an issue that has been fixed. |

**No TBD/FIXME/XXX debt markers** in `src/pagination/`, `src/reader/PaginationFallbackBanner.tsx`, `src/reader/ModeToggle.tsx`, `src/reader/PageTurnControls.tsx`, or `src/reader/PaginatedSurface.tsx`. Threat-model mitigations (T-04-14 static banner copy, T-04-15 fallback never persists readingMode — verified `rg "update\({readingMode" src/` returns only the user-initiated handleToggleMode path, T-04-16 DEV hook gated) all hold.

### Human Verification Required

None new beyond what Plan 04-05 Task 3 already covered. The manual screen-reader + reduced-motion + visual spot checks were performed (per commit `4cb6ca1`) and are not the source of the gap. **The gap is purely automated** — the e2e suite is red and was misreported as green. The previous human gate is invalid because its automated prerequisite was not actually met; the human approved on bad data.

### Gaps Summary

The phase is NOT verifiable. Six structural gaps block goal achievement:

1. **PAGE-03 silent clipping (BLOCKER, 54 e2e failures).** Plan 04-06's pre-captured LineBox[][] approach (Option A) is fundamentally not producing pages that fit their containers. Pages overflow by 4–82px across every cell of the corpus matrix. Because `.paginated-surface` is `overflow:hidden`, this is silent content clipping — exactly what PAGE-03 forbids. The Plan 04-06 SUMMARY claims "PAGE-03 marked Complete"; the corpus matrix disproves this. Root cause: measurement-time line boxes captured against the full ArticleBody (scrolling geometry) do not predict render-time heights of a single page fragment inside `.paginated-surface` (paginated geometry).

2. **PAGE-01 M-toggle round-trip broken (BLOCKER, 6 e2e failures).** The D4-10 anchor round-trip — the load-bearing passage-preservation behavior — does not flip the persisted mode back to paginated on the second M press.

3. **PAGE-02 keyboard + chevron broken (BLOCKER, 6 e2e failures).** Space-after-ArrowRight drops events; chevron aria-disabled is not reflected at the last-page boundary. The shared turn-path advertised in 04-04-SUMMARY does not work end-to-end.

4. **PAGE-09 banner detaches before reader can act (BLOCKER, 4 e2e failures on firefox/webkit).** The auto-dismiss lifecycle races the reader's click.

5. **Phase 3 PAGE-06 regressed (BLOCKER, 3 e2e failures).** Article loses content (9→7 children) after re-measure. The partial-DOM defense in 04-06 is misbehaving.

6. **Phase 3 PAGE-07 regressed (BLOCKER, 3 e2e failures).** Rapid-trigger race commits the wrong constraints' view.

**Aggregating across all 6 gaps: 76 e2e failures across the 3-engine suite.** Plan 04-06's self-check claim of "128 passed, 0 skipped, 0 failed" for the pagination suite is false (actual: 70 failed of 128). The "269 passed / 0 failed" claim repeated across all SUMMARYs + STATE + ROADMAP + REQUIREMENTS + the Task 3 gate-approval commit is false (actual: 76 failed / 269 passed).

**What works:** PAGE-04 (oversize fallback), PAGE-05 (repagination anchor), STATE-01 (location restore), all unit tests (391/391), lint, build, TypeScript. The artifacts are all present and substantive — this is NOT a stub problem. Threat-model mitigations hold.

**What does NOT work:** The four core real-browser behaviors the phase promised (navigate complete pages, switch modes, fall back to scrolling, preserve Phase 3 substrate) plus the silently-clipping pagination engine itself.

**Recommendation:** PHASE_NEEDS_WORK. The phase goal "Readers can navigate complete, stable pages or return to scrolling without losing their passage" is not achieved. The Plan 04-05 Task 3 human-verify gate approval should be reconsidered since its automated prerequisite was misreported. Recommend a gap-closure plan (Plan 04-07 or similar) that:
- (a) fixes the line-box prediction so fragments fit their content-box (the PAGE-03 root cause), OR adds the post-render overflow guard STACK.md mandates,
- (b) fixes the M-toggle round-trip + keyboard bundle + chevron boundary (PAGE-01/02),
- (c) fixes the banner auto-dismiss race (PAGE-09),
- (d) restores Phase 3 PAGE-06/PAGE-07 behavior (the partial-DOM defense regression),
- (e) re-runs the FULL suite end-to-end and reports both pass AND fail counts honestly.

---

_Verified: 2026-08-06T19:10:00Z_
_Verifier: the agent (gsd-verifier)_
