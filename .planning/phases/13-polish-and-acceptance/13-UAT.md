---
status: diagnosed
phase: 13-polish-and-acceptance
source: [13-VERIFICATION.md]
started: 2026-08-19T00:00:00.000Z
updated: 2026-08-22T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. ACPT-05 — NVDA+Firefox acceptance run
expected: Execute docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented on Windows hardware (NVDA + Firefox): six scripted flows (A–F) + five exploratory charters. Record findings in 13-VERIFICATION.md Appendix §1.3 (findings sheet) and §1.4 (charters). Zero blocker/major findings → ACPT-05 complete (D13-07).
result: issue
reported: "All pass besides C, I can't get to that selection toolbar but I'm not sure if it's user error"
severity: major
detail: Flows A, B, D, E, F + charters pass. Flow C (Create a highlight) fails at the selection-toolbar path (C2/C3 protocol steps) under NVDA+Firefox. User unsure whether tester technique or product defect — diagnosis to determine.
resolution: Root cause diagnosed (G6) and closed by 13-11 — not user error. Gecko/WebKit collapse the document selection when DOM focus moves, unmounting the toolbar before focus could arrive. Fixed via focus-containment lifecycle + Tab routing + saved-range activation; regression-proven by the 3-engine toolbar-tab-path e2e (both reading modes). Re-run Flow C per Current Test 4.

### 2. VoiceOver+Safari supplementary checklist (v2.0 surfaces)
expected: Walk the Appendix §3 checklist for the five v2.0 surface groups (library, markdown/epub/pdf intake, export/import, review, header/nav polish) — now including the G4 placeholder and G5 tag-popover/drawer-export surfaces. NOT an ACPT-05 gate — supplementary coverage on the user's own schedule; record notes in the appendix.
result: pass

### 3. Visual acceptance of the G5 redesign (recommended)
expected: Human eyeball of the G5 closure on real hardware: top-bar tag popover (open/edit/light-dismiss), compact provenance-only article-top spot, Export highlights in the annotations drawer. G5 originated as a design rejection, so a final visual sign-off closes what specs cannot pin.
result: pass

### 4. ACPT-05 Flow C re-run on the G6-fixed build (NVDA+Firefox)
expected: Re-run ACCEPTANCE-PROTOCOL.md Flow C (C1–C4) under NVDA+Firefox on Windows hardware — the protocol now documents the explicit NVDA selection + activation gestures in C1/C3 (13-11 commit 1aa22bf). C2 (Tab reaches the toolbar) and C3 (Enter creates the highlight) are backed by the 3-engine toolbar-tab-path e2e. Record in 13-VERIFICATION.md Appendix §1.3/§1.4; zero blocker/major across the full protocol flips ACPT-05 (D13-06/D13-07).
result: issue
reported: "fail - tab goes to previous page button on tab with text selected in NVDA, no selection toolbar appears"
severity: major
detail: Recurrence of G6-class behavior on the G6-fixed build: with text selected in the reader under NVDA+Firefox, pressing Tab moves focus to the Previous Page control instead of the selection toolbar; the toolbar never becomes reachable (and may never mount). 13-11's Tab routing (event-time-guarded) is not engaging under NVDA+Firefox real-keyboard conditions despite the 3-engine e2e passing.

## Summary

total: 4
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

User manual review 2026-08-19 (post-execution, before UAT run) — five findings against phase-13 scope. All five closed by gap-closure plans 13-07…13-10 and independently re-verified 2026-08-19 (behavioral runs on the 3-engine matrix; see 13-VERIFICATION.md § Re-verification).

### G1 — Add-a-Page section breaks library width measure
status: resolved
closed_by: 13-07 (commits 7d87c34, 9314152) — `.library-section-add` measure rule + strengthened library-tidy parity spec
source: user review; POLISH-06 (library tidy, 13-03)
detail: The "Add a Page" section on the library/home spans edge-to-edge full width instead of conforming to the shared content measure/inset tokens used by the surrounding sections. Looks out of place.
expected: Add-a-Page conforms to the same width/inset tokens as sibling library sections.

### G2 — No way to remove a queued upload file
status: resolved
closed_by: 13-08 (commits 237038a, 12db798) — resetFilePick at every terminal outcome + Remove file affordance + upload-queue e2e
source: user review
detail: In "Upload a File", once a file is queued/picked there is no affordance to remove it — even after the upload completes the queued file persists until page refresh.
expected: A remove/clear affordance for the queued pick, and the file-input state resets after a completed upload. Precedent: 09-05 import file-input value reset on refusals AND Proceed/Cancel.

