---
phase: 13-polish-and-acceptance
verified: 2026-08-22T01:13:17Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 0 # every code-level behavior-dependent truth has behavioral test evidence (verifier's own 36 targeted cells this cycle + the orchestrator's post-13-11/c16f271 honest full-suite exit 0)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/8
  gaps_closed:
    - "G6: ACPT-05 Flow C selection toolbar keyboard-unreachable under NVDA+Firefox (Gecko/WebKit focus-induced selection collapse) — closed by 13-11 (4487e45 RED, 42f1113 GREEN, 1aa22bf NVDA gesture docs)"
  gaps_remaining: [] # no code gaps; the ACPT-05 tester re-run is a human_verification item by design (D13-06/D13-07), not a code gap
  regressions: [] # orchestrator's honest full-suite gate re-run post 13-11 + c16f271: exit 0 — unit 1261/0/13 + e2e 1101/0/10 (10.7m, 3 engines + throttled perf); verifier's own 36 targeted cells corroborate
human_verification:
  - test: "ACPT-05 re-run (D13-06 fix-then-re-run): on NVDA+Firefox/Windows, re-execute ACCEPTANCE-PROTOCOL Flow C (C1–C4) against the G6-fixed build — the first run's only blocker/major was Flow C (selection toolbar unreachable; all other flows A,B,D,E,F + charters passed per 13-UAT.md Test 1). The protocol's Flow C now documents the NVDA gestures (C1: browse-mode Shift+arrows; C3: Enter / NVDA+Space) and the toolbar is a single Tab from the reading context in all engines"
    expected: "Flow C completes: Tab reaches the toolbar (role=toolbar, name 'Highlight actions'), Enter creates mark.highlight[data-highlight-id] with the polite confirmation. Record the full run's outcomes in Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only then (D13-07). Any new blocker/major follows fix-then-re-run; minors are recorded and deferred."
    why_human: "Requires a real screen reader (NVDA) + Firefox on Windows hardware with a human tester; no automated harness can exercise SR announcement behavior. The automation-level equivalence (real Tab presses + Enter activation, 3 engines × both modes) is proven green — only the human SR run remains."
  - test: "Optionally run the VoiceOver+Safari supplementary checklist (Appendix §3: library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings) — worth including the post-G6 toolbar announce-on-appear surface in the walkthrough"
    expected: "Findings recorded in Appendix §3.2 with the same severity rubric; NOT an ACPT-05 gate (D13-05) — supplementary evidence on the user's own schedule."
    why_human: "Requires VoiceOver + Safari on macOS with a human tester; explicitly supplementary."
---

# Phase 13: Polish and Acceptance — Verification Report

