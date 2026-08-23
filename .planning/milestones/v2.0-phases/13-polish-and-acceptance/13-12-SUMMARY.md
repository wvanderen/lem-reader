---
phase: 13-polish-and-acceptance
plan: 12
subsystem: annotations
tags: [accessibility, nvda, screen-reader, selection-toolbar, keyboard-navigation, playwright-e2e, acceptance-protocol, gap-closure]

# Dependency graph
requires:
  - phase: 13-polish-and-acceptance
    provides: G6 fix (13-11 — Tab routing + focus containment + saved-range activation) + G7 diagnosis (.planning/debug/g7-nvda-tab-bypass-selection-toolbar.md) + the ACPT-05 UAT failure finding (13-UAT.md G7)
provides:
  The NVDA Tab boundary pinned on BOTH sides — real-keydown (focus mode, toolbar-tab-path.spec.ts, prior) and keydown-less (browse mode, the new spec) — closing the automation blind spot that hid G7's recurrence; ACCEPTANCE-PROTOCOL.md v1.1 Flow C executable as written by an NVDA+Firefox tester (focus-mode instruction at C2, mount-announcement cue at C1, focus-mode-anchored C3 note); decision G7-D1 recorded (focus-mode-only SR reachability accepted + documented; focus-on-appear rejected)
affects: [ACPT-05 re-run (D13-06/D13-07), 13-VERIFICATION, acceptance-testing, annotations e2e suite]

# Tech tracking
tech-stack:
  added: []  # zero new packages (T-13-12-SC — no package.json/lockfile changes, verified)
  patterns:
    - "Boundary-pinning spec (not TDD): when a documented platform boundary replaces a product fix, assert today's diagnosed per-engine behavior as the contract — green-on-current-build is the gate; a failing assertion means the diagnosis is contradicted (Rule 4), never a reason to weaken the spec"
    - "Engine-keyed expectation constants (Record<engine, facts>) shared across boundary + recovery tests — one place encodes the per-engine collapse/unmount facts, both tests assert against it"
    - "Keydown-less focus emulation: capture-phase window keydown counter installed in one evaluate, bare el.focus() in a second, zero page.keyboard calls between — the keydown-less-ness itself is the asserted G7 signature"

key-files:
  created:
    - tests/e2e/annotations/toolbar-keydownless-focus.spec.ts
  modified:
    - tests/e2e/annotations/toolbar-tab-path.spec.ts
    - docs/ACCEPTANCE-PROTOCOL.md

key-decisions:
  - "G7-D1: accept focus-mode-only SR reachability under NVDA and document it in the protocol (option b); REJECTED focus-on-appear (option a) — see Decision G7-D1 below for the full recorded justification"
  - "Browse-mode Tab is OUT of the reachability contract, pinned as a documented boundary by the new spec; focus mode (NVDA+Space then Tab) is IN, pinned green by the real-Tab specs — the recovery journey (re-select, NVDA+Space, Tab) is documented in protocol v1.1 Flow C"
  - "ACPT-05 stays Pending — it flips only when the tester's NVDA+Firefox re-run of Flow C on the v1.1 protocol lands in 13-VERIFICATION.md §1.3/§1.4 with zero blocker/major (D13-06/D13-07; 13-11 precedent)"

requirements-completed: []  # ACPT-05 remains Pending until the human NVDA re-run lands in 13-VERIFICATION.md (D13-06/D13-07) — the plan's own contract, mirroring the 13-11 precedent

# Metrics
duration: 6 min
completed: 2026-08-22
status: complete
---

# Phase 13 Plan 12: G7 NVDA Browse-Mode Tab Bypass Gap Closure Summary

**NVDA browse-mode/Tab boundary pinned by a keydown-less-focus e2e spec (both sides of the boundary now covered), ACCEPTANCE-PROTOCOL Flow C corrected to v1.1 with the NVDA focus-mode instruction, and the false browse-mode-passthrough comment replaced — zero production source changes per decision G7-D1**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-22T18:22:59Z
- **Completed:** 2026-08-22T18:29:36Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Decision G7-D1 (recorded verbatim from the plan — do not re-litigate)

