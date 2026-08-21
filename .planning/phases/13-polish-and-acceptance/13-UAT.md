---
status: diagnosed
phase: 13-polish-and-acceptance
source: [13-VERIFICATION.md]
started: 2026-08-19T00:00:00.000Z
updated: 2026-08-21T21:54:42Z
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

### 2. VoiceOver+Safari supplementary checklist (v2.0 surfaces)
expected: Walk the Appendix §3 checklist for the five v2.0 surface groups (library, markdown/epub/pdf intake, export/import, review, header/nav polish) — now including the G4 placeholder and G5 tag-popover/drawer-export surfaces. NOT an ACPT-05 gate — supplementary coverage on the user's own schedule; record notes in the appendix.
result: pass

### 3. Visual acceptance of the G5 redesign (recommended)
expected: Human eyeball of the G5 closure on real hardware: top-bar tag popover (open/edit/light-dismiss), compact provenance-only article-top spot, Export highlights in the annotations drawer. G5 originated as a design rejection, so a final visual sign-off closes what specs cannot pin.
result: pass

## Summary

total: 3
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
status: diagnosed
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
