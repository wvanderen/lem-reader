---
phase: 13-polish-and-acceptance
plan: 11
subsystem: annotations
tags: [accessibility, keyboard-navigation, selection-toolbar, firefox, webkit, playwright-e2e, focus-management]

# Dependency graph
requires:
  - phase: 13-polish-and-acceptance
    provides: G6 diagnosis (.planning/debug/flowc-selection-toolbar-nvda.md) + the ACPT-05 UAT failure finding (13-UAT.md)
provides:
  - Single-Tab toolbar reachability + Enter activation for the selection toolbar in chromium/firefox/webkit, both reading modes (G6 closed at the automation level)
  - Focus-containment toolbar lifecycle (hold while it owns document.activeElement; focus-exit dismissal; Firefox last-button Tab-past dismissal)
  - Saved-range restore feeding the ONE existing highlight creation path (no forked validation)
  - Polite announce-on-appear live region ("Highlight actions available.")
  - The Tab-walk e2e regression spec (toolbar-tab-path.spec.ts) that formerly did not exist
  - NVDA (Firefox) selection + activation gestures documented in ACCEPTANCE-PROTOCOL Flow C1/C3
affects: [ACPT-05 re-run (D13-06), 13-VERIFICATION, acceptance-testing, annotations]

# Tech tracking
tech-stack:
  added: []  # zero new packages (T-13-11-SC)
  patterns:
    - "Floating-toolbar focus containment: hold mounted while document.activeElement is inside the root; dismiss on focusout with relatedTarget outside (plus engine-specific last-button Tab-past dismissal for Firefox, which parks focus when nothing follows)"
    - "Event-time-guarded keydown routing: mirror state into refs updated during render, re-verify preconditions + DOM existence immediately before preventDefault — never a stale closure, no focus bounce-back"
    - "Saved-Range activation restore: clone the valid Range at selectionchange time; restore (gated on toolbar focus) so the unchanged capture pipeline re-validates everything against the live DOM"

key-files:
  created:
    - tests/e2e/annotations/toolbar-tab-path.spec.ts
  modified:
    - src/routes/ArticleView.tsx
    - src/reader/annotations/SelectionToolbar.tsx
    - tests/e2e/annotations/keyboard-shortcuts.spec.ts
    - docs/ACCEPTANCE-PROTOCOL.md

key-decisions:
  - "Focus containment + Tab routing + saved-range restore (debug fix directions a+c) instead of auto-focus-on-appear (direction b) — auto-focus would collapse the selection and visually destroy the reader's selection highlight in Gecko/WebKit on every mouse selection"
  - "Native focusout listener attached imperatively on the toolbar root (React onFocusOut prop is not in @types/react 19.2; React onBlur maps non-bubbling blur, which would miss button→button moves)"
  - "Firefox Tab-past dismissal extended into the keydown branch (Tab on the toolbar's last button): Firefox parks focus on the last focusable when nothing follows it in the document, so focusout never fires and the focusout-only mechanism would wedge the toolbar there"

patterns-established:
  - "Focus-containment hold + focus-exit dismissal pairing: the two never conflict (guard holds only while activeElement is inside; dismissal fires only when the incoming target is outside)"
  - "Idempotent dismissal callbacks are safe around activation paths: the activation's own state-clear runs before any focus move, so later focusout no-ops"

requirements-completed: []  # ACPT-05 stays Pending until the tester's re-run lands in 13-VERIFICATION.md (D13-06/D13-07)

# Metrics
duration: 10 min
completed: 2026-08-22
status: complete
---

# Phase 13 Plan 11: G6 Toolbar Keyboard Reachability Gap Closure Summary

