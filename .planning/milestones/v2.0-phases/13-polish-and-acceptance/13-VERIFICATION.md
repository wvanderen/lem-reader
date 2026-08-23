---
phase: 13-polish-and-acceptance
verified: 2026-08-23T00:00:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0 # every code-level behavior-dependent truth has behavioral test evidence (verifier's own runs this cycle: 21/21 G8+G7+G6 toolbar cells across 3 engines — including the NEW selection-gated spec 6/6 — plus the unit leg 1262/0/13 reproduced; the honest full-suite gate on cb1527d: exit 0, still valid — git-proven zero src/ changes since)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/8
  gaps_closed:
    - "G8: ACPT-05 Flow C (v1.1 re-run, UAT test 5) — with NVDA Native Selection Mode OFF (the default on every NVDA since 2024.1), browse-mode Shift+arrows selects only within NVDA's virtual buffer; the Firefox document selection never changes, so the toolbar never mounts and the 'Highlight actions available.' cue never fires (protocol-PREMISE defect — a platform boundary, not a code regression) — closed by 13-13 per decision G8-D1: ACCEPTANCE-PROTOCOL v1.2 (C1 NVDA+shift+f10 precondition, false 'Firefox-native selection' parenthetical removed, F7 caret-browsing fallback, four-part platform-boundary note) + the selection-gated mount/announce boundary spec (the C1 cue's FIRST automated substrate), ZERO production source changes (e38fb43, ba73a7b)"
  gaps_remaining: [] # no code gaps; the ACPT-05 tester re-run (now on protocol v1.2) is a human_verification item by design (D13-06/D13-07), not a code gap
  human_run_outcome: "ACPT-05 Flow C re-run on protocol v1.2 PASSED (2026-08-23, 13-UAT.md Test 7): Native Selection Mode enabled at C1, 'Highlight actions available.' cue heard, C2/C3 completed, zero blocker/major — SC#3/ACPT-05 flipped to complete per D13-06/D13-07"
  regressions: [] # verifier's own runs this cycle: the combined toolbar net 21/21 green (toolbar-mount-selection-gated 6 + toolbar-keydownless-focus 6 + toolbar-tab-path 9, chromium/firefox/webkit, 20.4s); unit leg 1262 passed / 0 failed / 13 skipped (14.4s); git diff cb1527d..8b666a4 shows ZERO src/ + zero package.json/lockfile changes (0 diff lines) — the recorded full-suite gate on cb1527d (exit 0) therefore remains valid for the production tree
human_verification:
  - test: "ACPT-05 re-run (D13-06 fix-then-re-run), now on ACCEPTANCE-PROTOCOL v1.2: on NVDA+Firefox/Windows, re-execute Flow C (C1–C4). v1.2 prerequisite (load-bearing): at C1, enable Native Selection Mode FIRST — NVDA+shift+f10, NVDA >= 2024.1 (per-document; NVDA announces the mode change) — BEFORE the browse-mode Shift+arrows selection, or use the documented F7 Firefox caret-browsing fallback on older NVDA (caret selection IS the document selection). Then C2 (NVDA+Space to focus mode, then Tab) and C3 (Enter) proceed as documented in v1.1 (unchanged). Keep the C1 selection within a single block — a cross-block selection mounts the silent hint variant (no buttons, no announce)"
    expected: "Flow C completes: with native selection ON, the C1 Shift+arrows selection is visible on screen (page-reflected), the toolbar mounts, and the polite 'Highlight actions available.' cue fires — residual to confirm: NVDA VERBALIZES that mount announce in browse mode with native selection ON (page-side firing is now pinned by the selection-gated spec; only the verbalization needs the human). NVDA+Space then Tab lands focus on the toolbar (role=toolbar, name 'Highlight actions'), Enter creates mark.highlight[data-highlight-id] with the 'Highlight saved.' confirmation. Record outcomes in Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only then (D13-07). Known pinned boundaries (documented, recoverable, not findings): a browse-mode Tab WITHOUT NVDA+Space lands on Previous page and unmounts the toolbar; with native selection OFF, no toolbar can mount at all (platform boundary). Any NEW blocker/major follows fix-then-re-run; minors are recorded and deferred"
    why_human: "Requires a real screen reader (NVDA) + Firefox on Windows hardware with a human tester; no automated harness can exercise SR announcement verbalization, NVDA's browse/focus-mode key consumption, or the Native Selection Mode toggle. The automation-level equivalence is proven on BOTH sides of BOTH boundaries — real-Tab routing (toolbar-tab-path 9/9), keydown-less browse-mode collapse + focus-mode recovery (toolbar-keydownless-focus 6/6), and selection-gated mount + cue vs structural silence (toolbar-mount-selection-gated 6/6), all three engines, verifier's own runs this cycle — only the human SR run remains"
  - test: "Optionally run the VoiceOver+Safari supplementary checklist (Appendix §3: library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings) — worth including the toolbar announce-on-appear surface in the walkthrough"
    expected: "Findings recorded in Appendix §3.2 with the same severity rubric; NOT an ACPT-05 gate (D13-05) — supplementary evidence on the user's own schedule."
    why_human: "Requires VoiceOver + Safari on macOS with a human tester; explicitly supplementary."