### G3 — Emoji trash icon in library rows
status: resolved
closed_by: 13-07 (commit 9314152) — TrashIcon inline-SVG + quiet destructive icon-button rule; repo emoji sweep returns zero
source: user review
detail: LibraryRow.tsx:125 renders the 🗑 emoji as the remove icon. Policy: real icons (SVG), no emoji icons. (Repo grep confirms this is the only emoji icon in src/.)
expected: Replace with a proper SVG/icon glyph; sweep confirms zero emoji-as-icon usage in the UI.

### G4 — First-load jump in paginated mode (scroll surface + progress flashes first)
status: resolved
closed_by: 13-09 (commits a2c6f19, 7a5d4f0) — paginatedPending placeholder branch + first-paint-mode-surface e2e
source: user review; POLISH-01/02 territory (13-01/13-02 killed the settings-token flash but not the mode-surface flash)
detail: Opening an article in paginated mode first shows the scrolling surface and its progress, then swaps to the paginated surface — visible jump on every first load. Scrolling mode has no jump.
expected: Zero jumping on first load in paginated mode — the first stable paint is the paginated surface (or a stable placeholder until pagination settles), never scroll-then-swap.

### G5 — Article-top metadata spot design + tag entry placement
status: resolved
closed_by: 13-10 (commits 3977351, 4a2b85b, 25db7b5) — top-bar tag popover + compact provenance spot + drawer-housed export; visual acceptance item 3 added for final human sign-off
source: user review; POLISH-03 (D13-13 metadata spot, 13-04 Option A)
detail: User rejects the tag-adding section below the article title: proposes the tag affordance as a small icon in the top bar NEAR the highlights-drawer and mode-toggle controls instead of inline with the title. The metadata section's visual design is also called unacceptable as-is. Partially supersedes the 13-04 Option A placement decision (user-direction change; byline/source/export disposition to be decided in planning).
expected: Tag entry reachable via top-bar icon alongside highlights/mode controls; metadata spot visually redesigned or restructured per plan; no regression to the 09-07 geometry lesson or the firstPageReservedPx contracts.

### G6 — ACPT-05 Flow C: selection toolbar unreachable under NVDA+Firefox
status: resolved
closed_by: 13-11 (commits 4487e45 RED spec, 42f1113 GREEN fix, 1aa22bf NVDA gesture docs) — focus-containment toolbar lifecycle + event-time-guarded Tab routing + saved-range activation feeding the ONE existing creation path; 3-engine toolbar-tab-path e2e (both modes) + strengthened keyboard-shortcuts assertion; independently re-verified 2026-08-22 (verifier behavioral runs + honest full-suite gate exit 0: unit 1261/0/13 + e2e 1101/0/10)
- truth: "After making a text selection in the reader, Tab reaches the selection toolbar (role=toolbar, accessible name 'Highlight actions') and Enter on the 'Highlight' button creates a mark with a polite confirmation announcement (ACCEPTANCE-PROTOCOL.md v1.0, Flow C steps C2–C3)"
  status: failed
  reason: "User reported: All pass besides C, I can't get to that selection toolbar but I'm not sure if it's user error"
  severity: major
  test: 1
  root_cause: "Gecko/WebKit collapse the document selection synchronously when DOM focus moves (including to the toolbar's own buttons). SelectionToolbar lifecycle is driven solely by selectionchange (collapsed → unmount), so the first Tab press in Firefox destroys the selection and unmounts the toolbar before focus can reach it — keyboard-unreachable regardless of technique. Chromium works. Never surfaced before: e2e specs use programmatic selections + mouse clicks; keyboard-shortcuts.spec.ts:140-167 skipped the Tab-activation assertion with a comment observing the collapse; VoiceOver run used accessibility-layer navigation, not DOM-focus Tab."
  artifacts:
    - path: "src/routes/ArticleView.tsx"
      issue: "selectionchange listener L705-762 unmounts toolbar on collapsed selection with no focus-containment awareness (L713-716)"
    - path: "src/reader/annotations/SelectionToolbar.tsx"
      issue: "conditional render on selectionRect/captureResult (L122); no focus containment or announce-on-appear"
    - path: "docs/ACCEPTANCE-PROTOCOL.md"
      issue: "Flow C1/C3 (L188-190) document VoiceOver gestures only; no NVDA selection/activation gestures documented"
    - path: "tests/e2e/annotations/keyboard-shortcuts.spec.ts"
      issue: "L140-167 skipped Tab-activation assertion ('focusing the button clears the text selection') — automation gap that hid the defect"
  missing:
    - "Keep toolbar mounted while it contains document.activeElement (focus-containment) and/or move focus to first toolbar button + polite announce on appear"
    - "Add Tab-walk e2e spec asserting toolbar reachability + Enter activation in firefox and webkit"
    - "Document NVDA selection gesture (Firefox-native browse-mode Shift+arrows) and NVDA activation note in ACCEPTANCE-PROTOCOL.md Flow C1/C3"
    - "Re-run ACPT-05 per D13-06 after fix lands"
  debug_session: ".planning/debug/flowc-selection-toolbar-nvda.md"