**Chosen: option (b) — accept focus-mode-only SR reachability under NVDA and document it in the protocol. Rejected: option (a) toolbar focus-on-appear (debounced).** Zero src/ changes shipped; the product behavior shipped by 13-11 is final for this gap.

Justification (any future focus-on-appear proposal MUST encounter this recorded rejection):

1. **(a) reintroduces a recorded harm.** 13-11 explicitly rejected focus-on-appear because Gecko/WebKit collapse the document selection synchronously inside focus() — on Firefox and Safari EVERY settled selection (mouse AND keyboard) would lose its visible selection highlight once the debounce fires. The visible selection is the primary "what am I about to highlight" feedback; destroying it attacks the product's calm-predictability core promise.
2. **(a) is a race it can still lose.** The tester's actual pacing was Tab immediately after selecting. When NVDA's Tab beats the debounce, NVDA moves focus to the Previous page chevron itself, Gecko collapses the selection inside that move, the selectionchange collapsed branch clears the toolbar state, and the pending focus-on-appear cancels on the cleared state — G7's observable byte-for-byte. A debounce narrows the race window; it cannot close it.
3. **(a) harms SR UX on another axis.** Unsolicited focus moves during selection reading/shaping are a recognized screen-reader disorientation pattern; the debounce is a heuristic that can fire mid-intent.
4. **(b) is deterministic and already verified.** The G7 debug session's live firefox Phase A experiment proved the current build routes a real Tab keydown onto the toolbar's Highlight button with the toolbar surviving — exactly the focus-mode condition. NVDA+Space is one keystroke SR users perform constantly.
5. **(b) is the platform convention.** SR users switch to focus mode to operate interactive widgets (the universal rich-toolbar convention); NVDA's auto-switch cannot help here because a plain-button toolbar does not "require" focus mode — which is why the explicit C2 instruction is load-bearing. Browse mode to read/select (C1), focus mode to operate the widget (C2/C3) is the coherent split.
6. **Zero product risk.** Pointer path, sighted-keyboard path, Chromium engine behavior, and the VoiceOver path remain byte-unchanged.

**Boundary honesty:** under G7-D1 a browse-mode Tab still yields the G7 observable (focus on Previous page, toolbar unmounts). That is now a DOCUMENTED boundary pinned by the new spec, and it is recoverable (re-select, NVDA+Space, Tab). The gap's truth is achieved via the documented focus-mode sequence.

## Boundary-Spec Semantics (toolbar-keydownless-focus.spec.ts)