---

# Phase 13: Polish and Acceptance — Verification Report

**Phase Goal:** The v2.0 quality gate — eliminate the two known polish regressions, land the user-widened chrome polish (D13-12), and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Verified:** 2026-08-23T00:00:00Z
**Status:** passed — the tester's NVDA+Firefox re-run of Flow C on protocol v1.2 completed with zero blocker/major (13-UAT.md Test 7, 2026-08-23): the G8 protocol correction (NVDA+shift+f10 precondition) made the flow executable as written, closing the G6→G7→G8 fix-then-re-run loop and ACPT-05 (v1.0 coverage boundary A4 closed); 8/8 success criteria verified
**Re-verification:** Yes — sixth cycle. Lineage: gaps_found (G1–G5, 2026-08-19T16:25Z) → human_needed (G1–G5 closed, 2026-08-19T23:10Z) → human_needed (G6 closed, 2026-08-22T01:13Z) → human_needed (G7 closed, 2026-08-22T18:52Z) → human_needed (G8 closed) → passed (tester v1.2 re-run pass, 2026-08-23).

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC#1 (POLISH-01): persisted reading mode/theme/typography paint first — no flash or snap (cold-load no-snap test passes) | ✓ VERIFIED (regression) | Artifacts intact (`src/settings/settingsMirror.ts`, `index.html` inline script, SettingsContext lazy-init); git diff cb1527d..8b666a4 shows ZERO src/ changes this cycle (0 diff lines); cold-load-no-snap green in the recorded full-suite gate on cb1527d (exit 0) |
| 2 | SC#2 (POLISH-02): progress bar reflects actual position — 1-page ≠ 100% on open, multi-page progresses from start | ✓ VERIFIED (regression) | `src/pagination/progress.ts` untouched (zero-src-diff proof above); first-paint-progress green in the recorded gate |
| 3 | SC#3 (ACPT-05): documented SR acceptance flows complete on NVDA+Firefox with zero blocker/major, closing v1.0 A4 boundary | ✓ VERIFIED (human run) | Tester re-run on protocol v1.2 PASSED (13-UAT.md Test 7, 2026-08-23): Flow C end-to-end under NVDA+Firefox — Native Selection Mode at C1, mount cue heard, C2/C3 complete, zero blocker/major. Three fix-then-re-run rounds converged: G6 (13-11), G7 (13-12), G8 (13-13). REQUIREMENTS.md ACPT-05 flipped complete |
| 4 | SC#4 (ACPT-06): v2.0 core flow (ingest→read→highlight→export→re-import) across Chromium/Firefox/WebKit without content loss, AND full `npm run test` exits 0 | ✓ VERIFIED | Honest full-suite gate on cb1527d in one invocation (plan 13-06, re-run at the G7 cycle): **exit 0 — unit 1262/0/13 + e2e 1113/0/10 (10.6m)** across chromium/firefox/webkit + the throttled perf profile. Validity since 13-13: git-proven ZERO production changes (0 src/ diff lines cb1527d..8b666a4), so the recorded result still describes the production tree; the only delta is +6 test cells, covered by the orchestrator's annotations-directory run (180 passed = 174 prior + 6 new, 3 engines) and corroborated by the verifier's own 21/21 toolbar net + unit leg 1262/0/13 this cycle |
| 5 | SC#5 (POLISH-03, amended 2026-08-19): slim article header; tag affordance from top-bar icon popover; compact provenance spot; no internal header scrolling at 360×640 | ✓ VERIFIED (regression) | Zero committed chrome/header changes this cycle (git diff proof above); tag-popover + header-geometry green in the recorded gate |
| 6 | SC#6 (POLISH-04): four centered modal dialogs open centered, not top-left | ✓ VERIFIED (regression) | No committed CSS/dialog changes this cycle; green in the recorded gate |
| 7 | SC#7 (POLISH-05): keyboard-reachable "Back to library" on article + review views; never exits app on deep link | ✓ VERIFIED (regression) | `src/reader/BackToLibrary.tsx` intact; green in the recorded gate |
| 8 | SC#8 (POLISH-06): organized library home — continue reading / add content / library list within existing components | ✓ VERIFIED (regression) | LibraryView + `.library-section-add` measure rule untouched this cycle; library-tidy green in the recorded gate |