### G7 — ACPT-05 Flow C (post-G6 build): Tab bypasses selection toolbar to Previous Page under NVDA+Firefox
status: diagnosed
- truth: "With text selected in the reader under NVDA+Firefox, Tab reaches the selection toolbar (role=toolbar, accessible name 'Highlight actions') and Enter on the 'Highlight' button creates a mark (ACCEPTANCE-PROTOCOL.md v1.0, Flow C steps C2–C3) on the G6-fixed build"
  reason: "User reported: fail - tab goes to previous page button on tab with text selected in NVDA, no selection toolbar appears"
  severity: major
  test: 4
  root_cause: "The 13-11 Tab routing exists only in a window keydown listener (ArticleView.tsx L758-784), and its enabling assumption (encoded verbatim in the passing e2e, toolbar-tab-path.spec.ts L70-71: 'REAL Tab — the exact key NVDA browse mode passes through to Firefox') is false. NVDA browse mode binds Tab as its own navigation gesture and never delivers a Tab keydown to the page (NVDA User Guide: focus mode is where keys pass through; NVDA+f2 exists because browse-mode-bound keys don't reach the app). Under the documented Flow C sequence (C1 browse-mode Shift+arrows, C2 Tab), NVDA consumes the Tab and moves DOM focus itself via accessibility APIs to the next focusable from the virtual caret: the Previous page control. With no keydown, the routing never engages; Gecko then collapses the selection synchronously inside the focus move, and the selectionchange collapsed branch clears the toolbar state — the focus-containment hold doesn't apply because activeElement is outside the toolbar. Toolbar unmounts: G6's exact observable through a path the fix structurally cannot intercept. Both a product defect and a protocol-doc defect (Flow C C2 says only 'Tab to it' with no NVDA focus-mode instruction). Verified live in firefox: real Tab keydown (Phase A) routes correctly and the toolbar survives; keydown-less programmatic focus to Previous page from the identical pre-state (Phase B, what NVDA produces) collapses the selection inside focus() and unmounts the toolbar with zero keydowns — G7 reproduced byte-for-byte."
  artifacts:
    - path: "src/routes/ArticleView.tsx"
      issue: "Tab routing (L758-784) is keydown-only — no defense against keydown-less focus moves; containment hold (L894-900) only guards activeElement inside the toolbar"
    - path: "docs/ACCEPTANCE-PROTOCOL.md"
      issue: "Flow C2 lacks the NVDA focus-mode (NVDA+Space) instruction; C1 keeps the tester in browse mode through C2; C3's 'browse mode passes Enter through' note encodes the same wrong model"
    - path: "tests/e2e/annotations/toolbar-tab-path.spec.ts"
      issue: "L70-71 false comment ('REAL Tab — the exact key NVDA browse mode passes through'); no spec emulates the keydown-less focus sequence NVDA produces — automation gap that hid G7's recurrence"
  missing:
    - "Protocol fix: Flow C2 must instruct NVDA focus mode (NVDA+Space) before Tab — the current build already works in focus mode (verified live in firefox, Phase A)"
    - "Product fix (choose in planning): focus-on-appear for the toolbar (debounced until selection settles) using the existing containment/saved-range machinery — works with zero page-visible keydowns, i.e., under browse mode too; or accept focus-mode-only reachability and document it"
    - "E2e: add a keydown-less-focus spec (today it reproduces G7) and correct the false spec comment"
    - "Manual NVDA re-run should confirm whether 'Highlight actions available.' is heard after C1 (toolbar mount pre-Tab); re-run ACPT-05 Flow C per D13-06 after fix lands"
  debug_session: ".planning/debug/g7-nvda-tab-bypass-selection-toolbar.md"