**Phase Goal:** The v2.0 quality gate — eliminate the two known polish regressions, land the user-widened chrome polish (D13-12), and close acceptance across the supported browser matrix, mirroring v1.0 Phase 6.
**Verified:** 2026-08-22T01:13:17Z
**Status:** human_needed — G6 closed with independently reproduced behavioral evidence (9/9 Tab-path + 27/27 pointer-path cells in the verifier's own runs); 7/8 success criteria verified; SC#3 (ACPT-05) awaits the tester's post-fix NVDA+Firefox re-run (D13-06 fix-then-re-run; the fix has landed)
**Re-verification:** Yes — third cycle. Lineage: gaps_found (G1–G5, 2026-08-19T16:25Z) → human_needed (G1–G5 closed, 2026-08-19T23:10Z) → human_needed (G6 closed, this cycle)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC#1 (POLISH-01): persisted reading mode/theme/typography paint first — no flash or snap (cold-load no-snap test passes) | ✓ VERIFIED (regression) | Artifacts intact (`src/settings/settingsMirror.ts`, `index.html` inline script, SettingsContext lazy-init); cold-load-no-snap green in the orchestrator's honest full-suite gate re-run (exit 0, post 13-11 + c16f271, postdating all code commits) |
| 2 | SC#2 (POLISH-02): progress bar reflects actual position — 1-page ≠ 100% on open, multi-page progresses from start | ✓ VERIFIED (regression) | `src/pagination/progress.ts` untouched by 13-11/c16f271 (both commits confined to annotations code + 2 spec files); first-paint-progress green in the recorded gate |
| 3 | SC#3 (ACPT-05): documented SR acceptance flows complete on NVDA+Firefox with zero blocker/major, closing v1.0 A4 boundary | ⏳ PENDING TESTER RE-RUN — see Human Verification | **The first run HAS now happened** (13-UAT.md Test 1): flows A, B, D, E, F + all charters passed; Flow C failed at the selection toolbar (the single major → G6, root-caused to the Gecko/WebKit focus-induced selection collapse). Per D13-06 fix-then-re-run: the fix landed (13-11, verified below), the protocol documents the NVDA gestures (1aa22bf), and the affected flow must be re-run to zero blocker/major before the flip. Appendix §1.3/§1.4 remain unfilled (results arrived via the UAT conversation); REQUIREMENTS.md honestly shows ACPT-05 `- [ ]` Pending |
| 4 | SC#4 (ACPT-06): v2.0 core flow (ingest→read→highlight→export→re-import) across Chromium/Firefox/WebKit without content loss, AND full `npm run test` exits 0 | ✓ VERIFIED | Orchestrator's honest full-suite gate re-run after 13-11 + c16f271 in one invocation: **exit 0 — unit 1261 passed / 0 failed / 13 skipped + e2e 1101 passed / 0 failed / 10 skipped (10.7m)** across chromium/firefox/webkit + the throttled perf profile; postdates every code commit (incl. the quick-260821-ov7 paste work). The 6 transient failures c16f271 addressed were de-brittling of two specs (verified below), fixed and re-run green |
| 5 | SC#5 (POLISH-03, amended 2026-08-19): slim article header; tag affordance from top-bar icon popover; compact provenance spot; no internal header scrolling at 360×640 | ✓ VERIFIED (regression) | 13-11/c16f271 touched no chrome/header code (diff-stat verified: 42f1113 = ArticleView.tsx + SelectionToolbar.tsx only; c16f271 = 2 spec files only); tag-popover + header-geometry green in the recorded gate (c16f271's light-dismiss fix is spec-side, verified below) |
| 6 | SC#6 (POLISH-04): four centered modal dialogs open centered, not top-left | ✓ VERIFIED (regression) | No CSS/dialog changes in this cycle; green in the recorded gate |
| 7 | SC#7 (POLISH-05): keyboard-reachable "Back to library" on article + review views; never exits app on deep link | ✓ VERIFIED (regression) | `src/reader/BackToLibrary.tsx` intact; green in the recorded gate |
| 8 | SC#8 (POLISH-06): organized library home — continue reading / add content / library list within existing components | ✓ VERIFIED (regression) | LibraryView + `.library-section-add` measure rule untouched this cycle; library-tidy green in the recorded gate |

**Score:** 7/8 truths verified (1 pending the tester's post-fix re-run — ACPT-05)

## Gap Closure Verification (re-verification focus — G6, plan 13-11)

Full verification (exists / substantive / wired) plus the verifier's own behavioral runs for each 13-11 must-have truth:

| # | 13-11 Truth | Status | Evidence |
|---|-------------|--------|----------|
| 1 | After a text selection, a single Tab moves focus onto the toolbar's Highlight button in Chromium, Firefox, AND WebKit (Flow C2) | ✓ VERIFIED | Tab routing branch (ArticleView L758-784): event-time guards via render-mirrored refs (`captureOkRef`/`toolbarRectActiveRef`, L304-307) — plain Tab only, reading-context-only, not-inside-toolbar, toolbar-button-in-DOM check before preventDefault → `.selection-toolbar button`.focus(). **Behavioral: toolbar-tab-path tests 1–2 green in verifier's own 3-engine run — the `state.isFocus` atomic assertion passed in chromium, firefox, AND webkit** |
| 2 | The toolbar stays mounted while it contains document.activeElement, surviving the Gecko/WebKit focus-induced selection collapse | ✓ VERIFIED | Focus-containment guard in the selectionchange collapsed branch (ArticleView L894-900): `active.closest(".selection-toolbar")` → return without clearing; cloneRange persisted on the valid branch (L941); ref cleared in every other clear branch (L903/918/933/665/696/1168). **Behavioral: the `state.connected` toolbar-survival assertion green in all 3 engines (verifier's own run) — the exact pre-fix failure signature** |
| 3 | Enter on the focused Highlight button creates mark.highlight[data-highlight-id] + "Highlight saved." announcement, all 3 engines, BOTH modes | ✓ VERIFIED | Saved-range restore in handleHighlightShortcut (L639-650): gated on activeElement-inside-toolbar + lastValidRangeRef, restore re-enters the ONE creation path `createHighlightFromSelection` (L652-653) — no forked validation. **Behavioral: verifier's own run — paginated + scrolling tests green × 3 engines (6/6), each asserting the mark + `announcementRegion` contains "Highlight saved" (the real D5-12 role=status region, non-vacuous per _fixtures.ts L361-365) + toolbar count 0** |
| 4 | Tabbing past the toolbar's last button dismisses it (containment releases; no wedged toolbar) | ✓ VERIFIED | Two complementary mechanisms verified in code: (a) SelectionToolbar native `focusout` on the root with relatedTarget containment check (L177-191) → `onFocusExit` → `dismissToolbarFromFocusExit` (ArticleView L693-697, clears the exact trio, idempotent); (b) Firefox last-button Tab-past dismissal in the keydown branch (L796-807 — Firefox parks focus on the last focusable, so focusout never fires; the documented Rule-1 deviation, verified justified). **Behavioral: test 3 green in all 3 engines (verifier's own run)** |
| 5 | Pointer path unchanged; toolbar appearance never steals focus (no auto-focus on appear) | ✓ VERIFIED | Zero `.focus()` calls in SelectionToolbar.tsx (verifier's grep — exit 1, no match); buttons keep plain `onClick` activation; announce-on-appear is a visually-hidden `role=status` live region set only on the transition into the buttons variant (prev-guard, L148-156, L222-224 — "Highlight actions available."). **Behavioral: capture-highlight.spec.ts (mouse-click activation path) 27/27 green × 3 engines in verifier's own run** |

### G6 "missing" items ledger (from 13-UAT.md § G6)

| UAT missing item | Disposition |
|------------------|-------------|
| Focus-containment + Tab routing + saved-range activation (+ announce) | ✓ Implemented — code verified (above), behavioral runs green |
| Tab-walk e2e spec asserting toolbar reachability + Enter activation in firefox and webkit | ✓ `tests/e2e/annotations/toolbar-tab-path.spec.ts` (163 lines, 3 tests, both modes, real Tab presses) — 9/9 green in verifier's own run; the formerly-skipped keyboard-shortcuts assertion (L140-167) is now real |
| NVDA selection/activation gestures documented in Flow C1/C3 | ✓ `docs/ACCEPTANCE-PROTOCOL.md` — NVDA (Firefox) in C1 (browse-mode Shift+arrows) + C3 (Enter / NVDA+Space) + one factual callout sentence; git diff 1aa22bf confined to Flow C (5+/3−), C2 and all other flows byte-unchanged |
| Re-run ACPT-05 per D13-06 after fix lands | ⏳ The tester's — the sole remaining human item (see Human Verification); not a code gap |

**G6 verdict: CLOSED at the automation level.** Note for verify-work: 13-UAT.md § G6 still reads `status: diagnosed` — this verification confirms it can be updated to `resolved` (this verifier does not modify the UAT file).

### Prohibition Spot-Checks (13-11)

| Prohibition | Result |
|-------------|--------|
| Zero package installs | ✓ VERIFIED — `git diff 4487e45^ c16f271 -- package.json package-lock.json`: 0 lines |
| Diffs confined to plan files_modified | ✓ VERIFIED — 4487e45: 2 spec files only; 42f1113: ArticleView.tsx + SelectionToolbar.tsx only; 1aa22bf: ACCEPTANCE-PROTOCOL.md only |
| No changes to HighlightOverlay.tsx / selectors / mark DOM contract | ✓ VERIFIED — not in any 13-11 diff; the creation path is unchanged (`createHighlightFromSelection` re-entered, not forked) |
| TDD discipline (RED precedes GREEN) | ✓ VERIFIED — `git merge-base --is-ancestor 4487e45 42f1113`: yes; RED failed for the diagnosed per-engine reasons (13-11-SUMMARY records 7 failed / 2 passed pre-fix output), not syntax errors |
| No re-run results claimed in the protocol doc | ✓ VERIFIED — the 1aa22bf diff is gesture documentation + one forward-looking callout sentence only; no findings/verdicts recorded |

### Required Artifacts (13-11)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/routes/ArticleView.tsx` | focus-containment hold + focus-exit dismissal + event-time-guarded Tab routing + saved-range restore | ✓ VERIFIED | All four mechanisms present and substantive (L304-307, L624-665, L693-697, L758-808, L875-941); wired into the live selectionchange/keydown listeners |
| `src/reader/annotations/SelectionToolbar.tsx` | onFocusExit wiring + announce-on-appear + corrected keyboard-path comment | ✓ VERIFIED | Native focusout listener (L177-191), announce region (L148-156, L222-224), required `onFocusExit` prop consumed by ArticleView L2191 |
| `tests/e2e/annotations/toolbar-tab-path.spec.ts` | 3-engine Tab-reachability + Enter-activation spec, both modes | ✓ VERIFIED | 163 lines, 3 tests, real Tab presses, atomic focus+connected assertion; green 9/9 in verifier's own run |
| `tests/e2e/annotations/keyboard-shortcuts.spec.ts` | formerly-skipped Tab-activation assertion now real | ✓ VERIFIED | Stale non-assertability comment removed; Tab → focus assertion → Enter → mark + announce + dismiss; historical programmatic-focus assertion kept |
| `docs/ACCEPTANCE-PROTOCOL.md` | NVDA (Firefox) gestures in Flow C1/C3 | ✓ VERIFIED | grep count 2 (C1 + C3); diff confined to Flow C |

### Key Link Verification (13-11)

| From | To | Via | Status |
|------|----|----|--------|
| ArticleView window keydown Tab branch | `.selection-toolbar` first button | preventDefault + focus() with event-time refs | ✓ WIRED (behavioral: one-Tab-lands assertion green × 3 engines) |
| ArticleView handleHighlightShortcut saved-range restore | createHighlightFromSelection | restored live Range re-enters the unchanged capture pipeline | ✓ WIRED (behavioral: Enter-creates-mark green × 3 engines × both modes) |
| SelectionToolbar root focusout | dismissToolbarFromFocusExit (onFocusExit prop) | relatedTarget-outside → clear trio | ✓ WIRED (behavioral: Tab-past dismissal green × 3 engines) |
| toolbar-tab-path.spec.ts | `.selection-toolbar` + mark.highlight DOM contract | real Tab presses + Enter activation | ✓ WIRED (spec asserts both contracts; green) |

### Data-Flow Trace (Level 4)

No STATIC/HOLLOW/DISCONNECTED findings. The saved-range restore feeds real selection data through the live capture pipeline (mark + persisted highlight proven by re-derivation in the spec); the announce region carries real state transitions (buttons-variant guard); the routing reads live refs mirrored during render — no hardcoded or stale-closure paths.

### Behavioral Spot-Checks (verifier's own runs, 2026-08-22)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| G6 truths 1–4 (Tab reach + survival + Enter activate + Tab-past dismiss, both modes) | `npx playwright test tests/e2e/annotations/toolbar-tab-path.spec.ts` | **9 passed (11.0s)** — chromium/firefox/webkit × 3 tests | ✓ PASS |
| G6 truth 5 (pointer path unchanged) | `npx playwright test tests/e2e/annotations/capture-highlight.spec.ts` | **27 passed (21.0s)** — 3 engines, mouse-click activation | ✓ PASS |
| Honest full-suite gate | (recorded by the orchestrator after 13-11 + c16f271, postdating all code commits) | exit 0 — unit 1261/0/13 + e2e 1101/0/10 (10.7m) | ✓ RECORDED (not re-run this cycle; 36 targeted cells above corroborate the changed contracts) |
| c16f271 scope check | `git show c16f271 --stat` | 2 spec files only (tag-popover light-dismiss target, page-turn key-bundle) — zero production code; consistent with "pre-existing brittleness de-brittled, not a 13-11 regression" | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional. The phase gate is the honest full-suite record (orchestrator's post-13-11 + c16f271 run: exit 0, counts above), corroborated by the verifier's 36 independent cells this cycle.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 13-01, 13-09 | First-paint settings, no flash/snap (+ mode-surface aspect) | ✓ SATISFIED | Truth 1; green in recorded gate |
| POLISH-02 | 13-02, 13-09 | Position-accurate progress bar | ✓ SATISFIED | Truth 2; green in recorded gate |
| POLISH-03 | 13-04, 13-10 | Slim header + top-bar tag popover + compact provenance spot (amended) | ✓ SATISFIED | Truth 5; green in recorded gate |
| POLISH-04 | 13-03 | Centered modal dialogs | ✓ SATISFIED | Truth 6; green in recorded gate |
| POLISH-05 | 13-04 | Back-to-library affordance | ✓ SATISFIED | Truth 7; green in recorded gate |
| POLISH-06 | 13-03, 13-07 | Organized library home incl. shared measure | ✓ SATISFIED | Truth 8; green in recorded gate |
| ACPT-05 | 13-05, 13-11 | NVDA+Firefox SR acceptance flows | ⏳ NEEDS HUMAN (re-run) | First run: 5/6 flows + all charters pass, Flow C major (G6) → fixed by 13-11 (this verification) → re-run pending per D13-06; REQUIREMENTS.md honestly `- [ ]` Pending; instrument intact (Appendix) |
| ACPT-06 | 13-06 | Core flow across browser matrix, no content loss | ✓ SATISFIED | Truth 4 — full-suite exit 0 (1101 e2e incl. spine × 3 engines) |

No orphaned requirements: all 8 phase-mapped IDs appear in plan frontmatter; REQUIREMENTS.md maps no additional IDs to Phase 13. 13-11 correctly declared `requirements-completed: []` (ACPT-05 not flipped by the fix — the flip is the tester's, per D13-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Zero TBD/FIXME/XXX/TODO/HACK across all five 13-11-modified files; no empty implementations; no fixed sleeps added (the two 150ms settles in toolbar-tab-path are the documented rAF-throttled selectionchange settle, asserted-state follow-ups, not timing substitutes) | — | — |

### Human Verification Required

### 1. ACPT-05 re-run — Flow C on the G6-fixed build (the phase's remaining gate)

**Test:** On NVDA+Firefox/Windows hardware, re-execute `docs/ACCEPTANCE-PROTOCOL.md` Flow C (C1–C4) per the D13-06 fix-then-re-run policy — the first run's only blocker/major was Flow C (all other flows + charters passed, 13-UAT.md Test 1). The protocol now documents the NVDA gestures (C1: browse-mode Shift+arrows; C3: Enter / NVDA+Space) and the toolbar is a single Tab from the reading context in all engines.
**Expected:** Tab reaches the toolbar (role=toolbar, name "Highlight actions"); Enter creates the highlight with the polite confirmation. Fill Appendix §1.3 findings + §1.4 checklist + the run verdict — ACPT-05 flips from Pending only when the recorded run shows zero blocker/major (D13-07). New blocker/major → fix-then-re-run again; minors recorded and deferred.
**Why human:** Requires real NVDA+Firefox on Windows with a human tester; no automated harness can exercise screen-reader behavior. The automation-level equivalence (real Tab + Enter, 3 engines × both modes) is proven green — only the SR run remains.

### 2. VoiceOver+Safari supplementary checklist (NOT an ACPT-05 gate)

**Test:** When convenient on macOS, run the Appendix §3 checklist over the five v2.0 surface groups — now including the G6 surfaces (toolbar announce-on-appear "Highlight actions available.", Tab-reached toolbar) alongside the earlier gap-closure surfaces.
**Expected:** Findings recorded in Appendix §3.2 with the §5 severity rubric; supplementary evidence only (D13-05).
**Why human:** Requires VoiceOver + Safari with a human tester; explicitly non-gating.

### Gaps Summary

**No code gaps remain.** G6 — the last diagnosed gap — is closed with the verifier's own behavioral evidence (9/9 Tab-path cells + 27/27 pointer-path cells across all three engines, matching the orchestrator's recorded full-suite exit 0). No regressions in the previously-verified truths (the gate re-run postdates every code commit; this cycle's commits are confined to their plan scopes). The single open item is the designed-in ACPT-05 tester re-run (D13-06/D13-07): the phase stays `human_needed` until that run lands zero blocker/major in the Appendix record sheets.

### Notes & Process Observations (non-blocking)

1. **UAT ledger lag:** 13-UAT.md § G6 still reads `status: diagnosed`; this verification confirms closure and the status can be updated to `resolved` (left to verify-work, which owns that file). Its `missing` item 4 ("re-run ACPT-05") is the standing human item, not a code gap.
2. **ACPT-05 first-run record placement:** the tester's first-run outcome ("All pass besides C") lives in 13-UAT.md Test 1 rather than the Appendix §1.3/§1.4 sheets, which remain blank. Per D13-07 the flip requires the recorded results in this file — the re-run should fill the sheets (a full re-record of all eleven rows is at the tester's discretion; D13-06 requires at minimum the affected flow C re-run to zero blocker/major).
3. **c16f271 verified as claimed:** spec-only de-brittling (tag-popover light-dismiss click target computed from the popover's bounding box; page-turn bundle reordered after 13-10's compacted article-top shrank essay-long-form to 3 pages) — zero production code, so no re-verification of product truths was required beyond the recorded gate.
4. **Suite counts grew honestly:** unit 1200→1261 and e2e 1084→1101 since the last recorded gate, consistent with the new toolbar-tab-path spec (9 cells), the strengthened keyboard-shortcuts assertions, and interim quick-work (paste reroute) specs — not a red flag.
5. **Housekeeping (outside phase scope):** an unstaged deletion of `.planning/todos/pending/2026-08-21-fix-prod-ui-paste-ingest-flow.md` is sitting in the worktree — leftover from the quick-260821-ov7 paste work (its docs commit says "close paste-ingest todo"); the orchestrator may want to stage it with that workstream's artifacts.

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

_Verified: 2026-08-22T01:13:17Z (re-verification after G6 gap closure — third cycle)_
_Verifier: the agent (gsd-verifier)_