**Score:** 8/8 truths verified (SC#3/ACPT-05 closed by the tester's passing v1.2 re-run)

## Gap Closure Verification (re-verification focus — G8, plan 13-13)

Full verification (exists / substantive / wired) plus the verifier's own behavioral runs for each 13-13 must-have truth:

| # | 13-13 Truth | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Protocol v1.2 Flow C C1 instructs NVDA (Firefox) users to enable Native Selection Mode (NVDA+shift+f10, NVDA >= 2024.1) BEFORE browse-mode Shift+arrows, and the parenthetical claiming the browse-mode selection is Firefox-native is gone from the document | ✓ VERIFIED | Verifier inspected the protocol directly: callout L192–199 appends the G8 precondition ("MUST enable Native Selection Mode (**NVDA+shift+f10**) BEFORE the C1 Shift+arrows selection or the toolbar cannot mount… see the note below… gap G8") with the G7 focus-mode sentences preserved byte-unchanged; C1 row L203 now reads "NVDA (Firefox): enable Native Selection Mode first (**NVDA+shift+f10**, NVDA >= 2024.1 — required, see the note below), then browse-mode **Shift+arrows**" with the sighted/VoiceOver gestures and "across several words" unchanged; `rg -c "NVDA\+shift\+f10"` = **3** (callout + C1 + note); `rg "Firefox-native selection"` = **0 matches** (the false premise is gone from the document entirely); C1 expected-outcome appends the page-visible clause. Version header **1.2** at L32 |
| 2 | Protocol documents the older-NVDA fallback (F7 caret browsing + focus-mode Shift+arrows) and the platform boundary: with Native Selection Mode OFF, browse-mode selections exist only in NVDA's virtual buffer — the page's document selection never changes, so no page-side code can observe them | ✓ VERIFIED | The new four-part note (L215–235) with its own bold title "**NVDA Native Selection Mode (required at C1):**" — WHY (default-on-every-NVDA-since-2024.1 per-document toggle; 2026.3 persistent setting also disabled by default; buffer-only selection not visible on screen; "NO page-side code can observe a buffer-only selection… platform boundary, not a product defect", citing NVDA User Guide §Native Selection Mode + the G8 debug doc), WHAT TO DO (NVDA+shift+f10 per-document, NVDA announces the mode change; 2026.3 persistence path), FALLBACK (**F7** Firefox caret browsing — "the caret selection IS the document selection (page-visible), then continue at C2 as written"), RE-RUN READING AID (the C1 mount cue confirms the document selection followed; single-block rule — cross-block mounts the silent hint variant). C2/C3 rows and every other flow byte-unchanged from v1.1 (verified by reading; ba73a7b is a single-file commit) |
| 3 | The e2e suite pins BOTH sides of the G8 boundary at the page-observable layer: a page-visible document selection mounts the toolbar AND fires the "Highlight actions available." announce (the C1 cue — previously asserted by zero automation), while a page with NO visible selection stays structurally silent (no toolbar, no cue) across a keydown-less focus move and a settle window, on chromium/firefox/webkit | ✓ VERIFIED | `toolbar-mount-selection-gated.spec.ts` (203 lines, min 120): Test 1 (L81–124) — real fixture (FIXTURES[0] essay-long-form), `selectRangeInBlock(page, blockIdx, 0, 18)`, toolbar role+name visible, the cue asserted in the toolbar-INTERNAL `[role='status']` region (locator `getByRole("toolbar").locator("[role='status']")` — matching SelectionToolbar.tsx L222–224's visually-hidden polite `<p>`; NOT the CRUD `announcementRegion`), plus region separation (CRUD region does NOT contain the cue). Test 2 (L126–202) — no selection ever created, start-collapsed asserted, keydown counter installed in ONE capture-phase evaluate, bare `el.focus()` on `button.page-turn-previous` in a SECOND evaluate with ZERO `page.keyboard` calls in the test, 300ms settle, ONE atomic evaluate {keydowns, isCollapsed, toolbarCount} all asserted identically per engine (no engine-keyed split), plus cue-text count 0 in the DOM. Production symbols confirmed: `.selection-toolbar` root class (SelectionToolbar.tsx L209), announce set at L153 on the buttons-variant transition. **Behavioral: verifier's own run — both tests green in chromium, firefox, AND webkit (6/6)** |
| 4 | ZERO production source changes ship (the page-side mount path is exonerated by the G8 diagnosis); ACPT-05 remains pending the human NVDA re-run of Flow C on protocol v1.2 per D13-06/D13-07 | ✓ VERIFIED | `git diff --name-only cb1527d..8b666a4`: ONLY planning docs (ROADMAP/STATE/debug/UAT/PLAN/SUMMARY/VERIFICATION) + docs/ACCEPTANCE-PROTOCOL.md + the one new spec file — **zero src/, zero package.json/lockfile** (0 diff lines — G8-D1 + T-13-13-SC); e38fb43 = exactly 1 file (the spec), ba73a7b = exactly 1 file (the protocol), 8b666a4 = planning metadata only. REQUIREMENTS.md ACPT-05 honestly `- [ ]` Pending; 13-13-SUMMARY correctly declared `requirements-completed: []` |

### G8 "missing" items ledger (from 13-UAT.md § G8)

| UAT missing item | Disposition |
|------------------|-------------|
| Protocol v1.2: C1 must instruct NVDA users to enable Native Selection Mode (NVDA+shift+f10, NVDA >= 2024.1) BEFORE browse-mode Shift+arrows; correct the false "(Firefox-native selection)" parenthetical | ✓ Landed — ba73a7b; verifier's direct reads + greps (×3 occurrences; 0 false-parenthetical matches) |
| Protocol v1.2: document the fallback for older NVDA (F7 caret browsing + focus-mode selection) and the platform boundary (native selection OFF = no page-side fix can observe browse-mode selections) | ✓ Landed — the four-part note (WHY/WHAT TO DO/FALLBACK/RE-RUN READING AID), F7 present, boundary stated verbatim with authoritative sources |
| Re-run ACPT-05 Flow C on protocol v1.2 (D13-06); residual to confirm: NVDA verbalizes the mount announce in browse mode with native selection ON | ✓ Prerequisites recorded in the 13-13-SUMMARY re-run section AND this report's human_verification item; the run itself is the tester's — the sole remaining human item, not a code gap |

**G8 verdict: CLOSED at the documentation + automation level.** Note for verify-work: 13-UAT.md § G8 still reads `status: diagnosed` — this verification confirms it can be updated to `resolved` (this verifier does not modify the UAT file; same lag G7 had last cycle).

### Prohibition Spot-Checks (13-13)

| Prohibition | Result |
|-------------|--------|
| Zero package installs | ✓ VERIFIED — no package.json/package-lock.json anywhere in cb1527d..8b666a4 |
| Diffs confined to plan files_modified | ✓ VERIFIED — e38fb43: 1 spec file; ba73a7b: protocol only; 8b666a4: planning docs only |
| Zero production source changes (G8-D1 — FINAL for this gap) | ✓ VERIFIED — 0 src/ diff lines in the whole cycle range; no mount-path or announce code touched anywhere |
| No re-run results claimed in the protocol doc or SUMMARY | ✓ VERIFIED — the v1.2 edits are instruction/precondition/fallback text only, no findings or verdicts; the SUMMARY states ACPT-05 stays Pending (D13-06/D13-07) with `requirements-completed: []` |
| Boundary spec not weakened to force green (pinning, not TDD) | ✓ VERIFIED — both tests assert the diagnosed facts and were green on the current build immediately (verifier's own 6/6), confirming rather than contradicting the G8 diagnosis; no engine-keyed escape hatches (Test 2 asserts identically on every engine) |

### Required Artifacts (13-13)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/ACCEPTANCE-PROTOCOL.md` | v1.2; Flow C native-selection-mode precondition + fallback + boundary; contains "NVDA+shift+f10" | ✓ VERIFIED | gsd-tools artifacts check: passed (exists, no issues); Version 1.2 at L32; NVDA+shift+f10 ×3; F7 ×1; G8 debug-doc ref ×2; false parenthetical 0 matches |
| `tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts` | Selection-gated mount/announce boundary pin — both sides of the G8 platform boundary | ✓ VERIFIED | gsd-tools artifacts check: passed; 203 lines (min 120); substantive two-test spec reusing _fixtures.ts wholesale; green 6/6 in verifier's own run (3 engines) |

### Key Link Verification (13-13)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| toolbar-mount-selection-gated.spec.ts | `tests/e2e/annotations/_fixtures.ts` | selectRangeInBlock & co. — no forked harness | ✓ WIRED | gsd-tools: pattern found; imports verified (FIXTURES, wipeDatabase, openArticle, selectRangeInBlock, findFirstBlockWithText, announcementRegion) |
| toolbar-mount-selection-gated.spec.ts | `src/reader/annotations/SelectionToolbar.tsx` | "Highlight actions available" — toolbar-INTERNAL role=status region | ✓ WIRED | gsd-tools: pattern found; the spec's cue locator matches the production live region (L222–224) exactly; behavioral runs green × 3 engines |
| docs/ACCEPTANCE-PROTOCOL.md | `.planning/debug/g8-toolbar-never-mounts-nvda.md` | Flow C native-selection note cites the G8 diagnosis | ✓ WIRED | gsd-tools: pattern found ×2 (callout + note); the 88-line debug doc exists (committed this cycle) |
| docs/ACCEPTANCE-PROTOCOL.md | NVDA User Guide (§Native Selection Mode) | C1 gesture + note encode the toggle gesture and version history (2024.1 per-document toggle; 2026.3 persistent setting, also off by default) | ✓ WIRED (manual) | gsd-tools reported "pattern not found" — a regex-escaping false-negative (the `\+` escapes in the JSON pattern were searched literally); manual `rg "NVDA\+shift\+f10"` = 3 occurrences, and the version-history content is present verbatim (L216–217 "since 2024.1 (the per-document toggle; NVDA 2026.3 adds a persistent Browse Mode setting, also disabled by default)"; L225–227 the gesture + persistence path) |

### Data-Flow Trace (Level 4)

Not applicable at the product level (zero production changes — G8-D1). Spec-level: the boundary spec consumes the real fixture corpus (essay-long-form via FIXTURES[0]), drives the real PaginatedSurface/ArticleView/SelectionToolbar DOM, and asserts live document state (window.getSelection, activeElement-independent toolbar count, cue text in the rendered live region, CRUD-region separation) — no mocked or hardcoded data paths.

### Behavioral Spot-Checks (verifier's own runs, 2026-08-22)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| G8 selection-gated boundary (selection ⇒ mount + cue with region separation; no selection ⇒ structural silence) — the 13-13 core truth | `npx playwright test tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts` (included in the combined run below) | **6/6 green** — chromium/firefox/webkit | ✓ PASS |
| G7 regression (keydown-less boundary + focus-mode recovery) | `npx playwright test tests/e2e/annotations/toolbar-keydownless-focus.spec.ts` (included in the combined run) | **6/6 green** — 3 engines | ✓ PASS |
| G6 regression (Tab reach + Enter + containment release, both modes) | `npx playwright test tests/e2e/annotations/toolbar-tab-path.spec.ts` (included in the combined run) | **9/9 green** — 3 engines | ✓ PASS |
| Combined G8+G7+G6 spec gate | `npx playwright test tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts tests/e2e/annotations/toolbar-keydownless-focus.spec.ts tests/e2e/annotations/toolbar-tab-path.spec.ts` | **21 passed (20.4s)** — zero failures | ✓ PASS |
| Unit leg of the honest suite | `npm run test:unit -- --run` | **1262 passed / 0 failed / 13 skipped (14.4s)** — matches the recorded gate's unit line exactly | ✓ PASS |
| Annotations directory (orchestrator's post-13-13 run) | `npx playwright test tests/e2e/annotations/` | **180 passed** (174 prior + 6 new cells, 3 engines, 0 failed) per the orchestrator's record; the verifier sampled the 21 highest-signal cells of it (above) rather than re-running the directory | ✓ CORROBORATED |
| Honest full-suite gate | (recorded by the orchestrator on cb1527d) | exit 0 — unit 1262/0/13 + e2e 1113/0/10 (10.6m, 3 engines + throttled perf); still valid for the production tree because git proves 0 src/ diff lines since cb1527d; not re-run (at most once per verification — the post-13-13 full 3-engine e2e matrix exceeded the orchestrator's 5-minute gate budget, non-blocking per gate spec) | ✓ RECORDED (unit leg + 21 toolbar cells independently corroborated this cycle) |
| Zero-product-change proof | `git diff --name-only cb1527d..8b666a4` + `git diff cb1527d..8b666a4 -- src/ package.json package-lock.json \| wc -l` | planning docs + protocol + 1 spec file only; **0** src/lockfile diff lines | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional. The phase gate remains the honest full-suite record on cb1527d (exit 0), corroborated by the verifier's own 21 toolbar cells + unit-leg reproduction this cycle.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 13-01, 13-09 | First-paint settings, no flash/snap (+ mode-surface aspect) | ✓ SATISFIED | Truth 1; green in recorded gate |
| POLISH-02 | 13-02, 13-09 | Position-accurate progress bar | ✓ SATISFIED | Truth 2; green in recorded gate |
| POLISH-03 | 13-04, 13-10 | Slim header + top-bar tag popover + compact provenance spot (amended) | ✓ SATISFIED | Truth 5; green in recorded gate |
| POLISH-04 | 13-03 | Centered modal dialogs | ✓ SATISFIED | Truth 6; green in recorded gate |
| POLISH-05 | 13-04 | Back-to-library affordance | ✓ SATISFIED | Truth 7; green in recorded gate |
| POLISH-06 | 13-03, 13-07 | Organized library home incl. shared measure | ✓ SATISFIED | Truth 8; green in recorded gate |
| ACPT-05 | 13-05, 13-11, 13-12, 13-13 | NVDA+Firefox SR acceptance flows | ⏳ NEEDS HUMAN (re-run on v1.2) | Instrument v1.2 ready + boundary automation green on both sides of both NVDA boundaries; flips only on the tester's recorded run (D13-06/D13-07); REQUIREMENTS.md honestly `- [ ]` Pending — this is the locked contract, not a silent failure |
| ACPT-06 | 13-06 | Core flow across browser matrix, no content loss | ✓ SATISFIED | Truth 4 — full-suite exit 0 (incl. spine × 3 engines); zero src/ changes since keep it valid |

No orphaned requirements: all 8 phase-mapped IDs appear in plan frontmatter; REQUIREMENTS.md maps no additional IDs to Phase 13. (13-08 additionally declares ING-03 — a Phase 7–9 ingestion requirement completed by its own summary; a cross-phase declaration, not a Phase 13 orphan.) 13-13 correctly declared `requirements-completed: []` (ACPT-05 not flipped by the protocol/spec work — the flip is the tester's, per D13-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER across both 13-13-modified files; no empty implementations; Test 2's 300ms settle is the documented rAF-throttled selectionchange wait with asserted-state follow-ups, not a timing substitute | — | — |

### Human Verification Required

### 1. ACPT-05 re-run — Flow C on the v1.2 protocol (the phase's remaining gate)

**Test:** On NVDA+Firefox/Windows hardware, re-execute `docs/ACCEPTANCE-PROTOCOL.md` **v1.2** Flow C (C1–C4) per the D13-06 fix-then-re-run policy. The v1.2 prerequisite is load-bearing: at C1, enable **Native Selection Mode (NVDA+shift+f10**, NVDA >= 2024.1 — NVDA announces the mode change**)** BEFORE the browse-mode Shift+arrows selection — or, on older NVDA, press **F7** for Firefox caret browsing and select with Shift+arrows from focus mode (the caret selection IS the document selection). Then C2 (**NVDA+Space to focus mode FIRST**, then Tab) and C3 (Enter) proceed as documented in v1.1 (unchanged). Keep the C1 selection within a single block (a cross-block selection mounts the silent hint variant — no buttons, no announce).
**Expected:** With native selection ON, the C1 selection is visible on screen, the toolbar mounts, and the **"Highlight actions available."** cue fires — residual to confirm: NVDA verbalizes that announce in browse mode with native selection ON. NVDA+Space then Tab lands focus on the toolbar (role=toolbar, name "Highlight actions"); Enter creates the highlight with the polite "Highlight saved." confirmation. Fill Appendix §1.3 findings + §1.4 checklist + the run verdict — ACPT-05 flips from Pending only when the recorded run shows zero blocker/major (D13-07). A NEW blocker/major → fix-then-re-run again; minors recorded and deferred. Known pinned boundaries (documented, recoverable, not findings): browse-mode Tab without NVDA+Space lands on Previous page and unmounts the toolbar; with native selection OFF no toolbar can mount at all.
**Why human:** Requires real NVDA+Firefox on Windows with a human tester; no automated harness can exercise screen-reader verbalization, NVDA's browse/focus-mode key consumption, or the Native Selection Mode toggle. Automation-level equivalence is proven on both sides of both boundaries — real-Tab routing (toolbar-tab-path 9/9), keydown-less collapse + focus-mode recovery (toolbar-keydownless-focus 6/6), and selection-gated mount + cue vs structural silence (toolbar-mount-selection-gated 6/6), all three engines, verifier's own runs this cycle.

### 2. VoiceOver+Safari supplementary checklist (NOT an ACPT-05 gate)

**Test:** When convenient on macOS, run the Appendix §3 checklist over the five v2.0 surface groups — include the toolbar announce-on-appear surface ("Highlight actions available.") in the walkthrough.
**Expected:** Findings recorded in Appendix §3.2 with the §5 severity rubric; supplementary evidence only (D13-05).
**Why human:** Requires VoiceOver + Safari on macOS with a human tester; explicitly non-gating.

### Gaps Summary

**No code gaps remain.** G8 — the third and final diagnosed ACPT-05 Flow C gap — is closed exactly as its missing-item list sanctioned (decision G8-D1): the protocol now instructs the correct gesture (v1.2: NVDA+shift+f10 native-selection precondition at C1, F7 fallback, platform-boundary note with authoritative sources), the false "Firefox-native selection" premise is gone from the document entirely, and the C1 mount cue — previously asserted by zero automation — now has a both-sides boundary pin that was green on the current build immediately (6/6 in the verifier's own runs, three engines; structural silence under native-selection-OFF is pinned as correct page behavior, not a bug). Zero production source changes (git-proven: 0 src/ diff lines across the cycle), no package installs, no regressions (21/21 G8+G7+G6 toolbar cells + unit leg 1262/0/13 reproduced this cycle; the recorded full-suite gate on cb1527d remains valid for the unchanged production tree). The single open item is the designed-in ACPT-05 tester re-run, now on the v1.2 protocol (D13-06/D13-07): the phase stays `human_needed` until that run lands zero blocker/major in the Appendix record sheets.

### Notes & Process Observations (non-blocking)

1. **UAT ledger lag (carried):** 13-UAT.md § G8 still reads `status: diagnosed`; this verification confirms closure and the status can be updated to `resolved` (left to verify-work, which owns that file). § G7 was updated to resolved this cycle — the same one-cycle lag.
2. **gsd-tools key-links false-negative:** the 4th 13-13 key link (protocol → NVDA User Guide) reported "pattern not found" because the `\+` escapes in the pattern were searched literally; manual `rg` finds NVDA+shift+f10 ×3 and the full version-history content. No action needed beyond this note.
3. **The fix-then-re-run loop is converging, not thrashing:** the v1.1 re-run the last cycle awaited was executed (UAT test 5) and produced exactly one new major (G8) — diagnosed to a protocol-premise platform boundary (not a code regression), fixed at the documentation layer with zero product churn, exactly the G7 pattern. Each round has narrowed the human-run surface: G6 (product fix) → G7 (protocol) → G8 (protocol premise). The v1.2 protocol is the first version whose C1 gesture is true on default-adjacent NVDA hardware.
4. **Full-suite evidence lineage (explicit):** the one-invocation `npm run test` exit 0 gate was run by 13-06 and re-run on cb1527d (G7 cycle). Post-13-13, the full 3-engine e2e matrix exceeded the orchestrator's 5-minute gate budget (non-blocking per gate spec); the phase-level honest gate remains the cb1527d record, valid because git proves zero production changes since (0 src/ diff lines). The post-13-13 delta is +6 test cells only — covered by the orchestrator's annotations-directory run (180 passed) and the verifier's own 21-cell sample + unit leg.
5. **Uncommitted work in the tree (carried from the last two cycles — heads-up for the orchestrator):** `src/app.css` (+105 lines additive 100dvh fallbacks), `tests/e2e/chrome/paginated-quiet-header.spec.ts` (modified), untracked `tests/e2e/chrome/mobile-first-page-chrome.spec.ts`, `tests/unit/paginated-mobile-viewport.test.ts`, `PRODUCT.md`, `.planning/debug/mobile-*.md` docs, and the unstaged deletion of `.planning/todos/pending/2026-08-21-fix-prod-ui-paste-ingest-flow.md` — a separate mobile-first-page-chrome workstream, NOT part of Phase 13's committed scope (verified: no phase-13 commit touches them). The verifier's runs this cycle executed against the worktree (same condition as the recorded gate); still exit-green. The work should be committed or stashed deliberately, not left drifting.
6. **Boundary honesty for future planning (carried + extended):** under G7-D1 and G8-D1, browse-mode Tab reachability and buffer-only browse-mode selections are BOTH outside the page's contract BY DESIGN — any future focus-on-appear or selection-sniffing proposal must encounter the recorded six-point (G7) and by-construction (G8) rejections in the 13-12/13-13 plans/SUMMARYs before re-opening either.

---

# Appendix — ACPT-05 Acceptance Record (instrument, preserved verbatim from Plan 13-05)

> The verification report above is the authoritative phase verification. Everything from this line down is the
> Plan 13-05 Task 1 instrument (commit `2f5a139`), preserved byte-intentionally with its original section
> numbering (§1/§2/§3 — referenced externally, e.g. by 13-05-SUMMARY). Fill §1.3/§1.4 and the verdict when
> the NVDA+Firefox run happens; ACPT-05 flips only then (D13-07). **Run against ACCEPTANCE-PROTOCOL.md as
> currently versioned (v1.2): apply the Flow C native-selection prerequisite (NVDA+shift+f10 before the C1
> Shift+arrows, or the F7 fallback) and the v1.1 focus-mode sequence at C2.**

**Phase:** 13 — Polish and Acceptance
**Instrument:** `docs/ACCEPTANCE-PROTOCOL.md` v1.0 (unmodified — D13-04)
**Prepared:** 2026-08-19 (Plan 13-05 Task 1)
**Ledger status:** Pending user run (see §2 — the flip condition)

---

## 1. ACPT-05 — NVDA+Firefox acceptance run

> **Requirement:** ACPT-05 — Reader can complete the documented screen-reader
> acceptance flows on NVDA+Firefox, closing the v1.0 ACPT-02 reduced-gate
> coverage boundary (A4).

### 1.1 Environment prerequisites

| Item | Requirement |
|------|-------------|
| Screen reader | **NVDA** — current stable release |
| Browser | **Firefox** — current stable release |
| Hardware/OS | **Windows** (native hardware or a setup the tester considers representative of their reading environment) |
| App | Lem Reader dev server: `npm run dev` → http://localhost:5173 |
| Clean state | Follow the protocol's Setup (§3): wipe local data before the run (settings → "Clear local data", or clear the `lem-reader` IndexedDB), then reload |

Record the actual environment when the run happens:

| Field | Value |
|-------|-------|
| Run date(s) | _____________ |
| Tester | _____________ |
| NVDA version | _____________ |
| Firefox version | _____________ |
| Windows version | _____________ |

### 1.2 Run instructions — the protocol AS-DOCUMENTED (D13-04)

Run `docs/ACCEPTANCE-PROTOCOL.md` **v1.0 exactly as documented** — no v2.0
addendum (a v2.0-surface extension is a recorded deferred idea, not part of
this run):

1. Execute the **six v1.0 scripted flows (§3)** in order, A through F:
   Flow A — Open article and read end-to-end · Flow B — Switch reading mode
   (M) · Flow C — Create a highlight · Flow D — View, edit, and delete a
   highlight + note (drawer) · Flow E — Navigate from a saved annotation back
   to its passage · Flow F — Adjust settings.
2. Execute the **five exploratory charters (§4)** in order, 1 through 5:
   Charter 1 — Full reading + annotation loop, SR-only · Charter 2 — Every
   fixture, end-to-end, both modes · Charter 3 — Fallback orientation ·
   Charter 4 — Edge conditions under SR · Charter 5 — Discoverability without
   prior knowledge.
3. Record each step's outcome using the protocol's **Pitfall 7 discipline
   (§2)**: verify and record **role + accessible name + state** — the
   programmatically stable properties — and **never verbatim screen-reader
   phrasing**. Phrasing observations (what the synthesizer happened to say)
   are informational only: record them as **minor** findings in the findings
   table, never as pass/fail criteria.
4. Classify every finding with the **severity rubric (§5, D6-07)**: blocker /
   major / minor. **Pass = zero blocker AND zero major.** An announcement that
   is confusing but where the step still completes correctly is **minor**
   unless content or a required function is lost or unreachable (then major
   or blocker).

### 1.3 Findings record sheet (empty — fill as the run proceeds)

Same shape as the Phase 6 ledger. One row per finding; append rows as needed.

| Finding id | Flow / charter | Severity (blocker\|major\|minor) | Observed outcome (role + accessible name + state) | Expected outcome (role + accessible name + state) | Status (open\|fixed\|deferred) |
|------------|----------------|----------------------------------|---------------------------------------------------|---------------------------------------------------|--------------------------------|
| — | — | — | — | — | — |

_(no findings recorded yet — the run has not happened)_

### 1.4 Per-flow / per-charter pass checklist (six flows + five charters)

Record PASS or the highest finding severity observed in that flow/charter
(§5 rubric), plus a note if useful.

| # | Flow / charter | Result (☐ PASS / severity) | Notes |
|---|----------------|----------------------------|-------|
| A | Open article and read end-to-end | ☐ | |
| B | Switch reading mode (M) | ☐ | |
| C | Create a highlight | ☐ | |
| D | View, edit, delete a highlight + note (drawer) | ☐ | |
| E | Navigate from a saved annotation back to its passage | ☐ | |
| F | Adjust settings (typography / theme / measure) | ☐ | |
| 1 | Charter — Full reading + annotation loop, SR-only | ☐ | |
| 2 | Charter — Every fixture, end-to-end, both modes | ☐ | |
| 3 | Charter — Fallback orientation | ☐ | |
| 4 | Charter — Edge conditions under SR | ☐ | |
| 5 | Charter — Discoverability without prior knowledge | ☐ | |

**Run verdict (fill at completion):** _____________
_(PASS = zero blocker and zero major across all eleven rows)_

---

## 2. D13-07 status note — when ACPT-05 flips

**ACPT-05 remains Pending.** This plan (13-05) ships the instrument only —
the runbook and empty record sheets above. Per D13-07
(instrument-ships-now / requirement-closes-at-proof, the 04-02 and 06-04
precedent):

- ACPT-05 flips from Pending to complete **only when the user-run results
  land in this file** (§1.3 findings + §1.4 checklist + verdict filled in)
  with **zero blocker and zero major findings** (D6-07 pass policy).
- **Blocker/major findings do not fail the requirement outright** — they
  follow the **fix-then-re-run policy (D13-06, the 06-06 precedent)**: the
  finding is fixed in-phase, and the affected flow(s) are re-run until zero
  blocker/major remains. The flip happens at that point.
- **Minor findings are recorded and deferred** — they never block the flip.
- Until then, the `ACPT-05` checkbox in `.planning/REQUIREMENTS.md` stays
  **unchecked**.

---

## 3. Supplementary — VoiceOver+Safari re-run (v2.0 surfaces)

> **This is supplementary evidence, explicitly NOT an ACPT-05 gate (D13-05).**
> It honors the protocol's own re-run rule (§7: re-run on any material change
> to the reader surface — Phases 7–12 added five phases' worth of new
> surfaces) without extending the v1.0 protocol document itself. It runs on
> the user's macOS hardware when ready, on the user's own schedule, and its
> findings follow the same severity rubric (§5) and fix-then-re-run policy
> (D13-06). A blocker/major here is recorded and fixed like any other
> finding, but it does not gate ACPT-05.

### 3.1 Scope — the NEW v2.0 surfaces only

The v1.0 flows (§3 of the protocol) were already executed under
VoiceOver+Safari in Phase 6 (see the 06-VERIFICATION ledger). This re-run
covers only surfaces that did not exist then. Same outcome discipline applies
(Pitfall 7: role + accessible name + state, never verbatim SR phrasing).

| # | v2.0 surface group | What to exercise (goal-oriented) | Result (☐ PASS / severity) | Notes |
|---|--------------------|----------------------------------|----------------------------|-------|
| V1 | **Library browse / search / tag filter** | Browse the saved-articles list; use the library search; filter by tag; open an article from a row; confirm row information (title, source, progress) is announced and reachable | ☐ | |
| V2 | **Ingest form — including calm refusal outcomes** | Add content through the ingest form (e.g. a `.md` file); then trigger at least one calm refusal (e.g. a corrupt or over-cap PDF) and confirm the refusal lands as calm, jargon-free copy in the status region — never an error dump | ☐ | |
| V3 | **Review panel — jump / curate** | Open the review panel; jump from a review row back to its highlighted passage; curate (edit a review note, delete a highlight via its confirm dialog) | ☐ | |
| V4 | **Export / import dialogs** | Build and download an export bundle from settings; import a bundle through the preview dialog (proceed, and one skip/conflict path); confirm dialog focus behavior and announced outcomes | ☐ | |
| V5 | **Book groupings — expand/collapse + chapter navigation** | Expand a book grouping in the library; open its chapter list; open a chapter; navigate between chapter chrome and back to the library | ☐ | |

### 3.2 VO findings record sheet (empty — fill as the run proceeds)

Same shape as §1.3.

| Finding id | Surface group | Severity (blocker\|major\|minor) | Observed outcome (role + accessible name + state) | Expected outcome (role + accessible name + state) | Status (open\|fixed\|deferred) |
|------------|---------------|----------------------------------|---------------------------------------------------|---------------------------------------------------|--------------------------------|
| — | — | — | — | — | — |

_(no findings recorded yet — the run has not happened)_

---

*Phase: 13-polish-and-acceptance*
*Instrument prepared: 2026-08-19 (Plan 13-05 Task 1) — awaiting user runs*

---

_Verified: 2026-08-22T21:21:49Z (re-verification after G8 gap closure — fifth cycle)_
_Verifier: the agent (gsd-verifier)_
