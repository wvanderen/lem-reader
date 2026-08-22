---
status: diagnosed
phase: 13-polish-and-acceptance
source: [13-VERIFICATION.md]
started: 2026-08-19T00:00:00.000Z
updated: 2026-08-22T21:05:00.000Z
---

## Current Test

number: 7
name: ACPT-05 Flow C re-run on ACCEPTANCE-PROTOCOL v1.2 (NVDA+Firefox)
expected: |
  On NVDA+Firefox/Windows, re-execute Flow C (C1–C4) against protocol v1.2: C1 — enable Native Selection Mode FIRST (NVDA+shift+f10, NVDA >= 2024.1; toggle confirmation heard), THEN browse-mode Shift+arrows selection, listening for the "Highlight actions available." mount cue (older NVDA: F7 caret browsing + focus-mode Shift+arrows fallback per the protocol note); C2 NVDA+Space then Tab; C3 Enter creates mark.highlight with "Highlight saved."; C4 verify. Record outcomes in 13-VERIFICATION.md Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only on zero blocker/major (D13-06/D13-07). Known pinned boundary (not a finding): with Native Selection Mode OFF, browse-mode selections live only in NVDA's virtual buffer — the page is structurally selection-blind (platform boundary, pinned by toolbar-mount-selection-gated.spec.ts).
awaiting: user response

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
resolution: Root cause diagnosed (G7) and closed by 13-12 — NVDA browse mode consumes the Tab keydown itself and moves DOM focus via accessibility APIs; per decision G7-D1 the reachability contract is focus-mode-only, documented in protocol v1.1 (NVDA+Space at C2) and pinned by the keydown-less boundary e2e. Re-run Flow C per Current Test 5.

