---
phase: 13-polish-and-acceptance
verified: 2026-08-22T18:52:30Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 0 # every code-level behavior-dependent truth has behavioral test evidence (verifier's own runs this cycle: 15/15 G7+G6 toolbar cells across 3 engines + the unit leg 1262/0/13 reproduced; the orchestrator's full-suite gate on cb1527d: exit 0)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/8
  gaps_closed:
    - "G7: ACPT-05 Flow C — NVDA browse mode consumes the Tab keydown itself and moves focus to Previous page, bypassing the 13-11 keydown-only routing (toolbar unmounts via the Gecko selection collapse) — closed by 13-12 per decision G7-D1: ACCEPTANCE-PROTOCOL v1.1 (focus-mode instruction at C2, mount cue at C1, re-anchored C3) + keydown-less boundary/recovery e2e, ZERO production source changes (f09c58d, 59c3470)"
  gaps_remaining: [] # no code gaps; the ACPT-05 tester re-run is a human_verification item by design (D13-06/D13-07), not a code gap
  regressions: [] # verifier's own runs this cycle: toolbar-keydownless-focus + toolbar-tab-path 15/15 green (chromium/firefox/webkit), unit leg 1262 passed / 0 failed / 13 skipped; orchestrator's full-suite gate on cb1527d exit 0 (unit 1262/0/13 + e2e 1113/0/10, 10.6m); git diff 7521cf2..cb1527d confirms ZERO src/ changes this cycle
human_verification:
  - test: "ACPT-05 re-run (D13-06 fix-then-re-run), now on ACCEPTANCE-PROTOCOL v1.1: on NVDA+Firefox/Windows, re-execute Flow C (C1–C4) against the G6+G7-fixed build. The v1.1 protocol documents the load-bearing mode sequence: C1 browse-mode Shift+arrows selection — listen for the 'Highlight actions available.' mount announcement; C2 NVDA+Space to enter focus mode FIRST (the tester hears NVDA's focus-mode toggle confirmation), THEN Tab; C3 Enter on the focused Highlight button. The first run's only blocker/major was Flow C (G6, then G7 on re-test); all other flows A,B,D,E,F + charters passed per 13-UAT.md Test 1"
    expected: "Flow C completes: the C1 mount cue is heard, NVDA+Space then Tab lands focus on the toolbar (role=toolbar, name 'Highlight actions'), Enter creates mark.highlight[data-highlight-id] with the polite 'Highlight saved.' confirmation. Record the run's outcomes in Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only then (D13-07). Known pinned boundary: a browse-mode Tab WITHOUT NVDA+Space still lands on Previous page and unmounts the toolbar — documented + recoverable (re-select, NVDA+Space, Tab), not a finding. Any NEW blocker/major follows fix-then-re-run; minors are recorded and deferred"
    why_human: "Requires a real screen reader (NVDA) + Firefox on Windows hardware with a human tester; no automated harness can exercise SR announcement behavior or NVDA's browse/focus-mode key consumption. The automation-level equivalence is proven on BOTH sides of the boundary — real-Tab routing (toolbar-tab-path, 9/9 green) and keydown-less browse-mode collapse + focus-mode recovery (toolbar-keydownless-focus, 6/6 green) — only the human SR run remains"
  - test: "Optionally run the VoiceOver+Safari supplementary checklist (Appendix §3: library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings) — worth including the toolbar announce-on-appear surface in the walkthrough"
    expected: "Findings recorded in Appendix §3.2 with the same severity rubric; NOT an ACPT-05 gate (D13-05) — supplementary evidence on the user's own schedule."
    why_human: "Requires VoiceOver + Safari on macOS with a human tester; explicitly supplementary."
---

# Phase 13: Polish and Acceptance — Verification Report