**Selection toolbar made keyboard-reachable via a single Tab + Enter-activatable in all three engines and both reading modes, via focus containment, event-time-guarded Tab routing, and saved-range restore feeding the unchanged creation path**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-22T00:30:23Z
- **Completed:** 2026-08-22T00:40:22Z
- **Tasks:** 3 (Task 2 executed as TDD GREEN over Task 1's RED)
- **Files modified:** 5

## Accomplishments

- **G6 truth closed at the automation level:** one Tab from the reading context lands focus on the toolbar's Highlight button, and Enter creates `mark.highlight[data-highlight-id]` + the "Highlight saved." role=status announcement, in chromium/firefox/webkit, in BOTH paginated and scrolling modes — proven by a real-Tab-walk e2e spec (the automation gap that hid the defect).
- **Toolbar lifecycle fixed for Gecko/WebKit focus semantics:** the toolbar stays mounted while it contains `document.activeElement` (surviving the synchronous selection collapse inside `focus()`), and dismisses when focus exits — no wedged toolbar after tabbing past it.
- **One creation path preserved:** the saved-range restore re-enters `createHighlightFromSelection` → `captureCurrentSelection`, so the single-block rule, overlap check, measurement-body guard, and grapheme capture all re-validate against the live DOM; zero changes to HighlightOverlay, selectors, or the mark DOM contract.
- **Pointer path unchanged; no auto-focus on appear:** toolbar appearance never steals focus (Gecko/WebKit would collapse the selection on every mouse selection otherwise); mouse-click activation behavior is byte-preserved (168/168 annotations e2e green).
- **ACPT-05 re-run prerequisite landed:** NVDA (Firefox) gestures documented in Flow C1 (browse-mode Shift+arrows) and C3 (Enter / NVDA+Space); ACPT-05 itself is NOT flipped — it flips only when the tester's re-run results land in 13-VERIFICATION.md (D13-06/D13-07).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Tab-walk e2e spec + strengthened keyboard-shortcuts assertion** - `4487e45` (test)
2. **Task 2: GREEN — focus-containment lifecycle, Tab routing, saved-range activation, announce-on-appear** - `42f1113` (feat)
3. **Task 3: ACCEPTANCE-PROTOCOL Flow C NVDA gestures** - `1aa22bf` (docs)

**Plan metadata:** see final docs commit (this file + STATE.md + ROADMAP.md).

## RED Evidence (Task 1 gate)

Pre-fix 3-engine run of `toolbar-tab-path.spec.ts` — 7 failed / 2 passed:
- **chromium — all 3 failed at the single-Tab-lands assertion**: a raw Tab walked natively to the first focusable (skip link); the toolbar sits near the END of DOM order (the debug session measured Tab #10 to reach it).
- **firefox + webkit — tests 1-2 failed at the toolbar-survival/focus assertion**: the first Tab collapsed the selection and unmounted the toolbar before focus could arrive (`locator.evaluate` timed out waiting for the Highlight button — the toolbar was gone; the exact G6 signature).
- firefox + webkit test 3 passed pre-fix only incidentally (the collapse itself unmounted the toolbar).

The strengthened keyboard-shortcuts test also failed pre-fix in all 3 engines at "one Tab reaches the Highlight button".

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 2 GREEN | `npx playwright test toolbar-tab-path.spec.ts keyboard-shortcuts.spec.ts` | **30 passed** (chromium/firefox/webkit) |
| Regression net | `npx playwright test tests/e2e/annotations/` | **168 passed** (3 engines) |
| Unit suite | `npm run test:unit -- --run` | **1261 passed / 0 failed / 13 skipped** (documented intentional skips) |
| Protocol diff discipline | `git diff docs/ACCEPTANCE-PROTOCOL.md` | confined to Flow C (callout L184 + rows C1/C3); C2 + all other flows byte-unchanged |
| NVDA grep | `rg -c "NVDA \(Firefox\)" docs/ACCEPTANCE-PROTOCOL.md` | **2** (C1 + C3) |
| TDD gates | `git log --grep` | RED `4487e45` precedes GREEN `42f1113` |

## Files Created/Modified

- `src/routes/ArticleView.tsx` - lastValidRangeRef + event-time guard refs; focus-containment hold in the selectionchange collapsed branch; cloneRange in the valid branch; Tab routing branch in the window keydown listener (incl. Firefox last-button Tab-past dismissal); saved-range restore in handleHighlightShortcut; stable dismissToolbarFromFocusExit; ref clears in every toolbar-clear branch + article swap; onFocusExit wiring
- `src/reader/annotations/SelectionToolbar.tsx` - required onFocusExit prop + native focusout listener on the root; announce-on-appear live region ("Highlight actions available."); corrected keyboard-path comment (toolbar IS the primary SR path)
- `tests/e2e/annotations/toolbar-tab-path.spec.ts` - NEW: the 3-engine × both-modes Tab-reachability + Enter-activation + Tab-past-dismissal spec
- `tests/e2e/annotations/keyboard-shortcuts.spec.ts` - the formerly-skipped Tab-activation assertion now real (stale non-assertability comment removed; existing programmatic-focus assertion + file header kept)
- `docs/ACCEPTANCE-PROTOCOL.md` - NVDA (Firefox) gestures in Flow C1/C3 + one factual callout sentence

## Decisions Made

- No auto-focus on appear (debug direction (b) explicitly rejected): pointer users keep today's behavior; Tab is the keyboard/SR route.
- Native `focusout` listener instead of React's `onFocusOut` prop: @types/react 19.2 does not ship the prop (tsc error), and React's `onBlur` maps non-bubbling `blur` which would miss intra-toolbar moves.
- `dismissToolbarFromFocusExit` added to the keydown effect deps (stable useCallback — never re-registers; listed for the exhaustive-deps rule; NO state deps added, per the plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Firefox Tab-past dismissal extended into the keydown branch**
- **Found during:** Task 2 (GREEN gate run — firefox test 3 failed)
- **Issue:** The plan's truth-4 mechanism (focusout-driven dismissal alone) cannot work in Firefox: a 3-engine probe (chromium/firefox, live dev server, real Tab presses) proved Firefox parks focus on the last focusable when nothing follows it in the document — the toolbar IS the last focusable cluster, so Tab from "Highlight + note" never moves focus, no focusout fires, and the toolbar wedges (chromium moves focus to body → focusout → dismiss, as planned).
- **Fix:** In the Tab keydown branch, when Tab is pressed ON the toolbar's LAST button, call `dismissToolbarFromFocusExit()` (no preventDefault — if the engine can move focus natively it may; the dismissal is idempotent with any focusout that follows).
- **Files modified:** src/routes/ArticleView.tsx
- **Verification:** toolbar-tab-path test 3 green in firefox (+ chromium/webkit unchanged); full annotations dir 168/168.
- **Committed in:** 42f1113 (Task 2 commit)

**2. [Rule 3 - Blocking] onFocusOut prop unavailable — native focusout listener used**
- **Found during:** Task 2 (implementation)
- **Issue:** The plan specifies "React's onFocusOut" on the toolbar root; @types/react 19.2.17 does not ship the prop (tsc TS2322), and React's onBlur maps the non-bubbling blur event, which would miss button→button moves.
- **Fix:** `useEffect` attaches a native `focusout` listener on `toolbarRef.current` (focusout bubbles — one root listener covers every exit; identical semantics to the intended React prop). Deps include `isToolbarRendered` so the listener attaches on the null→rendered transition.
- **Files modified:** src/reader/annotations/SelectionToolbar.tsx
- **Verification:** tsc clean; tests 1-3 green in all engines (intra-toolbar move holds, exits dismiss).
- **Committed in:** 42f1113 (Task 2 commit)

**3. [Rule 1 - Bug] Strengthened keyboard-shortcuts test sequence adapted**
- **Found during:** Task 1 (spec authoring)
- **Issue:** The plan's literal tail order — "after the existing isFocused check, press Tab, assert activeElement is the Highlight button" — is unsatisfiable post-fix: the existing check programmatically focuses the Highlight button, and a subsequent Tab natively moves focus to "Highlight + note" (the routing guard intentionally skips interception when activeElement is already inside the toolbar), so "activeElement is Highlight (exact)" can never hold after that Tab.
- **Fix:** The assertions are preserved exactly, ordered Tab → atomic Highlight-button focus assertion → existing programmatic-focus check (kept verbatim; idempotent when focus is already present) → Enter → mark + announce + toolbar count 0. The formerly-skipped keyboard activation is asserted for real; full Tab-walk coverage lives in toolbar-tab-path.spec.ts as the plan notes.
- **Files modified:** tests/e2e/annotations/keyboard-shortcuts.spec.ts
- **Verification:** test green in all 3 engines pre-fix RED → post-fix GREEN.
- **Committed in:** 4487e45 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocker)
**Impact on plan:** All fixes are mechanism completions required for the plan's own must_haves truths to hold in all three engines; no scope creep (zero files outside the plan's files_modified, zero dependency changes).

## TDD Gate Compliance

RED commit `4487e45` (test(13-11)) precedes GREEN commit `42f1113` (feat(13-11)); no REFACTOR pass needed (implementation kept minimal; no cleanup warranted). RED failed for the diagnosed reasons (per-engine output recorded above), not for import/syntax errors.

## Issues Encountered

None beyond the documented deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The ACPT-05 re-run prerequisite has landed: Flow C2/C3 are true in all three engines and both reading modes at the automation level, and the NVDA (Firefox) gestures are documented for the tester.
- ACPT-05 is NOT flipped by this plan — it flips only when the user's NVDA+Firefox re-run results land in 13-VERIFICATION.md §1.3/§1.4 with zero blocker/major (D13-06/D13-07).
- No open blockers from this plan.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-22*

## Self-Check: PASSED

All created files exist on disk; all three task commits (4487e45, 42f1113, 1aa22bf) present in git log; TDD gates present (RED precedes GREEN).