### 5. ACPT-05 Flow C re-run on ACCEPTANCE-PROTOCOL v1.1 (NVDA+Firefox)
expected: On NVDA+Firefox/Windows, re-execute Flow C (C1–C4) against the G6+G7-fixed build using the v1.1 protocol: C1 browse-mode Shift+arrows selection — listen for the "Highlight actions available." mount announcement (the toolbar-appeared cue); C2 NVDA+Space to enter focus mode FIRST (listen for NVDA's focus-mode toggle confirmation), THEN Tab; C3 Enter on the focused Highlight button creates mark.highlight with the polite "Highlight saved." confirmation. Record outcomes in 13-VERIFICATION.md Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only on zero blocker/major (D13-06/D13-07). Known pinned boundary: a browse-mode Tab WITHOUT NVDA+Space still lands on Previous page and unmounts the toolbar — documented + recoverable (re-select, NVDA+Space, Tab), not a finding. Any NEW blocker/major follows fix-then-re-run; minors are recorded and deferred.
result: issue
reported: "Toolbar is still not appearing even after NVDA+space. I never hear the 'highlight actions available'"
severity: major
detail: Failure occurs at C1 — the toolbar appears to never mount (no "Highlight actions available." announce-on-appear heard after browse-mode Shift+arrows selection), so the failure precedes the C2 focus-mode/Tab path entirely. Distinct observable from G6 (mounted, unmounted on focus move) and G7 (keydown-less Tab bypass in browse mode): here the mount/announcement itself is not observed under NVDA+Firefox.
resolution: Root cause diagnosed (G8) and closed by 13-13 — a protocol-premise defect, not a code regression: with Native Selection Mode OFF (any default NVDA), browse-mode Shift+arrows selections exist only in NVDA's virtual buffer and never reach the Firefox document selection, so no page-side code can observe them (platform boundary; page mount path exonerated). Protocol v1.2 C1 now instructs NVDA+shift+f10 BEFORE the selection, documents the F7 fallback + boundary, and the boundary is pinned by the new 3-engine selection-gated spec (6/6). ZERO production source changes. Re-run Flow C per Current Test 7.

### 6. VoiceOver+Safari supplementary re-walk incl. the toolbar announce-on-appear surface (optional, non-gating)
expected: Optionally re-walk the Appendix §3 checklist for the v2.0 surface groups (library/browse-search-tags, ingest incl. calm refusals, review panel, export/import dialogs, book groupings) — now including the 13-11 toolbar announce-on-appear surface, which post-dates the Test 2 pass. NOT an ACPT-05 gate (D13-05) — supplementary evidence on the user's own schedule; record notes in Appendix §3.2.
result: pass

### 7. ACPT-05 Flow C re-run on ACCEPTANCE-PROTOCOL v1.2 (NVDA+Firefox)
expected: On NVDA+Firefox/Windows, re-execute Flow C (C1–C4) against protocol v1.2: C1 — enable Native Selection Mode FIRST (NVDA+shift+f10, NVDA >= 2024.1; toggle confirmation heard), THEN browse-mode Shift+arrows selection, listening for the "Highlight actions available." mount cue (older NVDA: F7 caret browsing + focus-mode Shift+arrows fallback per the protocol note); C2 NVDA+Space then Tab; C3 Enter on the focused Highlight button creates mark.highlight with the polite "Highlight saved." confirmation; C4 verify. Record outcomes in 13-VERIFICATION.md Appendix §1.3 findings + §1.4 checklist + verdict; ACPT-05 flips from Pending only on zero blocker/major (D13-06/D13-07). Residual to confirm: NVDA verbalizes the mount announce in browse mode with native selection ON. Known pinned boundary (not a finding): with Native Selection Mode OFF, browse-mode selections live only in NVDA's virtual buffer — the page is structurally selection-blind (platform boundary, pinned by toolbar-mount-selection-gated.spec.ts).
result: [pending]

## Summary

total: 7
passed: 3
issues: 0
pending: 1
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
status: resolved
closed_by: 13-12 (commits f09c58d keydown-less boundary/recovery spec, 59c3470 ACCEPTANCE-PROTOCOL v1.1) — decision G7-D1: focus-on-appear REJECTED (Gecko/WebKit visual-selection destruction + unwinnable debounce race + SR disorientation); focus-mode-only reachability accepted as the platform convention and documented (C2 NVDA+Space before Tab, C1 mount-announcement cue, C3 focus-mode-anchored); browse-mode boundary pinned by the new toolbar-keydownless-focus.spec.ts; false Tab-equivalence comment corrected in toolbar-tab-path.spec.ts. ZERO production source changes (G7-D1 compliance). Independently re-verified 2026-08-22 (verifier's own 15/15 toolbar cells across chromium/firefox/webkit + line-by-line protocol diff inspection + zero-src-diff proof 7521cf2..cb1527d; orchestrator's honest full-suite gate exit 0: unit 1262/0/13 + e2e 1113/0/10). ACPT-05 stays Pending the tester's v1.1 re-run (Test 5).
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

### G8 — ACPT-05 Flow C (v1.1 protocol): selection toolbar never mounts under NVDA+Firefox — no "Highlight actions available." announcement
status: diagnosed
- truth: "On NVDA+Firefox (protocol v1.1), after browse-mode Shift+arrows text selection (C1) the selection toolbar mounts with the polite 'Highlight actions available.' announce-on-appear cue, and after NVDA+Space then Tab (C2) Enter on the Highlight button creates the highlight (C3)"
  status: failed
  reason: "User reported: Toolbar is still not appearing even after NVDA+space. I never hear the 'highlight actions available'"
  severity: major
  test: 5
  root_cause: "PROTOCOL-PREMISE DEFECT (platform boundary, not a code regression). Protocol v1.1 Flow C C1 documents the NVDA selection gesture as 'browse-mode Shift+arrows (Firefox-native selection)' — false on default NVDA configurations. Per the NVDA User Guide (§Native Selection Mode), browse-mode Shift+arrows selects only within NVDA's virtual-buffer representation, 'not within the application itself', and the selection is not visible on screen; the Firefox document selection follows only when Native Selection Mode is enabled (NVDA+shift+f10, off by default; per-document toggle since NVDA 2024.1, persistent setting 2026.3, also off by default). NVDA source (gecko_ia2.py _setSelectionOffsets) pushes the selection to the document only under _nativeAppSelectionMode. Under the documented C1 gesture, document.getSelection() never becomes non-collapsed → ArticleView's selectionchange listener (L867-957) never reaches its valid branch → selectionRect/captureResult stay null → SelectionToolbar never mounts → no announce-on-appear → C2's Tab routing (requires toolbarRectActiveRef) cannot engage. The tester hears NVDA speak the buffer selection while the page is selection-blind. Also retroactively explains why no NVDA run (G6/G7/G8) ever observed a mounted toolbar. Page-side mount path exonerated: no origin/suppression gates; programmatic selections still mount the toolbar in firefox (toolbar-tab-path.spec.ts green; 13-12 shipped zero source changes); all annotations e2e use programmatic selections, so selection CREATION was never automated under real NVDA — the C1 premise was never verified."
  artifacts:
    - path: "docs/ACCEPTANCE-PROTOCOL.md"
      issue: "Flow C C1 (L196) encodes the false premise — 'browse-mode Shift+arrows (Firefox-native selection)' — and expects a mount cue that cannot occur on default NVDA; C2/C3 inherit the broken pre-state"
    - path: "src/routes/ArticleView.tsx"
      issue: "L867-957 selectionchange-driven mount is correctly built but structurally requires a page-visible document selection — unreachable by construction under default browse mode (not defective; context)"
    - path: "src/reader/annotations/SelectionToolbar.tsx"
      issue: "L148-156, L176, L193-194 announce-on-appear/mount gating correctly implemented; same structural dependency (not defective; context)"
  missing:
    - "Protocol v1.2: C1 must instruct NVDA users to enable Native Selection Mode (NVDA+shift+f10, NVDA >= 2024.1) BEFORE browse-mode Shift+arrows; correct the false '(Firefox-native selection)' parenthetical"
    - "Protocol v1.2: document the fallback for older NVDA (F7 caret browsing + focus-mode selection) and the platform boundary (native selection OFF = no page-side fix can observe browse-mode selections)"
    - "Re-run ACPT-05 Flow C on protocol v1.2 (D13-06); residual to confirm: NVDA verbalizes the mount announce in browse mode with native selection ON"
  debug_session: ".planning/debug/g8-toolbar-never-mounts-nvda.md"