**Phase Goal:** The v2.0 quality gate — eliminate the two known polish regressions, land the user-widened chrome polish (D13-12), and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Verified:** 2026-08-22T18:52:30Z
**Status:** human_needed — G7 (the last diagnosed gap) closed with independently reproduced behavioral evidence (verifier's own 15/15 toolbar cells across all three engines); 7/8 success criteria verified; SC#3 (ACPT-05) awaits the tester's NVDA+Firefox re-run of Flow C on the v1.1 protocol (D13-06 fix-then-re-run; the protocol fix and both-sides automation have landed)
**Re-verification:** Yes — fourth cycle. Lineage: gaps_found (G1–G5, 2026-08-19T16:25Z) → human_needed (G1–G5 closed, 2026-08-19T23:10Z) → human_needed (G6 closed, 2026-08-22T01:13Z) → human_needed (G7 closed, this cycle)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC#1 (POLISH-01): persisted reading mode/theme/typography paint first — no flash or snap (cold-load no-snap test passes) | ✓ VERIFIED (regression) | Artifacts intact (`src/settings/settingsMirror.ts`, `index.html` inline script, SettingsContext lazy-init); verifier's git diff 7521cf2..cb1527d shows ZERO src/ changes this cycle; cold-load-no-snap green in the orchestrator's full-suite gate on cb1527d (exit 0) |
| 2 | SC#2 (POLISH-02): progress bar reflects actual position — 1-page ≠ 100% on open, multi-page progresses from start | ✓ VERIFIED (regression) | `src/pagination/progress.ts` untouched (zero-src-diff proof above); first-paint-progress green in the recorded gate |
| 3 | SC#3 (ACPT-05): documented SR acceptance flows complete on NVDA+Firefox with zero blocker/major, closing v1.0 A4 boundary | ⏳ PENDING TESTER RE-RUN — see Human Verification | Two fix-then-re-run rounds have landed: G6 (13-11: focus containment + Tab routing + saved-range activation) and G7 (13-12: protocol v1.1 focus-mode sequence + both-sides boundary automation). The v1.1 Flow C is executable as written by an NVDA+Firefox tester (C2: NVDA+Space BEFORE Tab; C1: "Highlight actions available." mount cue; C3: focus-mode-anchored). Per D13-06/D13-07 the flip requires the tester's re-run results in Appendix §1.3/§1.4 with zero blocker/major. REQUIREMENTS.md honestly shows ACPT-05 `- [ ]` Pending. Automation-level equivalence proven on both sides of the NVDA Tab boundary (verifier's own runs, below) |
| 4 | SC#4 (ACPT-06): v2.0 core flow (ingest→read→highlight→export→re-import) across Chromium/Firefox/WebKit without content loss, AND full `npm run test` exits 0 | ✓ VERIFIED | Orchestrator's honest full-suite gate on cb1527d in one invocation: **exit 0 — unit 1262 passed / 0 failed / 13 skipped + e2e 1113 passed / 0 failed / 10 skipped (10.6m)** across chromium/firefox/webkit + the throttled perf profile. Verifier independently reproduced the unit leg this cycle (1262/0/13 in 12.4s) and the 15 toolbar cells. Count deltas vs the prior gate are accounted for honestly (see Notes) |
| 5 | SC#5 (POLISH-03, amended 2026-08-19): slim article header; tag affordance from top-bar icon popover; compact provenance spot; no internal header scrolling at 360×640 | ✓ VERIFIED (regression) | Zero committed chrome/header changes this cycle (git diff proof above); tag-popover + header-geometry green in the recorded gate |
| 6 | SC#6 (POLISH-04): four centered modal dialogs open centered, not top-left | ✓ VERIFIED (regression) | No committed CSS/dialog changes this cycle; green in the recorded gate |
| 7 | SC#7 (POLISH-05): keyboard-reachable "Back to library" on article + review views; never exits app on deep link | ✓ VERIFIED (regression) | `src/reader/BackToLibrary.tsx` intact; green in the recorded gate |
| 8 | SC#8 (POLISH-06): organized library home — continue reading / add content / library list within existing components | ✓ VERIFIED (regression) | LibraryView + `.library-section-add` measure rule untouched this cycle; library-tidy green in the recorded gate |

**Score:** 7/8 truths verified (1 pending the tester's NVDA re-run on the v1.1 protocol — ACPT-05)

## Gap Closure Verification (re-verification focus — G7, plan 13-12)

Full verification (exists / substantive / wired) plus the verifier's own behavioral runs for each 13-12 must-have truth:

| # | 13-12 Truth | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Protocol v1.1: Flow C2 instructs NVDA focus mode (NVDA+Space) BEFORE Tab; C1 names the "Highlight actions available." mount announcement as the toolbar-appeared cue; C3's NVDA note re-anchored on the focus-mode state | ✓ VERIFIED | Verifier inspected the 59c3470 diff line-by-line: Version 1.0→1.1 (L32); callout reachability precondition (real-Tab-keydown condition + browse-mode consumption + G7 debug-doc reference); C1 appends the mount-cue sentence; C2 = "press NVDA+Space to enter focus mode FIRST, then Tab" + focus-mode toggle confirmation note; C3 = "you are in focus mode from C2, where keys pass through" with the false browse-mode pass-through claim gone; VoiceOver VO+Space intact. `rg -c "NVDA\+Space"` = 2 (C2 + C3). Diff confined to Version header + Flow C (11+/5−); every other flow/section byte-unchanged |
| 2 | The e2e suite pins the NVDA browse-mode boundary: keydown-less chevron focus delivers ZERO keydowns; firefox+webkit collapse the selection + unmount the toolbar; chromium keeps both | ✓ VERIFIED | `toolbar-keydownless-focus.spec.ts` Test 1 (L96–167): capture-phase window keydown counter installed in one evaluate, bare `el.focus()` on `button.page-turn-previous` in a second, ZERO page.keyboard calls between; ONE atomic evaluate returns {keydowns, focusOnChevron, collapsed, toolbarCount}; engine-keyed `ENGINE_BOUNDARY` constant (chromium survives / firefox+webkit collapse+unmount). **Behavioral: verifier's own run — Test 1 green in chromium, firefox, AND webkit (3/3)** |
| 3 | Recovery journey: after a keydown-less collapse, re-select + ONE real Tab (activeElement on the chevron inside the article subtree) routes focus onto the Highlight button; Enter creates mark.highlight[data-highlight-id] + "Highlight saved." announcement | ✓ VERIFIED | Test 2 (L169–248): engine-keyed post-collapse assertion (the honest chromium count-1 refinement), fresh `selectRangeInBlock` with focus staying on the chevron (the real NVDA recovery pre-state — the 13-11 guard's `articleNode.contains` branch), one real Tab, atomic isFocus+connected evaluate, Enter → mark visible + `announcementRegion` contains /Highlight saved/i + toolbar count 0. **Behavioral: verifier's own run — green × 3 engines (3/3), no engine split** |
| 4 | toolbar-tab-path.spec.ts no longer asserts the false NVDA-browse-mode equivalence and cross-references the boundary spec | ✓ VERIFIED | `rg "exact key NVDA browse mode"` → no match (exit 1, claim gone); replaced by the true model at L75–78 (real Tab = keydown-reaches-page: sighted keyboard or NVDA focus mode; browse mode consumes Tab; boundary pinned by the sibling spec) + header G7 entry (L36–38); `rg -c "toolbar-keydownless-focus"` = 2. Zero assertion/helper/test-body edits (12-line diff = comments only) |
| 5 | ZERO production source changes ship (G7-D1); ACPT-05 remains pending the human NVDA re-run | ✓ VERIFIED | `git diff --name-only 7521cf2..cb1527d`: ONLY planning docs (ROADMAP/STATE/debug/PLAN/SUMMARY/UAT) + docs/ACCEPTANCE-PROTOCOL.md + the two spec files — **zero src/, zero package.json/lockfile** (T-13-12-SC); f09c58d = 2 spec files only (249+/12−), 59c3470 = protocol only (11+/5−). REQUIREMENTS.md ACPT-05 honestly `- [ ]` Pending; 13-12-SUMMARY correctly declared `requirements-completed: []` |

### G7 "missing" items ledger (from 13-UAT.md § G7)

| UAT missing item | Disposition |
|------------------|-------------|
| Protocol fix: Flow C2 NVDA focus-mode (NVDA+Space) instruction | ✓ Landed — 59c3470, diff verified confined to Version + Flow C |
| Product-fix choice made in planning (focus-on-appear vs accept + document) | ✓ Decision G7-D1 recorded in the plan objective AND the SUMMARY (focus-on-appear REJECTED with the six-point justification — Gecko/WebKit visual-selection destruction + unwinnable debounce race + SR-disorientation; focus-mode-only reachability accepted as the platform convention); zero src/ edits shipped, verified |
| Keydown-less e2e + false comment fix | ✓ `toolbar-keydownless-focus.spec.ts` (249 lines, substantive, no forked harness — reuses `_fixtures.ts` wholesale) + the corrected toolbar-tab-path comment; 15/15 green in verifier's own run |
| Re-run: confirm C1 mount announcement; NVDA re-run of Flow C | ✓ C1 cue named in the protocol (the re-run prerequisite is recorded); the run itself is the tester's — the sole remaining human item, not a code gap |

**G7 verdict: CLOSED at the documentation + automation level.** Note for verify-work: 13-UAT.md § G7 still reads `status: diagnosed` — this verification confirms it can be updated to `resolved` (this verifier does not modify the UAT file).

### Prohibition Spot-Checks (13-12)

| Prohibition | Result |
|-------------|--------|
| Zero package installs | ✓ VERIFIED — no package.json/package-lock.json anywhere in 7521cf2..cb1527d |
| Diffs confined to plan files_modified | ✓ VERIFIED — f09c58d: 2 spec files; 59c3470: protocol only; metadata commit cb1527d: planning docs only |
| Zero production source changes (G7-D1) | ✓ VERIFIED — zero src/ files in the whole cycle range; no focus-on-appear/auto-focus added anywhere |
| No re-run results claimed in the protocol doc or SUMMARY | ✓ VERIFIED — the 59c3470 diff is instruction/cue/callout text only, no findings or verdicts; the SUMMARY states ACPT-05 stays Pending (D13-06/D13-07) |
| Boundary spec not weakened to force green (pinning, not TDD) | ✓ VERIFIED — both tests assert the diagnosed per-engine facts via the shared ENGINE_BOUNDARY constant; green on first run confirms (not contradicts) the G7 diagnosis; verifier's independent re-run 6/6 |

### Required Artifacts (13-12)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/ACCEPTANCE-PROTOCOL.md` | v1.1; Flow C NVDA focus-mode correction; contains "NVDA+Space" | ✓ VERIFIED | Version 1.1 at L32; NVDA+Space ×2 (C2+C3); diff confined to Version + Flow C |
| `tests/e2e/annotations/toolbar-keydownless-focus.spec.ts` | Browse-mode boundary pin + focus-mode recovery spec | ✓ VERIFIED | 249 lines (min 90); substantive real-keyboard/zero-keydown assertions; reuses _fixtures.ts helpers; green 6/6 in verifier's own run |
| `tests/e2e/annotations/toolbar-tab-path.spec.ts` | False browse-mode-passthrough comment replaced; sibling cross-reference | ✓ VERIFIED | Claim gone (rg exit 1); cross-ref ×2; 12-line comment-only diff; still green 9/9 |

### Key Link Verification (13-12)

| From | To | Via | Status |
|------|----|----|--------|
| toolbar-keydownless-focus.spec.ts | `src/reader/PaginatedSurface.tsx` | `button.page-turn-previous` (aria-label "Previous page") | ✓ WIRED — class rendered at PaginatedSurface L675; spec targets it exactly; behavioral runs green × 3 engines |
| docs/ACCEPTANCE-PROTOCOL.md Flow C2 | `.planning/debug/g7-nvda-tab-bypass-selection-toolbar.md` | focus-mode instruction = the live-verified Phase A path | ✓ WIRED — debug-doc reference in the callout; the documented sequence matches what the recovery spec pins |
| toolbar-keydownless-focus.spec.ts | `tests/e2e/annotations/_fixtures.ts` | selectRangeInBlock & co., no forked harness | ✓ WIRED — imports verified; same helpers as toolbar-tab-path |

### Data-Flow Trace (Level 4)

Not applicable at the product level (zero production changes — G7-D1). Spec-level: the boundary spec consumes the real fixture corpus (essay-long-form via FIXTURES[0]), drives the real PaginatedSurface/ArticleView DOM, and asserts live document state (activeElement, getSelection, toolbar count, mark creation) — no mocked or hardcoded data paths.

### Behavioral Spot-Checks (verifier's own runs, 2026-08-22)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| G7 boundary pin + recovery (Test 1 + Test 2) | `npx playwright test tests/e2e/annotations/toolbar-keydownless-focus.spec.ts` (included in the combined run below) | **6/6 green** — chromium/firefox/webkit, 0-keydown proof + engine-keyed collapse facts + chevron-pre-state recovery | ✓ PASS |
| G6 regression net (Tab reach + survival + Enter + Tab-past dismiss, both modes) | `npx playwright test tests/e2e/annotations/toolbar-tab-path.spec.ts` (included in the combined run below) | **9/9 green** — 3 engines × 3 tests | ✓ PASS |
| Combined G7+G6 spec gate | `npx playwright test tests/e2e/annotations/toolbar-keydownless-focus.spec.ts tests/e2e/annotations/toolbar-tab-path.spec.ts` | **15 passed (13.8s)** — zero failures | ✓ PASS |
| Unit leg of the honest suite | `npm run test:unit -- --run` | **1262 passed / 0 failed / 13 skipped (12.4s)** — matches the recorded gate's unit line exactly | ✓ PASS |
| Honest full-suite gate | (recorded by the orchestrator on cb1527d) | exit 0 — unit 1262/0/13 + e2e 1113/0/10 (10.6m, 3 engines + throttled perf) | ✓ RECORDED (unit leg + 15 toolbar cells independently corroborated this cycle; full suite not re-run — at most once per verification) |
| Zero-product-change proof | `git diff --name-only 7521cf2..cb1527d` | planning docs + protocol + 2 spec files only; no src/, no lockfiles | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional. The phase gate is the honest full-suite record on cb1527d (exit 0), corroborated by the verifier's own 15 toolbar cells + unit-leg reproduction this cycle.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 13-01, 13-09 | First-paint settings, no flash/snap (+ mode-surface aspect) | ✓ SATISFIED | Truth 1; green in recorded gate |
| POLISH-02 | 13-02, 13-09 | Position-accurate progress bar | ✓ SATISFIED | Truth 2; green in recorded gate |
| POLISH-03 | 13-04, 13-10 | Slim header + top-bar tag popover + compact provenance spot (amended) | ✓ SATISFIED | Truth 5; green in recorded gate |
| POLISH-04 | 13-03 | Centered modal dialogs | ✓ SATISFIED | Truth 6; green in recorded gate |
| POLISH-05 | 13-04 | Back-to-library affordance | ✓ SATISFIED | Truth 7; green in recorded gate |
| POLISH-06 | 13-03, 13-07 | Organized library home incl. shared measure | ✓ SATISFIED | Truth 8; green in recorded gate |
| ACPT-05 | 13-05, 13-11, 13-12 | NVDA+Firefox SR acceptance flows | ⏳ NEEDS HUMAN (re-run on v1.1) | Instrument v1.1 ready + both-sides boundary automation green; flips only on the tester's recorded run (D13-06/D13-07); REQUIREMENTS.md honestly `- [ ]` Pending |
| ACPT-06 | 13-06 | Core flow across browser matrix, no content loss | ✓ SATISFIED | Truth 4 — full-suite exit 0 (1113 e2e incl. spine × 3 engines) |

No orphaned requirements: all 8 phase-mapped IDs appear in plan frontmatter; REQUIREMENTS.md maps no additional IDs to Phase 13. 13-12 correctly declared `requirements-completed: []` (ACPT-05 not flipped by the protocol/spec work — the flip is the tester's, per D13-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER across all three 13-12-modified files; no empty implementations; the two settles (300ms/150ms) are the documented rAF-throttled selectionchange/React-unmount waits with asserted-state follow-ups, not timing substitutes | — | — |

### Human Verification Required

### 1. ACPT-05 re-run — Flow C on the v1.1 protocol (the phase's remaining gate)

**Test:** On NVDA+Firefox/Windows hardware, re-execute `docs/ACCEPTANCE-PROTOCOL.md` **v1.1** Flow C (C1–C4) per the D13-06 fix-then-re-run policy. The v1.1 sequence is load-bearing: C1 — browse-mode Shift+arrows selection, then listen for the **"Highlight actions available."** mount announcement (the toolbar-appeared cue); C2 — **NVDA+Space to enter focus mode FIRST** (listen for NVDA's toggle confirmation), then Tab; C3 — Enter on the focused Highlight button. Known pinned boundary (not a finding): a browse-mode Tab without NVDA+Space still lands on Previous page and unmounts the toolbar — recover via re-select → NVDA+Space → Tab.
**Expected:** The C1 cue is heard; NVDA+Space then Tab lands focus on the toolbar (role=toolbar, name "Highlight actions"); Enter creates the highlight with the polite "Highlight saved." confirmation. Fill Appendix §1.3 findings + §1.4 checklist + the run verdict — ACPT-05 flips from Pending only when the recorded run shows zero blocker/major (D13-07). A NEW blocker/major → fix-then-re-run again; minors recorded and deferred.
**Why human:** Requires real NVDA+Firefox on Windows with a human tester; no automated harness can exercise screen-reader announcements or NVDA's browse/focus-mode key consumption. The automation-level equivalence is proven on BOTH sides of the boundary — real-Tab routing (toolbar-tab-path 9/9) and keydown-less browse-mode collapse + focus-mode recovery (toolbar-keydownless-focus 6/6), all three engines, verifier's own runs.

### 2. VoiceOver+Safari supplementary checklist (NOT an ACPT-05 gate)

**Test:** When convenient on macOS, run the Appendix §3 checklist over the five v2.0 surface groups — include the toolbar announce-on-appear surface ("Highlight actions available.") in the walkthrough.
**Expected:** Findings recorded in Appendix §3.2 with the §5 severity rubric; supplementary evidence only (D13-05).
**Why human:** Requires VoiceOver + Safari on macOS with a human tester; explicitly non-gating.

### Gaps Summary

**No code gaps remain.** G7 — the second and final ACPT-05 Flow C gap — is closed exactly as its missing-item list sanctioned (option b, decision G7-D1): the documented focus-mode sequence is now true and re-runnable (protocol v1.1), the automation blind spot that hid G7's recurrence is closed with an honest both-sides boundary pin (keydown-less browse mode OUT of contract, real-keydown focus mode IN — green in the verifier's own runs across all three engines), and the false equivalence comment is gone. Zero production source changes (verified via git), no package installs, no regressions (15/15 toolbar cells + unit leg 1262/0/13 reproduced this cycle; orchestrator's full-suite exit 0 on cb1527d). The single open item is the designed-in ACPT-05 tester re-run (D13-06/D13-07): the phase stays `human_needed` until that run lands zero blocker/major in the Appendix record sheets.

### Notes & Process Observations (non-blocking)

1. **UAT ledger lag:** 13-UAT.md § G7 still reads `status: diagnosed`; this verification confirms closure and the status can be updated to `resolved` (left to verify-work, which owns that file). Its missing-item 4 (the re-run) is the standing human item, not a code gap.
2. **Suite-count deltas vs the prior gate are honest and accounted for:** unit 1261→1262 (+1 = the untracked `tests/unit/paginated-mobile-viewport.test.ts`, 17 lines, from the in-progress mobile-chrome workstream) and e2e 1101→1113 (+12 = the G7 spec's 6 cells + the uncommitted mobile-first-page-chrome cells in the worktree). The recorded gate on cb1527d therefore ran against the worktree state, which includes uncommitted mobile work (see next note).
3. **Uncommitted work in the tree (heads-up for the orchestrator):** `src/app.css` (+105 lines of additive 100dvh dynamic-viewport fallbacks), `tests/e2e/chrome/paginated-quiet-header.spec.ts` (modified), and untracked `tests/e2e/chrome/mobile-first-page-chrome.spec.ts`, `tests/unit/paginated-mobile-viewport.test.ts`, `PRODUCT.md`, and two `.planning/debug/mobile-*.md` docs — a separate mobile-first-page-chrome workstream in progress, NOT part of Phase 13's committed scope (verified: no phase-13 commit touches them). The recorded full-suite gate included them and was still exit 0 — so they do not undermine the phase evidence, but the work should be committed or stashed deliberately, not left drifting. The previously-noted unstaged deletion of `.planning/todos/pending/2026-08-21-fix-prod-ui-paste-ingest-flow.md` also remains.
4. **13-12's two implementation clarifications checked:** the engine-keyed post-collapse assertion (chromium count 1) is required by the plan's own green-immediately boundary contract — nothing was weakened; the header append as one 4-line comment entry matches the file's wrapped-comment style. Both are within the plan's contracts.
5. **Boundary honesty for future planning:** under G7-D1, browse-mode Tab remains outside the toolbar reachability contract BY DESIGN — any future focus-on-appear proposal must encounter the recorded six-point rejection in the 13-12 plan/SUMMARY before re-opening it.

---

# Appendix — ACPT-05 Acceptance Record (instrument, preserved verbatim from Plan 13-05)

> The verification report above is the authoritative phase verification. Everything from this line down is the
> Plan 13-05 Task 1 instrument (commit `2f5a139`), preserved byte-intentionally with its original section
> numbering (§1/§2/§3 — referenced externally, e.g. by 13-05-SUMMARY). Fill §1.3/§1.4 and the verdict when
> the NVDA+Firefox run happens; ACPT-05 flips only then (D13-07).

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

_Verified: 2026-08-22T18:52:30Z (re-verification after G7 gap closure — fourth cycle)_
_Verifier: the agent (gsd-verifier)_