- **Test 1 (browse-mode emulation, per-engine boundary):** from a live programmatic selection + mounted toolbar, a keydown-less programmatic focus to the Previous page chevron (`button.page-turn-previous`, aria-label "Previous page" — the exact control NVDA browse mode landed the tester on) delivers **0 keydowns** (capture-phase window counter, installed in one evaluate, focus in a second, zero `page.keyboard` calls between). **firefox + webkit:** selection collapsed + toolbar unmounted (count 0) — the G7 observable, now the documented browse-mode boundary. **chromium:** selection alive + toolbar still mounted (count 1) — engine-matrix completeness only; the SR acceptance pairings are NVDA+Firefox and VO+Safari. Expectations live in one engine-keyed `ENGINE_BOUNDARY` constant.
- **Test 2 (recovery = the documented focus-mode path):** after the keydown-less collapse, a fresh `selectRangeInBlock` (focus stays on the chevron — selection changes never move focus, so activeElement remains the chevron INSIDE the article subtree and the 13-11 routing guard's `articleNode.contains` clause is the engaging branch, modeling the real NVDA recovery pre-state) + ONE real Tab lands focus on the Highlight button with the toolbar connected (the same atomic evaluate toolbar-tab-path uses); Enter creates `mark.highlight[data-highlight-id]` + the "Highlight saved." announcement + toolbar count 0. No engine split — green on all three engines.
- **Pinning, not TDD:** both tests assert TODAY's diagnosed behavior as the documented contract. They were green on the current build immediately (15/15 cells with toolbar-tab-path) — confirming rather than contradicting the G7 diagnosis.

## Accomplishments

- **UAT G7 missing-item coverage complete:** (1) protocol fix — Flow C2 NVDA focus-mode instruction, C1 mount-announcement cue, C3 re-anchored note → Task 2; (2) product-fix choice made + justified → decision G7-D1 in the plan objective and recorded above; (3) keydown-less e2e + false comment fix → Task 1; (4) re-run prerequisites recorded (below).
- **The automation blind spot is closed with an honest boundary pin:** the suite now covers BOTH sides of the NVDA Tab boundary — real-keydown (focus mode) and keydown-less (browse mode) — instead of the false equivalence that hid G7's recurrence.
- **ACCEPTANCE-PROTOCOL.md v1.1 Flow C is executable as written by an NVDA+Firefox tester:** C2 directs NVDA+Space before Tab (the live-verified Phase A sequence), C1 names the "Highlight actions available." mount cue, C3's NVDA note is focus-mode-anchored with the browse-mode pass-through claim gone; the callout states the reachability precondition and references the G7 debug session. NVDA+Space appears exactly where required (C2 + C3).
- **Zero production source changes** (G7-D1 compliance): git diff across the plan's commits touches ONLY the three files_modified paths; src/ and package.json/lockfiles byte-unchanged (T-13-12-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: keydown-less boundary + recovery spec; false Tab comment corrected** - `f09c58d` (test)
2. **Task 2: ACCEPTANCE-PROTOCOL.md Flow C NVDA focus-mode correction (v1.0 → v1.1)** - `59c3470` (docs)

**Plan metadata:** see final docs commit (this file + STATE.md + ROADMAP.md).

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 spec gate | `npx playwright test toolbar-keydownless-focus.spec.ts toolbar-tab-path.spec.ts` | **15 passed** (chromium/firefox/webkit; new spec green on current build immediately — diagnosis confirmed, not contradicted) |
| Task 1 false-claim grep | `! rg -q "exact key NVDA browse mode" toolbar-tab-path.spec.ts` | **PASS** (claim gone) |
| Task 1 sibling cross-ref | `rg -c "toolbar-keydownless-focus" toolbar-tab-path.spec.ts` | **2** (present) |
| Task 2 NVDA+Space grep (pre-commit gate) | `rg -c "NVDA\+Space" docs/ACCEPTANCE-PROTOCOL.md` | **2** (C2 + C3, ≥2 required) |
| Task 2 version grep | `rg -n "\*\*Version\*\* \| 1\.1"` | **L32** |
| Task 2 diff gate (pre-commit timing per plan) | `git diff --stat && git diff docs/ACCEPTANCE-PROTOCOL.md \| grep -c "^[+-]"` | **PASS** (18 +/- lines, observed uncommitted per the 13-11 gate-timing precedent) |
| Protocol diff discipline | `git diff -U0 docs/ACCEPTANCE-PROTOCOL.md` hunks | confined to **L32 (Version)** + **Flow C** (callout L186 + rows C1/C2/C3); every other flow/section byte-unchanged |
| Regression net | `npx playwright test tests/e2e/annotations/` | **174 passed** (168 prior + 6 new cells, 3 engines, 0 failed) |
| Unit sanity | `npm run test:unit -- --run` | **1262 passed / 0 failed / 13 skipped** (documented intentional skips) |
| Zero-product-change proof | `git diff --name-only f09c58d^..59c3470` + `git diff … -- src/ package.json package-lock.json` | **exactly the 3 files_modified paths; src/ + lockfiles: 0 diff lines** |

## ACPT-05 Re-run Prerequisites (D13-06/D13-07 — read before the re-run)

ACPT-05 stays **Pending**; this plan does NOT flip it. It flips only when the tester's **NVDA+Firefox re-run of Flow C on the v1.1 protocol** lands in **13-VERIFICATION.md §1.3/§1.4** with **zero blocker / zero major** across the full protocol (D13-06/D13-07). The re-run must confirm:

- **(a)** "Highlight actions available." is heard after C1 (the toolbar mounted pre-Tab — the mount cue now named in C1's expected outcome), and
- **(b)** NVDA+Space then Tab lands focus on the "Highlight actions" toolbar / its Highlight button, and Enter creates the mark (the focus-mode sequence now documented at C2/C3).

Boundary note for the tester: a browse-mode Tab (no NVDA+Space) still yields the G7 observable — focus lands on Previous page and the toolbar unmounts. That is the documented, pinned boundary; the recovery is re-select → NVDA+Space → Tab.

## Files Created/Modified

- `tests/e2e/annotations/toolbar-keydownless-focus.spec.ts` - NEW (249 lines): the browse-mode boundary pin (Test 1, per-engine facts incl. the 0-keydown proof) + the focus-mode recovery spec (Test 2, chevron pre-state → real Tab → Highlight → Enter); reuses `_fixtures.ts` helpers wholesale (openArticle/selectRangeInBlock/findFirstBlockWithText/announcementRegion/FIXTURES — no forked harness); FIXTURE = FIXTURES[0] (essay-long-form), paginated default mode, no switchMode
- `tests/e2e/annotations/toolbar-tab-path.spec.ts` - the two-line false comment above `page.keyboard.press("Tab")` replaced with the true model (real Tab = the keydown-reaches-page condition: sighted keyboard or NVDA focus mode; browse mode consumes Tab — boundary pinned by the sibling spec); one comment entry appended to the header block recording the G7 refinement; zero assertion/helper/test-body changes
- `docs/ACCEPTANCE-PROTOCOL.md` - v1.0 → v1.1; header Version, Flow C callout reachability precondition, C1 mount cue, C2 NVDA+Space-first instruction, C3 focus-mode re-anchoring

## Implementation Notes (no Rule-N deviations)

- **Test 2's post-collapse assertion is engine-keyed, not an unconditional count-0.** The plan's Test-2 action text says "assert toolbar count 0" after the keydown-less collapse, but the plan's own Test-1 chromium boundary (and the green-immediately gate) require count **1** on chromium — the selection survives there, so no dismissal fires. The test asserts the shared `ENGINE_BOUNDARY` facts (0 on firefox/webkit — the G7 observable; 1 on chromium), and the recovery journey itself has NO engine split, exactly as the plan's `<behavior>` contract specifies. Nothing was weakened: every asserted fact is the diagnosed behavior.
- **The header append in toolbar-tab-path.spec.ts is one comment entry (4 wrapped lines),** matching the file's ~75-char comment style; "one line" read as one appended entry since the content (G7 refinement + sibling pointer + debug-doc reference) cannot fit one wrapped line.

## Deviations from Plan

None - plan executed exactly as written (the two items above are implementation clarifications within the plan's own contracts, not deviations).

**Total deviations:** 0
**Impact on plan:** none — zero files outside files_modified, zero dependency changes, zero production source changes.

## Authentication Gates

None.

## Known Stubs

None — no stubs, placeholders, or unwired data paths (test + docs only).

## Threat Flags

None — docs + test-only change; zero runtime code, zero dependencies, zero data paths touched (matches the plan's threat model: all dispositions accept, nothing new introduced).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G7's four missing items are all addressed; the annotations e2e directory and unit suite are green; no file outside files_modified changed.
- ACPT-05 remains Pending on the human NVDA+Firefox re-run (prerequisites above). Phase 13 gap closure G7 is complete at the documentation + automation level.
- No open blockers from this plan.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-22*

## Self-Check: PASSED

Created file exists on disk (tests/e2e/annotations/toolbar-keydownless-focus.spec.ts); both task commits (f09c58d, 59c3470) present in git log; all verification gates re-run and green at close-out.
